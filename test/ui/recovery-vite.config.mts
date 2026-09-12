import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  root: process.cwd(),
  define: { 'process.env.NEXT_PUBLIC_SITE_URL': JSON.stringify('https://artbyme.studio') },
  plugins: [{
    name: 'isolate-recovery-auth-client',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === './client' && importer?.endsWith('/src/lib/supabase/auth.ts')) {
        return path.resolve('test/ui/recovery-client-mock.ts')
      }
    },
  }],
  resolve: { alias: {
    '@/lib/supabase/client': path.resolve('test/ui/recovery-client-mock.ts'),
    '@': path.resolve('src'),
    'next/link': path.resolve('test/ui/next-mock.tsx'),
  } },
  server: { host: '127.0.0.1', port: 4178, strictPort: true },
})
