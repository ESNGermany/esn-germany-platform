import { cp, rm } from 'node:fs/promises';
import { ALUMNI_CONFIGS, SECTION_CONFIGS } from './config.ts';
import { buildAlumniSections } from './scripts/buildAlumniSections.ts';
import { buildCaddyfile } from './scripts/buildCaddyfile.ts';
import { buildNational } from './scripts/buildNational.ts';
import { emptyDir, TMP_DIR } from './utils.ts';

await buildNational();
await buildAlumniSections(ALUMNI_CONFIGS, 'Alumni_site');
await buildAlumniSections(SECTION_CONFIGS);
await buildCaddyfile();
await emptyDir('./dist/sites');
await cp(`${TMP_DIR}/new-sites`, './dist/sites', { recursive: true });
await rm(`${TMP_DIR}/new-sites`, { recursive: true });
