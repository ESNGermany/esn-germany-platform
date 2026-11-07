/** biome-ignore-all lint/performance/noAwaitInLoops: <> */

import { cp, rm } from 'node:fs/promises';
import { $ } from 'bun';
import pMap from 'p-map';
import { generateSectionBanner } from '../section-banner-generator/section-banner-generator.ts';
import type { Config } from '../types.ts';
import {
  BUILD_DIR,
  findPlaceholders,
  getMetaDescription,
  gitClone,
  MAX_CONCURRENCY,
  URL,
  yarnBuild,
  yarnInstall,
} from '../utils.ts';

const SECTION_WEBSITE_REPO = 'https://github.com/ESNGermany/esn-section-website.git';

type PlaceholderMatches = [pos: number, len: number][];

// replacement logic
const Placeholder = new Map<string, (config: Config) => string | Promise<string>>([
  [
    'REPLACE_SECTION_NAME',
    (config: Config) => {
      return `${config.name}`;
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
  await yarnInstall(websiteDir);
  await rm(`${websiteDir}/src/assets/logo/DE-logo-colour.png`);
  await rm(`${websiteDir}/src/assets/section-logos`, { recursive: true });
  await yarnBuild(websiteDir);

  return `${websiteDir}/dist/esn-sections-website/browser`;
};

/**
 * Copies the built template to a folder per section and generates the section banner.
 *
 * @param templateDir - Directory containing the built template.
 * @param configs - Sections to create a copy for. Each copy is written to `new-sites/<cname>`.
 */
const copyTemplate = async (templateDir: string, configs: Config[]) => {
  await pMap(
    configs,
    async ({ cname, name }) => {
      const sectionDir = `${BUILD_DIR}/new-sites/${cname}`;
      await cp(templateDir, sectionDir, { recursive: true });

      const bannerName = name.replace('ESN ', '');
      await generateSectionBanner(bannerName, `${sectionDir}/assets/logo/DE-logo-colour.png`);
    },
    { concurrency: MAX_CONCURRENCY },
  );
};

/**
 * Replaces all placeholders in a file's text for a single section.
 *
 * @param text - Content of the template file.
 * @param matches - Placeholder positions in `text`, sorted from last to first, so that
 *   replacing one placeholder doesn't shift the positions of the remaining ones.
 * @param config - Section the placeholder values are taken from.
 * @returns The text with every placeholder replaced by its value.
 * @throws If a match in `text` is not a known placeholder.
 */
const replacePlaceholdersInText = async (
  text: string,
  matches: PlaceholderMatches,
  config: Config,
) => {
  let result = text;

  for (const [pos, len] of matches) {
    const key = result.slice(pos, pos + len);
    const resolve = Placeholder.get(key);
    if (!resolve) {
      throw new Error(`Unknown placeholder: ${key}`);
    }
    const value = await resolve(config);

    result = result.slice(0, pos) + value + result.slice(pos + len);
  }

  return result;
};

/**
 * Writes every template file that contains placeholders once per section, with the values replaced.
 *
 * @param templateDir - Directory containing the built template, which is searched for placeholders.
 * @param configs - Sections to write the replaced files for, into `new-sites/<cname>`.
 */
const replacePlaceholders = async (templateDir: string, configs: Config[]) => {
  const placeholderFiles = await findPlaceholders(templateDir, Array.from(Placeholder.keys()));

  await pMap(
    placeholderFiles,
    async ([file, matches]) => {
      const text = await Bun.file(`${templateDir}/${file}`).text();
      const lastToFirst = [...matches].sort((a, b) => b[0] - a[0]);

      for (const config of configs) {
        const replaced = await replacePlaceholdersInText(text, lastToFirst, config);
        await Bun.write(`${BUILD_DIR}/new-sites/${config.cname}/${file}`, replaced);
      }
    },
    { concurrency: MAX_CONCURRENCY },
  );
};

/**
 * Regenerates the service worker file hashes (`ngsw.json`) for every section.
 * Has to run after the placeholders are replaced, because the hashes cover the final files.
 *
 * @param websiteDir - Directory of the template repository, which provides `ngsw-config` and `ngsw-config.json`.
 * @param configs - Sections whose `new-sites/<cname>` folder is rehashed.
 */
const rehashFiles = async (websiteDir: string, configs: Config[]) => {
  await pMap(
    configs,
    async ({ cname }) => {
      // ngsw-config joins its arguments onto process.cwd(), so absolute paths break.
      // Run from the template repo and pass paths relative to it.
      await $`./node_modules/.bin/ngsw-config ../../new-sites/${cname} ngsw-config.json /`.cwd(
        websiteDir,
      );
    },
    { concurrency: MAX_CONCURRENCY },
  );
};

/**
 * Builds the section website for each given section and writes the results to `new-sites/<cname>`.
 * The template is built once and then copied and customised per section.
 *
 * @param configs - Sections to build a website for.
 * @param branch - Branch of the template repository to build.
 */
export const buildAlumniSections = async (configs: Config[], branch: string) => {
  const websiteDir = `${BUILD_DIR}/esn-section-website/${branch}`;

  const templateDir = await buildTemplate(websiteDir, branch);
  await copyTemplate(templateDir, configs);
  await replacePlaceholders(templateDir, configs);
  await rehashFiles(websiteDir, configs);

  await rm(websiteDir, { recursive: true });
};
