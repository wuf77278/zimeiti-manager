import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function appBaseRedirectPlugin(): Plugin {
  const redirect = (url: string | undefined, setLocation: (location: string) => void, end: () => void) => {
    if (url !== '/app') return false
    setLocation('/app/')
    end()
    return true
  }

  return {
    name: 'app-base-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const handled = redirect(
          req.url,
          (location) => {
            res.statusCode = 302
            res.setHeader('Location', location)
          },
          () => res.end(),
        )
        if (!handled) next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const handled = redirect(
          req.url,
          (location) => {
            res.statusCode = 302
            res.setHeader('Location', location)
          },
          () => res.end(),
        )
        if (!handled) next()
      })
    },
  }
}

/**
 * 开发时代理 /api → 后端。默认后端端口为 8001，避免和本机模型网关常用 8000 冲突。
 * 若后端不在 8001，可在 frontend/.env.development 中设置 VITE_API_PROXY_TARGET。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:8001'

  return {
    base: '/app/',
    plugins: [appBaseRedirectPlugin(), react()],
    server: {
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
        '/terms': {
          target,
          changeOrigin: true,
        },
        '/privacy': {
          target,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/')

            if (normalizedId.includes('node_modules')) {
              if (
                normalizedId.includes('/node_modules/react/') ||
                normalizedId.includes('/node_modules/react-dom/') ||
                normalizedId.includes('/node_modules/scheduler/') ||
                normalizedId.includes('/node_modules/react-router') ||
                normalizedId.includes('/node_modules/@remix-run/router')
              ) return 'vendor-react'
              if (normalizedId.includes('echarts')) return 'vendor-echarts'
              if (normalizedId.includes('@mui') || normalizedId.includes('@emotion')) return 'vendor-mui'
              if (normalizedId.includes('html2canvas')) return 'vendor-html2canvas'
            }
          },
        },
      },
    },
  }
})
