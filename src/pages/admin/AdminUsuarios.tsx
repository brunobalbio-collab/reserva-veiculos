import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Profile, Role } from '../../lib/types'
import { friendlyError } from '../../lib/errors'
import { fmtDate } from '../../lib/format'
import Modal from '../../components/Modal'

interface InviteForm {
  email: string
  full_name: string
  department: string
  role: Role
}

/** Chama a Edge Function `admin-users` (usa a service role no servidor). */
async function adminCall(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    // Tenta extrair a mensagem retornada pela função
    const ctx = (error as { context?: Response }).context
    let msg: string | undefined
    if (ctx && typeof ctx.json === 'function') {
      try {
        msg = (await ctx.json())?.error
      } catch {
        /* resposta sem JSON */
      }
    }
    throw msg ? new Error(msg) : error
  }
  return data
}

export default function AdminUsuarios() {
  const { profile: me } = useAuth()
  const [rows, setRows] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [invite, setInvite] = useState<InviteForm | null>(null)
  const [edit, setEdit] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setRows((data as Profile[]) ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function sendInvite(e: FormEvent) {
    e.preventDefault()
    if (!invite) return
    setBusy(true)
    setError(null)
    try {
      await adminCall({ action: 'invite', ...invite, email: invite.email.trim().toLowerCase() })
      setInfo(`Convite enviado para ${invite.email}. O usuário receberá um link para criar a senha.`)
      setInvite(null)
      load()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(p: Profile) {
    if (p.id === me?.id) return
    if (!confirm(p.active ? `Desativar ${p.full_name || p.email}? Ele não conseguirá mais acessar o sistema.` : `Reativar ${p.full_name || p.email}?`)) return
    setError(null)
    try {
      await adminCall({ action: 'set_active', user_id: p.id, active: !p.active })
      load()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  async function toggleRole(p: Profile) {
    if (p.id === me?.id) return
    const role: Role = p.role === 'admin' ? 'user' : 'admin'
    if (!confirm(role === 'admin' ? `Tornar ${p.full_name || p.email} administrador?` : `Remover acesso de administrador de ${p.full_name || p.email}?`)) return
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id)
    if (error) setError(friendlyError(error))
    load()
  }

  async function sendAccessLink(p: Profile) {
    const redirectTo = window.location.origin + window.location.pathname
    const { error } = await supabase.auth.resetPasswordForEmail(p.email, { redirectTo })
    if (error) setError(friendlyError(error))
    else setInfo(`Link de acesso/redefinição de senha enviado para ${p.email}.`)
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!edit) return
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: edit.full_name.trim(), department: edit.department?.trim() || null, phone: edit.phone?.trim() || null })
      .eq('id', edit.id)
    if (error) return setError(friendlyError(error))
    setEdit(null)
    load()
  }

  const q = search.trim().toLowerCase()
  const filtered = rows.filter((p) => !q || `${p.full_name} ${p.email} ${p.department ?? ''}`.toLowerCase().includes(q))

  return (
    <div className="card">
      <div className="row between wrap">
        <h1>Usuários</h1>
        <div className="row gap">
          <input className="search" placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn primary" onClick={() => { setError(null); setInvite({ email: '', full_name: '', department: '', role: 'user' }) }}>
            + Cadastrar usuário
          </button>
        </div>
      </div>
      {info && <div className="alert success">{info}</div>}
      {error && !invite && <div className="alert error">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Área</th>
              <th>Perfil</th>
              <th>Status</th>
              <th>Desde</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'inactive'}>
                <td>{p.full_name || <span className="muted">—</span>}</td>
                <td>{p.email}</td>
                <td>{p.department}</td>
                <td>{p.role === 'admin' ? <span className="badge orange">Admin</span> : <span className="badge gray">Usuário</span>}</td>
                <td>{p.active ? <span className="badge green">Ativo</span> : <span className="badge gray">Inativo</span>}</td>
                <td className="small">{fmtDate(p.created_at)}</td>
                <td className="actions">
                  <button className="btn sm" onClick={() => setEdit({ ...p })}>Editar</button>
                  <button className="btn sm" onClick={() => sendAccessLink(p)} title="Envia e-mail para criar/redefinir senha">Enviar acesso</button>
                  {p.id !== me?.id && (
                    <>
                      <button className="btn sm" onClick={() => toggleRole(p)}>{p.role === 'admin' ? 'Remover admin' : 'Tornar admin'}</button>
                      <button className="btn sm" onClick={() => toggleActive(p)}>{p.active ? 'Desativar' : 'Ativar'}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invite && (
        <Modal title="Cadastrar usuário" onClose={() => setInvite(null)}>
          <form className="form" onSubmit={sendInvite}>
            <p className="small muted">O usuário receberá um e-mail com link para criar a própria senha.</p>
            {error && <div className="alert error">{error}</div>}
            <label>Nome completo<input value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} required /></label>
            <label>E-mail corporativo<input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required /></label>
            <label>Área / Departamento<input value={invite.department} onChange={(e) => setInvite({ ...invite, department: e.target.value })} /></label>
            <label>
              Perfil
              <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
                <option value="user">Usuário (faz reservas)</option>
                <option value="admin">Administrador (gerencia frota e usuários)</option>
              </select>
            </label>
            <div className="row gap end">
              <button type="button" className="btn" onClick={() => setInvite(null)}>Cancelar</button>
              <button className="btn primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar convite'}</button>
            </div>
          </form>
        </Modal>
      )}

      {edit && (
        <Modal title="Editar usuário" onClose={() => setEdit(null)}>
          <form className="form" onSubmit={saveEdit}>
            <p className="small muted">{edit.email}</p>
            <label>Nome completo<input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} required /></label>
            <label>Área / Departamento<input value={edit.department ?? ''} onChange={(e) => setEdit({ ...edit, department: e.target.value })} /></label>
            <label>Telefone<input value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
            <div className="row gap end">
              <button type="button" className="btn" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
