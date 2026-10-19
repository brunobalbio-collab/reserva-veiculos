import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'Reserva de Veículos'
const COMPANY = import.meta.env.VITE_COMPANY_NAME || 'Frota Compartilhada'

export default function Login() {
  const { linkError } = useAuth()
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(linkError)
  const [info, setInfo] = useState<string | null>(null)

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(friendlyError(error))
    setBusy(false)
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const redirectTo = window.location.origin + window.location.pathname
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    setBusy(false)
    if (error) setError(friendlyError(error))
    else setInfo('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.')
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-head">
          <span className="brand-mark lg" aria-hidden>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M3 14.5 4.7 10A2 2 0 0 1 6.6 8.7h10.8a2 2 0 0 1 1.9 1.3l1.7 4.5V18a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H6.5v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
            </svg>
          </span>
          <h1>{APP_NAME}</h1>
          <p className="muted">{COMPANY}</p>
        </div>

        {import.meta.env.VITE_DEMO === '1' && mode === 'login' && (
          <div className="demo-hint">
            <strong>Demonstração — entre como:</strong>
            <button type="button" className="link-btn" onClick={() => { setEmail('admin@demo.com'); setPassword('demo1234') }}>
              Administrador: admin@demo.com
            </button>
            <button type="button" className="link-btn" onClick={() => { setEmail('usuario@demo.com'); setPassword('demo1234') }}>
              Usuário comum: usuario@demo.com
            </button>
            <span className="muted small">Qualquer senha funciona. Os dados voltam ao início ao recarregar.</span>
          </div>
        )}
        {error && <div className="alert error">{error}</div>}
        {info && <div className="alert success">{info}</div>}

        {mode === 'login' ? (
          <form onSubmit={onLogin} className="form">
            <label>
              E-mail
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="btn primary block" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <button type="button" className="link-btn" onClick={() => { setMode('forgot'); setInfo(null); setError(null) }}>
              Esqueci minha senha
            </button>
          </form>
        ) : (
          <form onSubmit={onForgot} className="form">
            <p className="muted">Informe seu e-mail cadastrado para receber um link de redefinição.</p>
            <label>
              E-mail
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="btn primary block" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar link'}
            </button>
            <button type="button" className="link-btn" onClick={() => { setMode('login'); setInfo(null); setError(null) }}>
              Voltar ao login
            </button>
          </form>
        )}
        <p className="muted small center">Acesso restrito a usuários cadastrados pelo administrador.</p>
      </div>
    </div>
  )
}
