import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages: https://lh-gwan.github.io/playable/
export default defineConfig({
  base: '/playable/',
  plugins: [react()],
})
