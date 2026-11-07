/** biome-ignore-all lint/performance/noAwaitInLoops: <> */

import { cp, rm } from 'node:fs/promises';
import { $ } from 'bun';
import pMap from 'p-map';
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
import { generateSectionBanner } from '../section-banner-generator/section-banner-generator.ts';

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

export const buildAlumniSections = async (configs: Config[], branch?: string) => {
  // Build section website template
  const sectionWebsiteDir = `${BUILD_DIR}/esn-section-website`;

  // build template
  await gitClone(
    'https://github.com/ESNGermany/esn-section-website.git',
    sectionWebsiteDir,
    branch,
  );
  await yarnInstall(sectionWebsiteDir);
  await rm(`${sectionWebsiteDir}/src/assets/logo/DE-logo-colour.png`);
  await rm(`${sectionWebsiteDir}/src/assets/section-logos`, { recursive: true});
  await yarnBuild(sectionWebsiteDir);
  const sectionTemplateDir = `${sectionWebsiteDir}/dist/esn-sections-website/browser`;
  const placerholderFiles = await findPlaceholders(
    sectionTemplateDir,
    Array.from(Placeholder.keys()),
  );

  // biome-ignore lint/suspicious/noConsole: CLI progress output is intended
  console.log(`Found ${placerholderFiles.length} files with placeholders.`);
  // biome-ignore lint/suspicious/noConsole: CLI progress output is intended
  console.log('Copying website template ...');
  await pMap(
    configs,
    async ({ cname, name }) => {
      const sectionDir = `${BUILD_DIR}/new-sites/${cname}`;
      await cp(sectionTemplateDir, sectionDir, { recursive: true });

      // generate section banner
      name = name.replace("ESN ", "")
      await generateSectionBanner(name, `${sectionDir}/assets/logo/DE-logo-colour.png`)
    },
    { concurrency: MAX_CONCURRENCY },
  );

  // biome-ignore lint/suspicious/noConsole: CLI progress output is intended
  console.log('Replacing placeholder values ...');
  await pMap(
    placerholderFiles,
    async ([f, matches]) => {
      // for each file

      const text = await Bun.file(`${sectionTemplateDir}/${f}`).text();
      matches.sort((a, b) => b[0] - a[0]); // sort reverse

      for (const config of configs) {
        // for each section

        const sectionDir = `${BUILD_DIR}/new-sites/${config.cname}`;
        let s = text; // copy

        for (const [pos, len] of matches) {
          // for each placeholder

          const fn = Placeholder.get(s.slice(pos, pos + len));
          if (!fn) {
            throw new Error(`Unknown placeholder: ${s.slice(pos, pos + len)}`);
          }
          const value = await fn(config);

          s = s.slice(0, pos) + value + s.slice(pos + len);
        }

        await Bun.write(`${sectionDir}/${f}`, s);
      }
    },
    { concurrency: MAX_CONCURRENCY },
  );

  // biome-ignore lint/suspicious/noConsole: CLI progress output is intended
  console.log('Hashing files ...');
  await pMap(
    configs,
    async ({ cname }) => {
      // ngsw-config joins its arguments onto process.cwd(), so absolute paths break.
      // Run from the template repo and pass paths relative to it.
      await $`./node_modules/.bin/ngsw-config ../new-sites/${cname} ngsw-config.json /`.cwd(
        sectionWebsiteDir,
      );
    },
    { concurrency: MAX_CONCURRENCY },
  );

  await rm(`${sectionWebsiteDir}`, { recursive: true });
};
