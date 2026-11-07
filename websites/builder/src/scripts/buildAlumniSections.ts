/** biome-ignore-all lint/performance/noAwaitInLoops: <> */

import { cp, mkdir, rm } from 'node:fs/promises';
import { $ } from 'bun';
import pMap from 'p-map';
import { generateSectionBanner } from '../section-banner-generator/section-banner-generator.ts';
import type { Config } from '../types.ts';
import {
  BUILD_DIR,
  emptyDir,
  findPlaceholders,
  getMetaDescription,
  gitClone,
  MAX_CONCURRENCY,
  mv,
  symbolRegex,
  URL,
  yarnBuild,
  yarnInstall,
} from '../utils.ts';

const SECTION_WEBSITE_REPO = 'https://github.com/ESNGermany/esn-section-website.git';

// replacement logic
const Placeholder = new Map<string, (config: Config) => string | Promise<string>>([
  [
    'REPLACE_SECTION_NAME',
    (config: Config) => {
      return `${config.name}`;
    },
  ],
  [
    'REPLACE_SECTION_CNAME',
    (config: Config) => {
      return `${config.cname}`;
    },
  ],
  [
    'REPLACE_SECTION_ID',
    (config: Config) => {
      return `${config.id}`;
    },
  ],
  [
    'REPLACE_SECTION_URL',
    (config: Config) => {
      return `${config.cname}.${URL}`;
    },
  ],
  ['REPLACE_META_DESCRIPTION', (config: Config) => getMetaDescription(config.id)],
]);
const PLACEHOLDER_REGEX = symbolRegex(Array.from(Placeholder.keys()), 'g');

/**
 * Clones, installs and builds the section website template.
 * The section logos are removed first, because they are generated per section later.
 *
 * @param websiteDir - Directory the template repository is cloned into and built in.
 * @param branch - Branch of the template repository to build.
 * @returns Directory containing the built (placeholder) template.
 */
const buildTemplate = async (websiteDir: string, branch: string) => {
  await gitClone(SECTION_WEBSITE_REPO, websiteDir, branch);
  await emptyDir(`${websiteDir}/src/assets/section-logos`);
  await yarnInstall(websiteDir);
  await yarnBuild(websiteDir);

  return `${websiteDir}/dist/esn-sections-website/browser`;
};

/**
 * Generates the section banners.
 *
 * @param configs - Sections to create a copy for. Each copy is written to `new-sites/<cname>`.
 */
const generateBanners = async (configs: Config[]) => {
  await pMap(
    configs,
    async ({ cname, name }) => {
      const sectionDir = `${BUILD_DIR}/new-sites/${cname}`;
      await mkdir(sectionDir, { recursive: true });

      const bannerName = name.replace('ESN ', '');
      await generateSectionBanner(bannerName, `${sectionDir}/assets/logo/DE-logo-colour.png`);
    },
    { concurrency: MAX_CONCURRENCY },
  );
};

/**
 * Resolves the value of every placeholder for a single section.
 *
 * @param config - Section the placeholder values are taken from.
 * @returns The value of each placeholder, by placeholder name.
 */
const resolvePlaceholders = async (config: Config) => {
  const entries = await Promise.all(
    Array.from(Placeholder, async ([key, resolve]) => [key, await resolve(config)] as const),
  );

  return new Map(entries);
};

/**
 * Replaces all placeholders in a file's text.
 *
 * @param text - Content of the template file.
 * @param values - Value of each placeholder, as returned by `resolvePlaceholders`.
 * @returns The text with every placeholder replaced by its value.
 * @throws If a placeholder in `text` has no value.
 */
const replacePlaceholdersInText = (text: string, values: Map<string, string>) => {
  return text.replace(PLACEHOLDER_REGEX, (key) => {
    const value = values.get(key);
    if (value === undefined) {
      throw new Error(`Unknown placeholder: ${key}`);
    }
    return value;
  });
};

/**
 * Writes every template file that contains placeholders once per section, with the values replaced.
 *
 * @param templateDir - Directory containing the built template, which is searched for placeholders.
 * @param configs - Sections to write the replaced files for, into `new-sites/<cname>`.
 */
const replacePlaceholders = async (
  placeholderFiles: Set<string>,
  templateDir: string,
  configs: Config[],
) => {
  const sections = await Promise.all(
    configs.map(async (config) => ({
      cname: config.cname,
      values: await resolvePlaceholders(config),
    })),
  );

  await pMap(
    placeholderFiles,
    async (file) => {
      const text = await Bun.file(`${templateDir}/${file}`).text();

      for (const { cname, values } of sections) {
        await Bun.write(
          `${BUILD_DIR}/new-sites/${cname}/${file}`,
          replacePlaceholdersInText(text, values),
        );
      }
    },
    { concurrency: MAX_CONCURRENCY },
  );
};

