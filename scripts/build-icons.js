import sharp from 'sharp';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');
const svgPath = join(distDir, 'icon.svg');
const sizes = [16, 32, 48, 128];

await Promise.all(
  sizes.map((size) =>
    sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(join(distDir, `icon-${size}.png`))
  )
);

console.log('Icons built:', sizes.map((s) => `icon-${s}.png`).join(', '));
