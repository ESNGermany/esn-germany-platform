/** biome-ignore-all lint/performance/noAwaitInLoops: <> */

import { cp, rm } from 'node:fs/promises';
import { $ } from 'bun';
import pLimit from 'p-limit';
import type { Config } from '../types.ts';
import { getMetaDescription, replaceInFile, TMP_DIR, URL } from '../utils.ts';

const MAX_CONCURRENT_BUILDS: number = 4;

export const buildAlumniSections = async (configs: Config[], branch?: string) => {
  const branchArgs = branch ? ['-b', branch] : [];

  const websiteDir: string = `${TMP_DIR}/esn-section-website`;
  await $`git clone ${branchArgs} https://github.com/ESNGermany/esn-section-website.git ${websiteDir}`;
  await $`yarn --cwd ${websiteDir} install`;
  await Bun.file(`${websiteDir}/src/assets/logo/DE-logo-colour.png`).delete();

  const buildSection = async ({ id, name, email, cname } : Config) => {
    const domain = `${cname}.${URL}`;
    const sectionDir: string = `${TMP_DIR}/sections/${cname}`;

    await cp(websiteDir, sectionDir, { recursive: true });
    const logo = Bun.file(`${sectionDir}/src/assets/section-logos/${email}.png`);
    await Bun.write(`${sectionDir}/src/assets/logo/DE-logo-colour.png`, logo);
    await replaceInFile(`${sectionDir}/src/environments/environment.prod.ts`, 'REPLACE_SECTION_NAME', name);
    await replaceInFile(`${sectionDir}/src/environments/environment.prod.ts`, 'REPLACE_SECTION_ID', id);
    await replaceInFile(`${sectionDir}/src/sitemap.xml`, 'REPLACE_SECTION_URL', domain);
    await replaceInFile(`${sectionDir}/src/robots.txt`, 'REPLACE_SECTION_URL', domain);

    await replaceInFile(
      `${sectionDir}/src/index.html`,
      'REPLACE_META_DESCRIPTION',
      await getMetaDescription(id),
    );

    await replaceInFile(`${sectionDir}/src/index.html`, 'REPLACE_SECTION_NAME', name);
    await $`yarn --cwd ${sectionDir} build --configuration production`;

    await cp(
      `${sectionDir}/dist/esn-sections-website/browser`,
      `${TMP_DIR}/new-sites/${cname}`,
      { recursive: true },
    );

    await rm(`${sectionDir}`, { recursive: true });
  }

  // Build sections concurrently
  // Limit concurrent builds to avoid out of memory errors
  const limit = pLimit(MAX_CONCURRENT_BUILDS);
  await Promise.all(configs.map((c) => limit(() => buildSection(c))));

  await rm(websiteDir, { recursive: true });
};
