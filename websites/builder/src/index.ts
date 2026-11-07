import { cp, rm } from 'node:fs/promises';
import { ALUMNI_CONFIGS, SECTION_CONFIGS } from './config.ts';
import { buildAlumni, buildSections } from './scripts/buildAlumniSections.ts';
import { buildCaddyfile } from './scripts/buildCaddyfile.ts';
import { buildNational } from './scripts/buildNational.ts';
import { BUILD_DIR, emptyDir } from './utils.ts';

await emptyDir(BUILD_DIR); // cleanup folder from last builds

// biome-ignore lint/suspicious/noConsole: CLI progress output is intended
console.log('--- Build started ---');

const startTime = performance.now();

await Promise.all([buildNational(), buildAlumni(ALUMNI_CONFIGS), buildSections(SECTION_CONFIGS)]);

// biome-ignore lint/suspicious/noConsole: CLI progress output is intended
console.log('Building caddy file');
await buildCaddyfile();

// biome-ignore lint/suspicious/noConsole: CLI progress output is intended
console.log('Cleaning up');
await emptyDir('./dist/sites');
await cp(`${BUILD_DIR}/new-sites`, './dist/sites', { recursive: true });
await rm(`${BUILD_DIR}/new-sites`, { recursive: true });

const ms = 1000;
// biome-ignore lint/suspicious/noConsole: CLI progress output is intended
console.log(`Build took ${((performance.now() - startTime) / ms).toFixed(1)}s`);
