import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
