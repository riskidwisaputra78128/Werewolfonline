import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// mode: (default) server · static (P2P, satu file) · single (demo offline, satu file)
export default defineConfig(({ mode }) => {
  const single = mode === 'single' || mode === 'static';
  return {
    root: new URL('.', import.meta.url).pathname,
    plugins: single ? [viteSingleFile()] : [],
    define: { __MODE__: JSON.stringify(mode === 'static' ? 'static' : mode === 'single' ? 'offline' : 'server') },
    build: {
      outDir: mode === 'static' ? 'dist-static' : mode === 'single' ? 'dist-single' : 'dist',
      emptyOutDir: true, chunkSizeWarningLimit: 3000,
      rollupOptions: single ? { output: { format: 'iife', inlineDynamicImports: true } } : {},
    },
    server: { fs: { allow: ['..'] }, proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true }, '/api': 'http://localhost:3000' } },
  };
});