/** The service worker manifest that the Angular build writes next to the website files. */
const MANIFEST_FILE = 'ngsw.json';

interface AssetGroup {
  name: string;
  urls: string[];
}

/** The parts of `ngsw.json` that differ between the template and a section. */
interface Manifest {
  timestamp: number;
  assetGroups: AssetGroup[];
  hashTable: Record<string, string>;
}

/**
 * Combines the manifest of the template with the manifest of a section's own files.
 *
 * The result lists every file of the template, with the hashes of the section's own versions
 * of `index.html`, `main.js` and so on, and with the section's own files added to the URLs
 * of their asset groups, such as the banner. Everything else is taken from the template.
 *
 * @param template - Manifest of the built template, which covers all of its files.
 * @param section - Manifest generated for the files that only exist in the section folder.
 * @returns The manifest to write into the section folder.
 */
const mergeManifests = (template: Manifest, section: Manifest): Manifest => ({
  ...template,
  timestamp: section.timestamp,
  hashTable: { ...template.hashTable, ...section.hashTable },
  assetGroups: template.assetGroups.map((group) => {
    const own = section.assetGroups.find((sectionGroup) => sectionGroup.name === group.name);
    return { ...group, urls: [...new Set([...group.urls, ...(own?.urls ?? [])])] };
  }),
});

/**
 * Regenerates the service worker file hashes (`ngsw.json`) for every section.
 * Has to run after the placeholders are replaced, because the hashes cover the final files.
 *
 * @param websiteDir - Directory of the template repository, which provides `ngsw-config` and `ngsw-config.json`.
 * @param configs - Sections whose `new-sites/<cname>` folder is rehashed.
 * @param templateManifest - If given, the section folders only hold their own files. The manifest
 *   generated for them is then merged into this one, which covers the shared files. Otherwise
 *   the generated manifest is kept as it is.
 */
const rehashFiles = async (websiteDir: string, configs: Config[], templateManifest?: Manifest) => {
  await pMap(
    configs,
    async ({ cname }) => {
      // ngsw-config joins its arguments onto process.cwd(), so absolute paths break.
      // Run from the template repo and pass paths relative to it.
      await $`./node_modules/.bin/ngsw-config ../../new-sites/${cname} ngsw-config.json /`.cwd(
        websiteDir,
      );

      if (templateManifest) {
        const path = `${BUILD_DIR}/new-sites/${cname}/${MANIFEST_FILE}`;
        const own = (await Bun.file(path).json()) as Manifest;
        await Bun.write(path, JSON.stringify(mergeManifests(templateManifest, own), null, 2));
      }
    },
    { concurrency: MAX_CONCURRENCY },
  );
};

/**
 * Builds the section website for each given section and writes the results to `new-sites/<cname>`.
 * The template is built once and then copied and customised per section.
 *
 * @param configs - Sections to build a website for.
 */
export const buildSections = async (configs: Config[]) => {
  const branch = 'main';
  const websiteDir = `${BUILD_DIR}/esn-section-website/${branch}`;

  const templateDir = await buildTemplate(websiteDir, branch);
  const uniqueFiles = new Set(await findPlaceholders(templateDir, Array.from(Placeholder.keys())));

  // read before the move: the manifest of the template covers all of its files, shared or not
  const templateManifest = (await Bun.file(`${templateDir}/${MANIFEST_FILE}`).json()) as Manifest;

  // every section gets its own manifest, so the one of the template stays out of the shared folder
  await mv(
    templateDir,
    `${BUILD_DIR}/new-sites/_shared`,
    (file) => !uniqueFiles.has(file) && file !== MANIFEST_FILE,
  );

  await generateBanners(configs);
  await replacePlaceholders(uniqueFiles, templateDir, configs);
  await rehashFiles(websiteDir, configs, templateManifest);

  await rm(websiteDir, { recursive: true });
};

/**
 * Builds the alumni website and writes the results to `new-sites/<cname>`.
 *
 * @param configs - Config to build the website with.
 */
export const buildAlumni = async (configs: Config[]) => {
  const branch = 'Alumni_site';
  const websiteDir = `${BUILD_DIR}/esn-section-website/${branch}`;

  const templateDir = await buildTemplate(websiteDir, branch);
  await cp(templateDir, `${BUILD_DIR}/new-sites/alumni`, { recursive: true });
  const uniqueFiles = new Set(await findPlaceholders(templateDir, Array.from(Placeholder.keys())));

  await generateBanners(configs);
  await replacePlaceholders(uniqueFiles, templateDir, configs);
  await rehashFiles(websiteDir, configs);

  await rm(websiteDir, { recursive: true });
};
