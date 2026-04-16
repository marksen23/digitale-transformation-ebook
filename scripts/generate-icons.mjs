#!/usr/bin/env node
// Generates PWA icon PNGs from SVG templates via sharp.
// Run: pnpm icons
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'client/public/icons');
mkdirSync(outDir, { recursive: true });

const normalSvg = readFileSync(resolve(__dirname, 'icon-template.svg'));
const maskSvg = readFileSync(resolve(__dirname, 'icon-maskable-template.svg'));

async function render(svg, size, file) {
  const out = resolve(outDir, file);
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(out);
  console.log(`✓ ${file} (${size}×${size})`);
}

await render(normalSvg, 192, 'icon-192.png');
await render(normalSvg, 512, 'icon-512.png');
await render(normalSvg, 180, 'apple-touch-icon.png');
await render(maskSvg, 512, 'icon-maskable-512.png');

// Favicon
await render(normalSvg, 32, 'favicon-32.png');

console.log('\nDone. Commit the files under client/public/icons/.');
