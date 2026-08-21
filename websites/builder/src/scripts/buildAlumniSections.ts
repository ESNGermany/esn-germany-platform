/** biome-ignore-all lint/performance/noAwaitInLoops: <> */

import { cp, rm, symlink } from 'node:fs/promises';
import { $ } from 'bun';
import pLimit from 'p-limit';
import type { Config } from '../types.ts';
import { getMetaDescription, replaceInFile, TMP_DIR, URL, cloneRepo, emptyDir } from '../utils.ts';
import { generateSectionBanner } from '../section-banner-generator/section-banner-generator.ts'

export const buildAlumniSections = async (configs: Config[], branch?: string) => {

  // Clone the esn website repository
  const websiteDir: string = `${TMP_DIR}/esn-section-website`
  await cloneRepo("https://github.com/ESNGermany/esn-section-website.git", websiteDir, branch);

  // Delete section banners
  await rm(`${websiteDir}/src/assets/section-logos`, { recursive: true });

  await $`yarn --cwd ${websiteDir} install`;
  await Bun.file(`${websiteDir}/src/assets/logo/DE-logo-colour.png`).delete();

  const buildSection = async ({ id, name, cname } : Config) => {
    const domain: string = `${cname}.${URL}`;
    const dir: string = `${TMP_DIR}/sections/${cname}`;

    console.log(`Building ${dir}`)

    // Copy build files
    await cp(websiteDir, dir, { recursive: true, dereference: false});

    // Generate section banner
    const cityName: string = name.replace("ESN ", "");
    console.log(`Generating section banner for ${cityName} ...`)
    await generateSectionBanner(cityName, `${dir}/src/assets/logo/DE-logo-colour.png`);

    await replaceInFile(`${dir}/src/environments/environment.prod.ts`, 'REPLACE_SECTION_NAME', name);
    await replaceInFile(`${dir}/src/environments/environment.prod.ts`, 'REPLACE_SECTION_ID', id);
    await replaceInFile(`${dir}/src/sitemap.xml`, 'REPLACE_SECTION_URL', domain);
    await replaceInFile(`${dir}/src/robots.txt`, 'REPLACE_SECTION_URL', domain);

    await replaceInFile(
      `${dir}/src/index.html`,
      'REPLACE_META_DESCRIPTION',
      await getMetaDescription(id),
    );

    await replaceInFile(`${dir}/src/index.html`, 'REPLACE_SECTION_NAME', name);
    await $`yarn --cwd ${dir} build --configuration production`;

    await cp(
      `${dir}/dist/esn-sections-website/browser`,
      `${TMP_DIR}/new-sites/${cname}`,
      { recursive: true},
    );    

    await rm(`${dir}`, { recursive: true });
  }

  // Build sections concurrently
  // Limit concurrent builds to avoid out of memory errors
  const maxConccurency: number = 4;
  const limit = pLimit(maxConccurency);
  await Promise.all(configs.map((c) => limit(() => buildSection(c))));

  // cleanup
  await rm(`${TMP_DIR}/sections`, { recursive: true });
  await rm(`${websiteDir}`, { recursive: true });
};