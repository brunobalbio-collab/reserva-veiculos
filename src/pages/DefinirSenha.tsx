import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'

export default function DefinirSenha() {
  const { profile, clearMustSetPassword, mustSetPassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.')
    if (password !== confirm) return setError('As senhas não conferem.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setDone(true)
  }

  function continuar() {
    clearMustSetPassword()
    navigate('/', { replace: true })
  }

  const body = (
    <div className={mustSetPassword ? 'login-card' : 'card narrow'}>
      <h1>{mustSetPassword ? `Bem-vindo${profile?.full_name ? ', ' + profile.full_name.split(' ')[0] : ''}!` : 'Alterar senha'}</h1>
      {done ? (
        <>
          <div className="alert success">Senha definida com sucesso.</div>
          <button className="btn primary block" onClick={continuar}>
            Continuar
          </button>
        </>
      ) : (
        <form className="form" onSubmit={onSubmit}>
          <p className="muted">Crie uma senha com pelo menos 8 caracteres.</p>
          {error && <div className="alert error">{error}</div>}
          <label>
            Nova senha
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label>
            Confirmar senha
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
          <button className="btn primary block" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar senha'}
          </button>
        </form>
      )}
    </div>
  )

  return mustSetPassword ? <div className="login-screen">{body}</div> : body
}
