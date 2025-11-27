import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        secure: false,
      },
      '/static': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        secure: false,
      },
      '/infographics': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        secure: false,
      },
      '/origin_images': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        secure: false,
      },
      '/generated_images': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        secure: false,
      },
      '/other_infographics': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        secure: false,
      },
      '/currentfilepath': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        secure: false,
      },
      '/authoring': {
        target: 'http://127.0.0.1:5176',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
