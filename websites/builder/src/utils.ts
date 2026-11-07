import { exists, mkdir, readdir, rename, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import pMap from 'p-map';
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
 * Moves the files of a folder into another folder, optionally leaving some of them behind.
 * The folder structure is kept. Folders in `source` that are empty afterwards are removed,
 * except `source` itself.
 *
 * Existing files in `destination` are overwritten. Only files are moved, so folders that
 * contain no files are not recreated in `destination`. Source and destination have to be on
 * the same filesystem, because the files are renamed and not copied.
 *
 * @param source - Folder to move the files out of.
 * @param destination - Folder to move the files into. It is created if it doesn't exist.
 * @param filter - Called with the path of each file, relative to `source`. The file is moved
 *   if it returns `true` and stays in `source` if it returns `false`. Moves every file by default.
 */
export const mv = async (
  source: string,
  destination: string,
  filter: (file: string) => boolean = () => true,
) => {
  const allFiles = await Array.fromAsync(
    new Bun.Glob('**/*').scan({ cwd: source, dot: true, onlyFiles: true }),
  );
  const files = allFiles.filter(filter);

  await pMap(
    files,
    async (file) => {
      await mkdir(dirname(join(destination, file)), { recursive: true });
      await rename(join(source, file), join(destination, file));
    },
    { concurrency: MAX_CONCURRENCY },
  );

  // deepest folders first, so that a folder is empty by the time its parent is tried
  const directories = new Set<string>();
  for (const file of files) {
    for (let dir = dirname(file); dir !== '.'; dir = dirname(dir)) {
      directories.add(dir);
    }
  }
  for (const dir of [...directories].sort((a, b) => b.length - a.length)) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: the order matters, deepest folder first
      await rmdir(join(source, dir));
    } catch (error) {
      // a folder that still holds a file that was left behind stays
      if ((error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') {
        throw error;
      }
    }
  }
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

export const gitClone = async (repo: string, dest: string, branch = 'main', depth = 1) => {
  const branchArgs = branch ? ['-b', branch] : [];
  return await $`git clone --depth ${depth} ${branchArgs} ${repo} ${dest}`;
};

export const yarnInstall = async (path: string) => {
  // biome-ignore lint/suspicious/noConsole: CLI progress output is intended
  console.log(`installing: ${path}`);
  return await $`yarn --cwd ${path} install --frozen-lockfile --mutex file:/tmp/yarn-install.lock`.quiet();
};

export const yarnBuild = async (path: string) => {
  // biome-ignore lint/suspicious/noConsole: CLI progress output is intended
  console.log(`building ${path}`);
  return await $`yarn --cwd ${path} build --configuration production`.quiet();
};
