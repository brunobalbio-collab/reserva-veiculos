import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import App from './App'
import './styles.css'

// HashRouter: URLs no formato /#/rota — funciona no GitHub Pages sem configuração extra de servidor.
// Modo demonstração: simula o backend em memória (somente no build com VITE_DEMO=1)
if (import.meta.env.VITE_DEMO === '1') {
  const { installMockBackend } = await import('./demo/mockBackend')
  installMockBackend()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)
