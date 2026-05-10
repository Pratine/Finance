import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

// Vite only handles the React renderer. The Electron main process is compiled
// separately with tsc (see tsconfig.electron.json) to avoid bundler conflicts
// with Electron's built-in module system.
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
