import { cp, rm } from 'node:fs/promises';
import { $ } from 'bun';
import { TMP_DIR } from '../utils.ts';

export const buildNational = async () => {
  await $`git clone https://github.com/ESNGermany/esn-germany-website.git ${TMP_DIR}/repo`;
  await $`yarn --cwd ${TMP_DIR}/repo install`;
  await $`yarn --cwd ${TMP_DIR}/repo build --configuration production`;

  await cp(`${TMP_DIR}/repo/dist/esn-germany-website/browser`, `${TMP_DIR}/new-sites/@`, {
    recursive: true,
  });

  await rm(`${TMP_DIR}/repo`, { recursive: true });
};
