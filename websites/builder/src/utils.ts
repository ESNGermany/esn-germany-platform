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

export const findPlaceholders = async (
  dir: string,
  symbols: string[],
): Promise<[file: string, matches: [pos: number, len: number][]][]> => {
  // Recursively searches all files in a folder for symbols and returns them by file, position and length

  // build regex
  const alternatives = [...new Set(symbols)]
    .filter((s) => s.length > 0)
    .sort((a, b) => b.length - a.length) // longest first resolves prefix collisions
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (alternatives.length === 0) {
    return [];
  }

  const re = new RegExp(alternatives.join('|'), 'g');

  const files: string[] = [];
  const glob = new Bun.Glob('**/*.{html,htm,js,xml,txt,webmanifest}');
  for await (const file of glob.scan(dir)) {
    files.push(file);
  }

  files.sort();

  const found = await Promise.all(
    files.map(async (file): Promise<[string, [number, number][]]> => {
      const text = await Bun.file(join(dir, file)).text();
      const matches: [number, number][] = [];
      for (const m of text.matchAll(re)) {
        if (m.index === undefined) {
          throw new Error(`Missing match index in ${file}`);
        }
        matches.push([m.index, m[0].length]);
      }
      return [file, matches];
    }),
  );

  return found.filter(([, matches]) => matches.length > 0);
};

export const gitClone = async (repo: string, dest: string, branch?: string) => {
  const branchArgs = branch ? ['-b', branch] : [];
  return await $`git clone ${branchArgs} ${repo} ${dest}`;
};

export const yarnInstall = async (path: string) => {
  return await $`yarn --cwd ${path} install`;
};

export const yarnBuild = async (path: string) => {
  return await $`yarn --cwd ${path} build --configuration production`;
};
