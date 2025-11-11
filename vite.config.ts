import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Actions exposes GITHUB_REPOSITORY; use it to derive the Pages base path.
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = process.env.GITHUB_ACTIONS && repoName ? `/${repoName}/` : '/'

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    open: false
  }
})
