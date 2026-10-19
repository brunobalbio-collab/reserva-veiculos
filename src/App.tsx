import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { supabaseConfigured } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import DefinirSenha from './pages/DefinirSenha'
import Reservar from './pages/Reservar'
import MinhasReservas from './pages/MinhasReservas'
import MeuPerfil from './pages/MeuPerfil'
import Admin from './pages/admin/Admin'

export default function App() {
  const { session, profile, loading, mustSetPassword } = useAuth()

  if (!supabaseConfigured) {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h1>Configuração pendente</h1>
          <p>
            Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (arquivo{' '}
            <code>.env.local</code> ou secrets do GitHub). Veja o README.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" aria-label="Carregando" />
      </div>
    )
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/definir-senha" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (mustSetPassword) return <DefinirSenha />

  if (profile && !profile.active) {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h1>Acesso desativado</h1>
          <p>Seu usuário está inativo. Procure o administrador da frota.</p>
          <LogoutButton />
        </div>
      </div>
    )
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Reservar />} />
        <Route path="minhas-reservas" element={<MinhasReservas />} />
        <Route path="perfil" element={<MeuPerfil />} />
        <Route path="definir-senha" element={<DefinirSenha />} />
        {isAdmin && <Route path="admin/*" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function LogoutButton() {
  const { signOut } = useAuth()
  return (
    <button className="btn" onClick={signOut}>
      Sair
    </button>
  )
}
