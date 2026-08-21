import { readdir, mkdir, readFile, unlink, link, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function walk(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full, base)));
    } else if (entry.isFile()) {
      files.push(path.relative(base, full));
    }
  }
  return files;
}

async function fileHash(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

export async function dedupeSections(sectionsDir: string, sharedDir: string) {
  const sectionNames = (await readdir(sectionsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name !== "@")
    .map((e) => e.name);

  // relPath -> section -> { fullPath, hash }
  const byRelPath = new Map<string, Map<string, { fullPath: string; hash: string }>>();

  for (const section of sectionNames) {
    const sectionDir = path.join(sectionsDir, section);
    const relPaths = await walk(sectionDir);
    for (const relPath of relPaths) {
      const fullPath = path.join(sectionDir, relPath);
      const hash = await fileHash(fullPath);
      if (!byRelPath.has(relPath)) byRelPath.set(relPath, new Map());
      byRelPath.get(relPath)!.set(section, { fullPath, hash });
    }
  }

  let dedupedCount = 0;

  for (const [relPath, entries] of byRelPath) {
    if (entries.size < 2) continue; // only in one section, nothing to share

    const hashes = new Set([...entries.values()].map((e) => e.hash));
    if (hashes.size !== 1) continue; // differs across sections, leave alone

    const sharedPath = path.join(sharedDir, relPath);
    await mkdir(path.dirname(sharedPath), { recursive: true });

    const [firstEntry] = entries.values();
    await cp(firstEntry.fullPath, sharedPath);

    for (const { fullPath } of entries.values()) {
      await unlink(fullPath);
      await link(sharedPath, fullPath);
    }

    dedupedCount++;
  }

  console.log(`Deduped ${dedupedCount} file(s) into ${sharedDir}`);
}