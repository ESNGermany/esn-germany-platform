/** biome-ignore-all lint/performance/noAwaitInLoops: <> */

import { cp, rm } from 'node:fs/promises';
import { $ } from 'bun';
import pLimit from 'p-limit';
import type { Config } from '../types.ts';
import { getMetaDescription, replaceInFile, TMP_DIR, URL } from '../utils.ts';

export const buildAlumniSections = async (configs: Config[], branch?: string) => {
  const branchArgs = branch ? ['-b', branch] : [];
  await $`git clone ${branchArgs} https://github.com/ESNGermany/esn-section-website.git ${TMP_DIR}/repo`;
  await $`yarn --cwd ${TMP_DIR}/repo install`;
  await Bun.file(`${TMP_DIR}/repo/src/assets/logo/DE-logo-colour.png`).delete();

  const buildSection = async ({ id, name, email, cname } : Config) => {
    const domain = `${cname}.${URL}`;
    await cp(`${TMP_DIR}/repo`, `${TMP_DIR}/${cname}`, { recursive: true });
    const logo = Bun.file(`${TMP_DIR}/${cname}/src/assets/section-logos/${email}.png`);
    await Bun.write(`${TMP_DIR}/${cname}/src/assets/logo/DE-logo-colour.png`, logo);
    await replaceInFile(`${TMP_DIR}/${cname}/src/environments/environment.prod.ts`, 'REPLACE_SECTION_NAME', name);
    await replaceInFile(`${TMP_DIR}/${cname}/src/environments/environment.prod.ts`, 'REPLACE_SECTION_ID', id);
    await replaceInFile(`${TMP_DIR}/${cname}/src/sitemap.xml`, 'REPLACE_SECTION_URL', domain);
    await replaceInFile(`${TMP_DIR}/${cname}/src/robots.txt`, 'REPLACE_SECTION_URL', domain);

    await replaceInFile(
      `${TMP_DIR}/${cname}/src/index.html`,
      'REPLACE_META_DESCRIPTION',
      await getMetaDescription(id),
    );

    await replaceInFile(`${TMP_DIR}/${cname}/src/index.html`, 'REPLACE_SECTION_NAME', name);
    await $`yarn --cwd ${TMP_DIR}/${cname} build --configuration production`;

    await cp(
      `${TMP_DIR}/${cname}/dist/esn-sections-website/browser`,
      `${TMP_DIR}/new-sites/${cname}`,
      { recursive: true },
    );

    await rm(`${TMP_DIR}/${cname}`, { recursive: true });
  }


  // Build sections concurrently
  // Limit concurrent builds to avoid out of memory errors
  const maxConccurrentBuilds: number = 4;
  const limit = pLimit(maxConccurrentBuilds);
  await Promise.all(configs.map((c) => limit(() => buildSection(c))));

  await rm(`${TMP_DIR}/repo`, { recursive: true });
};
