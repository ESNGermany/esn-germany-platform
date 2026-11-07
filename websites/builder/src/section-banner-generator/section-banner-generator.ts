import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';

GlobalFonts.registerFromPath(
  path.join(import.meta.dir, 'fonts/work-sans/static/WorkSans-Bold.ttf'),
  'Work Sans',
);

const BASE_IMAGE: string = path.join(import.meta.dir, 'template.png');
const TEXT_POS_X: number = 510;
const TEXT_POS_Y: number = 256;
const FONT_SIZE: number = 40;
const FONT_FAMILY: string = 'Work Sans';
const FONT_COLOR: string = '#ffffff';

/**
 * Generates a white section banner image.
 *
 * @param sectionName - Name of the section.
 * @param outPath - Output path of the generated section banner image.
 */
export async function generateSectionBanner(sectionName: string, outPath: string) {
  const bg = await loadImage(BASE_IMAGE);
  const canvas = createCanvas(bg.width, bg.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(bg, 0, 0);
  ctx.font = `bold ${FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.fillStyle = FONT_COLOR;
  ctx.textAlign = 'right';
  ctx.fillText(sectionName, TEXT_POS_X, TEXT_POS_Y);

  // save image
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
}

