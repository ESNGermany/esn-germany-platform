import { cp, rm } from 'node:fs/promises';
import { BUILD_DIR, gitClone, yarnBuild, yarnInstall } from '../utils.ts';

export const buildNational = async () => {
  const websiteDir = `${BUILD_DIR}/esn-germany-website`;
  await gitClone('https://github.com/ESNGermany/esn-germany-website.git', websiteDir);
  await yarnInstall(websiteDir);
  await yarnBuild(websiteDir);

  await cp(`${websiteDir}/dist/esn-germany-website/browser`, `${BUILD_DIR}/new-sites/@`, {
    recursive: true,
  });

  await rm(`${websiteDir}`, { recursive: true });
};
