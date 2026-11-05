import { cp, rm } from 'node:fs/promises';
import { ALUMNI_CONFIGS, SECTION_CONFIGS } from './config.ts';
import { buildAlumniSections } from './scripts/buildAlumniSections.ts';
import { buildCaddyfile } from './scripts/buildCaddyfile.ts';
import { buildNational } from './scripts/buildNational.ts';
import { BUILD_DIR, emptyDir } from './utils.ts';

await emptyDir(BUILD_DIR); // cleanup folder from last builds

// biome-ignore lint/suspicious/noConsole: CLI progress output is intended
console.log('[1/5] Building national website');
await buildNational();

// biome-ignore lint/suspicious/noConsole: CLI progress output is intended
console.log('[2/5] Building alumni website');
await buildAlumniSections(ALUMNI_CONFIGS, 'Alumni_site');

// biome-ignore lint/suspicious/noConsole: CLI progress output is intended
console.log('[3/5] Building sections websites');
await buildAlumniSections(SECTION_CONFIGS);

// biome-ignore lint/suspicious/noConsole: CLI progress output is intended
console.log('[4/5] Building caddy file');
await buildCaddyfile();

// biome-ignore lint/suspicious/noConsole: CLI progress output is intended
console.log('[5/5] Cleaning up');
await emptyDir('./dist/sites');
await cp(`${BUILD_DIR}/new-sites`, './dist/sites', { recursive: true });
await rm(`${BUILD_DIR}/new-sites`, { recursive: true });
