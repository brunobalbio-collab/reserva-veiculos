import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'Reserva de Veículos'
const COMPANY = import.meta.env.VITE_COMPANY_NAME || 'Frota Compartilhada'

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const isAdmin = profile?.role === 'admin'
  const close = () => setOpen(false)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M3 14.5 4.7 10A2 2 0 0 1 6.6 8.7h10.8a2 2 0 0 1 1.9 1.3l1.7 4.5V18a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H6.5v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            </svg>
          </span>
          <div>
            <strong>{APP_NAME}</strong>
            <small>{COMPANY}</small>
          </div>
        </div>
        <button className="menu-toggle" aria-label="Menu" onClick={() => setOpen(!open)}>
          ☰
        </button>
        <nav className={`nav ${open ? 'open' : ''}`}>
          <NavLink to="/" end onClick={close}>
            Reservar
          </NavLink>
          <NavLink to="/minhas-reservas" onClick={close}>
            Minhas reservas
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" onClick={close}>
              Administração
            </NavLink>
          )}
          <NavLink to="/perfil" onClick={close} className="nav-user">
            {profile?.full_name?.split(' ')[0] || 'Perfil'}
          </NavLink>
          <button className="link-btn" onClick={signOut}>
            Sair
          </button>
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
