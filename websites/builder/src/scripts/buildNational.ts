import { cp, rm } from 'node:fs/promises';
import { $ } from 'bun';
import { TMP_DIR } from '../utils.ts';

export const buildNational = async () => {
  const websiteDir: string = `${TMP_DIR}/esn-germany-website`;
  await $`git clone https://github.com/ESNGermany/esn-germany-website.git ${websiteDir}`;
  await $`yarn --cwd ${websiteDir} install`;
  await $`yarn --cwd ${websiteDir} build --configuration production`;

  await cp(`${websiteDir}/dist/esn-germany-website/browser`, `${TMP_DIR}/new-sites/@`, {
    recursive: true,
  });

  await rm(`${websiteDir}`, { recursive: true });
};
