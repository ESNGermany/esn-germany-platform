import { exists, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import type { WebsiteMainInformation } from './types.ts';

const MetaDescriptionCache: Map<string, Promise<string>> = new Map();

// biome-ignore lint/style/noProcessEnv: <>
// biome-ignore lint/complexity/useLiteralKeys: <>
export const URL = process.env?.['URL'] ?? 'localhost';
export const BUILD_DIR = `${tmpdir()}/esn-germany-platform/websites`;
export const MAX_CONCURRENCY = 64;

export const getMetaDescription = (id: string) => {
  let p = MetaDescriptionCache.get(id);

  // cache promise to avoid multiple duplicate requests caused by Promise.all()
  if (!p) {
    p = fetch(`https://directus.${URL}/items/website_main_information?filter[section]=${id}`)
      .then((r) => r.json() as Promise<WebsiteMainInformation>)
      .then((d) => d.data.pop()?.website_meta_description ?? '');
    MetaDescriptionCache.set(id, p);
  }

  return p;
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

/**
 * Builds a regex that matches any of the given symbols literally.
 *
 * @param symbols - Strings to match. Regex special characters are escaped.
 * @param flags - Regex flags, for example `g` to match every occurrence.
 */
export const symbolRegex = (symbols: string[], flags?: string) => {
  const alternatives = [...symbols]
    .sort((a, b) => b.length - a.length) // longest first resolves prefix collisions
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  return new RegExp(alternatives.join('|'), flags);
};

/**
 * Recursively searches the text files of a folder for any of the given symbols.
 *
 * @param dir - Folder to search.
 * @param symbols - Placeholder strings to look for.
 * @returns Paths, relative to `dir`, of the files that contain at least one symbol.
 */
export const findPlaceholders = async (dir: string, symbols: string[]) => {
  const re = symbolRegex(symbols);
  const files = await Array.fromAsync(
    new Bun.Glob('**/*.{html,htm,js,xml,txt,webmanifest}').scan(dir),
  );
  const texts = await Promise.all(files.map((file) => Bun.file(join(dir, file)).text()));

  return files.filter((_, i) => re.test(texts[i] ?? ''));
};

export const gitClone = async (repo: string, dest: string, branch: string = 'main', depth: number = 1) => {
  const branchArgs = branch ? ['-b', branch] : [];
  return await $`git clone --depth ${depth} ${branchArgs} ${repo} ${dest}`;
};

export const yarnInstall = async (path: string) => {
  console.log(`installing: ${path}`)
  return await $`yarn --cwd ${path} install --frozen-lockfile --mutex file:/tmp/yarn-install.lock`.quiet();
};

export const yarnBuild = async (path: string) => {
  console.log(`building ${path}`)
  return await $`yarn --cwd ${path} build --configuration production`.quiet();
};
