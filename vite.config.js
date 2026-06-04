import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['all'],
    proxy: {
      '/sheets-csv': {
        target: 'https://docs.google.com',
        changeOrigin: true,
        rewrite: (path) => path.replace('/sheets-csv', '/spreadsheets/d/e/2PACX-1vQ04WCKS8CMYHwd-6Ae5MAN5sYpEhJ3RiYMoxtX0SroNoeuYjxMhWfbVvQAy2xuKAnk62F6VeC4blhC/pub'),
      },
    },
  },
})
