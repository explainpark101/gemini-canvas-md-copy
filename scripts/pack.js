import { createWriteStream, readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import archiver from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');
const srcDir = join(rootDir, 'src');
const versionsDir = join(rootDir, 'versions');

const COPY_EXCLUDE = ['content.ts', 'content.js', 'context-menu-handler.ts', 'context-menu-handler.js', 'background.ts', 'background.js', 'html-to-markdown.ts'];

function buildScripts() {
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  const scripts = [
    ['content.ts', 'content.js'],
    ['context-menu-handler.ts', 'context-menu-handler.js'],
    ['background.ts', 'background.js'],
  ];
  for (const [src, out] of scripts) {
    const result = spawnSync('bun', ['build', join(srcDir, src), '--outdir', distDir], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      throw new Error(`bun build failed: ${src}`);
    }
    console.log(`Built ${src} -> dist/${out}`);
  }
}

function copyFilesFromSrcToDist() {
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  const files = readdirSync(srcDir, { withFileTypes: true });
  for (const file of files) {
    if (file.isFile() && !COPY_EXCLUDE.includes(file.name)) {
      copyFileSync(join(srcDir, file.name), join(distDir, file.name));
    }
  }
  console.log('Copied src/ -> dist/ (excluding content.ts)');
}

function getVersion() {
  const manifestPath = join(distDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  return manifest.version || '1.0.0';
}

async function buildIcons() {
  await import('./build-icons.js');
}

async function createZip() {
  const files = await readdir(distDir, { withFileTypes: true });
  const archive = archiver('zip', { zlib: { level: 9 } });
  const output = createWriteStream(zipPath);

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`Created: ${zipPath} (${(archive.pointer() / 1024).toFixed(1)} KB)`);
      resolve();
    });
    archive.on('error', reject);
    archive.pipe(output);

    for (const f of files) {
      const fullPath = join(distDir, f.name);
      if (f.isFile()) {
        archive.file(fullPath, { name: f.name });
      }
    }
    archive.finalize();
  });
}

buildScripts();
copyFilesFromSrcToDist();
await buildIcons();

const version = getVersion();
if (!existsSync(versionsDir)) {
  mkdirSync(versionsDir, { recursive: true });
}
const zipPath = join(versionsDir, `gemini-canvas-md-copy-${version}.zip`);
await createZip();
