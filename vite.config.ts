import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em GitHub Pages o site fica em https://<org>.github.io/<repositorio>/
// O workflow de deploy define BASE_PATH automaticamente.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
  // Build de demonstração gera um único arquivo JS (para publicar como página única)
  build: process.env.VITE_DEMO === '1' ? { rollupOptions: { output: { inlineDynamicImports: true } } } : undefined,
})
