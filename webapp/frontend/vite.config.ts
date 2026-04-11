import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const basePath = process.env.PUBLIC_BASE_PATH || '/'

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    // Redirect /cecelearn to /cecelearn/ (trailing slash)
    {
      name: 'trailing-slash-redirect',
      configureServer(server) {
        const stripped = basePath.replace(/\/+$/, '')
        if (stripped) {
          server.middlewares.use((req, res, next) => {
            if (req.url === stripped) {
              res.writeHead(301, { Location: stripped + '/' })
              res.end()
              return
            }
            next()
          })
        }
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['cms.thesmart.cc'],
    proxy: {
      [`${basePath}api`]: {
        target: 'http://localhost:3014',
        rewrite: (path) => path.replace(new RegExp(`^${basePath}`), '/'),
      },
    },
  },
})
