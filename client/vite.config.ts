import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://server:4000',  // Use Docker service name instead of localhost
        changeOrigin: true
      }
    }
  },
  define: {
    // Do not expose sensitive credentials to client-side code.
    // If you need to expose non-sensitive config, add it here.
  }
})