import { build as viteBuild } from 'vite';
import * as esbuild from 'esbuild';
import { execSync } from 'child_process';

import fs from 'fs';

async function buildApp() {
  const tscPath = './node_modules/typescript/bin/tsc';
  if (fs.existsSync(tscPath)) {
    console.log('Running TypeScript type check (tsc --noEmit)...');
    execSync(`node "${tscPath}" --noEmit`, { stdio: 'inherit' });
  } else {
    console.log('TypeScript binary not present in production install, skipping typecheck.');
  }

  console.log('Building frontend assets with Vite...');
  await viteBuild();

  console.log('Building production backend server with esbuild...');
  await esbuild.build({
    entryPoints: ['server.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    sourcemap: true,
    outfile: 'dist/server.js',
  });

  console.log('Production build completed successfully! Output in ./dist');
}

buildApp().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
