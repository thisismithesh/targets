import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true, // TEMP: turn off again once the blank-screen bug is fixed
  },
  server: {
    port: 3000,
    open: true,
  },
})
