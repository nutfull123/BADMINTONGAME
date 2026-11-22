import { defineConfig } from 'vite';

// Builds the game server for Node: one file, dist-server/index.js. Packages (ws, supabase-js) stay external and are
// installed in the Docker image; our own code (src/ rules, physics, sim) is bundled in.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { format: 'es', entryFileNames: 'index.js' } },
  },
});
