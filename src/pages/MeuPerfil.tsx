import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'

export default function MeuPerfil() {
  const { profile, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
  const [phone, setPhone] = useState('')
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name)
    setDepartment(profile.department ?? '')
    setPhone(profile.phone ?? '')
  }, [profile])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), department: department.trim() || null, phone: phone.trim() || null })
      .eq('id', profile.id)
    setBusy(false)
    if (error) setMsg({ type: 'error', text: friendlyError(error) })
    else {
      setMsg({ type: 'success', text: 'Dados atualizados.' })
      refreshProfile()
    }
  }

  return (
    <div className="card narrow">
      <h1>Meu perfil</h1>
      <p className="muted">{profile?.email}</p>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <form className="form" onSubmit={onSubmit}>
        <label>
          Nome completo
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label>
          Área / Departamento
          <input value={department} onChange={(e) => setDepartment(e.target.value)} />
        </label>
        <label>
          Telefone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <div className="row gap">
          <button className="btn primary" disabled={busy}>
            Salvar
          </button>
          <Link className="btn" to="/definir-senha">
            Alterar senha
          </Link>
        </div>
      </form>
    </div>
  )
}
