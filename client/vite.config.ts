import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces
    port: 3000,
    strictPort: true
  },
  define: {
    'process.env.GITHUB_TOKEN': JSON.stringify(process.env.VITE_GITHUB_TOKEN),
    'process.env.GITHUB_ENTERPRISE_NAME': JSON.stringify(process.env.VITE_GITHUB_ENTERPRISE_NAME),
    'process.env.MARS_ADMIN': JSON.stringify(process.env.VITE_MARS_ADMIN),
    'process.env.MARS_PASSWORD': JSON.stringify(process.env.VITE_MARS_PASSWORD)
  }
})