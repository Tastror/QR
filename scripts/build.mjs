import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

// Publish only assets from the current source build.
await mkdir('dist/assets', { recursive: true });
const result = await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  minify: true,
  splitting: true,
  format: 'esm',
  target: ['es2020'],
  outdir: 'dist/assets',
  entryNames: '[name]-[hash]',
  chunkNames: '[name]-[hash]',
  metafile: true,
  legalComments: 'linked',
});
const [jsPath, jsInfo] = Object.entries(result.metafile.outputs).find(([, info]) => info.entryPoint === 'src/app.js');
const html = (await readFile('src/index.html', 'utf8'))
  .replace('__SCRIPT__', `/${jsPath.replace(/^dist\//, '')}`)
  .replace('__STYLE__', `/${jsInfo.cssBundle.replace(/^dist\//, '')}`);
await copyFile('src/favicon.svg', 'dist/favicon.svg');
await writeFile('dist/index.html', html);
const currentAssets = new Set(Object.keys(result.metafile.outputs).map((path) => resolve(path)));
for (const entry of await readdir('dist/assets', { withFileTypes: true })) {
  const path = resolve('dist/assets', entry.name);
  if (entry.isFile() && !currentAssets.has(path)) await unlink(path);
}
console.log(`Built ${Object.keys(result.metafile.outputs).length} assets.`);
