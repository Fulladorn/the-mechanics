/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, host: true },
  build: { target: 'es2022', outDir: 'dist' },
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
});
