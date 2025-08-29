import { defineConfig } from 'tsup';
import svelte from 'esbuild-svelte';

export default defineConfig({
  entry: {
    background: 'src/background.ts',
    'popup/popup': 'src/popup/popup.ts',
    'options/options': 'src/options/options.ts',
  },
  outDir: 'build',
  format: ['iife'],
  target: 'chrome110',
  platform: 'browser',
  esbuildPlugins: [svelte()],
  define: {
    'process.env': '{}',
    'process.browser': 'true',
  },
  esbuildOptions(options) {
    // Inject a process shim for libraries expecting Node's process
    options.inject = options.inject || [];
    options.inject.push('src/shims/process-shim.ts');
  },
  minify: false,
  sourcemap: false,
  clean: true,
});

