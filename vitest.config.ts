import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // src/** tests run in jsdom (browser-like) for React components
    // electron/** tests run in node for main-process logic
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts'],
    exclude: ['dist-electron/**', 'node_modules/**'],
    environmentMatchPatterns: [
      [/src\//, 'jsdom'],
      [/electron\//, 'node'],
    ],
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.ts'],
      exclude: ['**/*.test.*', '**/node_modules/**'],
    },
  },
})
