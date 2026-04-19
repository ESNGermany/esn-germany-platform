import { exists, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WebsiteMainInformation } from './types.ts';

// biome-ignore lint/style/noProcessEnv: <>
// biome-ignore lint/complexity/useLiteralKeys: <>
export const URL = process.env?.['URL'] ?? 'localhost';
export const TMP_DIR = tmpdir();

export const getMetaDescription = async (id: string) => {
  const response = await fetch(
    `https://directus.${URL}/items/website_main_information?filter[section]=${id}`,
  );

  const websiteMainInformation = (await response.json()) as WebsiteMainInformation;

  return websiteMainInformation.data.pop()?.website_meta_description ?? '';
};

export const replaceInFile = async (filePath: string, search: string, replace: string) => {
  const content = await Bun.file(filePath).text();
  const updatedContent = content.replaceAll(search, replace);
  await Bun.write(filePath, updatedContent);
};

export const emptyDir = async (path: string) => {
  if (!(await exists(path))) {
    return;
  }

  const files = await readdir(path);
  await Promise.all(files.map(async (file) => await rm(join(path, file), { recursive: true })));
};
