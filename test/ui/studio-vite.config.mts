import { defineConfig } from 'vite'
import path from 'node:path'
export default defineConfig({
  root: process.cwd(),
  resolve: {
    alias: {
      '@/lib/supabase/server': path.resolve('test/ui/server-mock.ts'),
      '@': path.resolve('src'),
      'next/navigation': path.resolve('test/ui/next-mock.tsx'),
      'next/link': path.resolve('test/ui/next-mock.tsx'),
    },
  },
  server: { host: '127.0.0.1', port: 4177, strictPort: true },
})
