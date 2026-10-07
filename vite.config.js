import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'vite';

const dataSaveServiceWorker = () => {
  let outputDirectory = '';
  let publicDirectory = '';
  let bundledAssets = [];

  return {
    name: 'datasave-service-worker-precache',
    apply: 'build',
    configResolved(config) {
      outputDirectory = path.resolve(config.root, config.build.outDir);
      publicDirectory = config.publicDir
        ? path.resolve(config.root, config.publicDir)
        : '';
    },
    generateBundle(_, bundle) {
      bundledAssets = Object.keys(bundle)
        .filter((fileName) => /\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|webp|avif)$/i.test(fileName))
        .map((fileName) => ({
          url: `/${fileName}`,
          filePath: path.join(outputDirectory, fileName),
        }));
    },
    async writeBundle() {
      const workerPath = path.join(outputDirectory, 'sw.js');
      const worker = await readFile(workerPath, 'utf8');
      const publicFiles = [];
      const walkPublicDirectory = async (directory) => {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          const filePath = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            await walkPublicDirectory(filePath);
          } else if (entry.isFile() && entry.name !== 'sw.js') {
            const relativePath = path.relative(publicDirectory, filePath);
            const urlPath = relativePath
              .split(path.sep)
              .map(encodeURIComponent)
              .join('/');
            publicFiles.push({
              url: `/${urlPath}`,
              filePath: path.join(outputDirectory, relativePath),
            });
          }
        }
      };
      if (publicDirectory) await walkPublicDirectory(publicDirectory);

      const assetEntries = [
        { url: '/', filePath: path.join(outputDirectory, 'index.html') },
        { url: '/index.html', filePath: path.join(outputDirectory, 'index.html') },
        ...publicFiles,
        ...bundledAssets,
      ].filter(
        (asset, index, allAssets) =>
          allAssets.findIndex((candidate) => candidate.url === asset.url) === index,
      );
      const versionHash = createHash('sha256');
      versionHash.update(worker);
      for (const asset of assetEntries) {
        versionHash.update(asset.url);
        versionHash.update(await readFile(asset.filePath));
      }
      const cacheVersion = versionHash.digest('hex').slice(0, 16);
      const assets = assetEntries.map((asset) => asset.url);

      const builtWorker = worker
        .replace('__DATASAVE_PRECACHE_ASSETS__', JSON.stringify(assets))
        .replace('__DATASAVE_CACHE_VERSION__', cacheVersion);
      if (
        builtWorker.includes('__DATASAVE_PRECACHE_ASSETS__') ||
        builtWorker.includes('__DATASAVE_CACHE_VERSION__')
      ) {
        throw new Error('Could not inject the precache manifest into the service worker.');
      }
      await writeFile(
        workerPath,
        builtWorker,
      );
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl(), dataSaveServiceWorker()],
  server: {
    host: true, // expose on local network
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
});
