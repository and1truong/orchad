import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
const license = readFileSync(new URL('./node_modules/scorm-again/LICENSE', import.meta.url), 'utf8');
export default defineConfig({plugins: [{name: 'scorm-runtime-license', generateBundle(_options, bundle) {
  for (const output of Object.values(bundle)) if (output.type === 'chunk') output.code = '/*! scorm-again 3.4.5\n' + license + '\n*/\n' + output.code;
  this.emitFile({type: 'asset', fileName: 'LICENSE-scorm-again.txt', source: license});
}}], build: {outDir: 'dist/scorm', emptyOutDir: true,
  lib: {entry: 'src/client/scorm-content.ts', name: 'PearSCORMContent', formats: ['iife'], fileName: () => 'runtime.js'},
}});
