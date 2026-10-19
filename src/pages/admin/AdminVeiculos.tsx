import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Vehicle } from '../../lib/types'
import { friendlyError } from '../../lib/errors'
import Modal from '../../components/Modal'

const empty: Omit<Vehicle, 'id'> = {
  plate: '',
  brand: '',
  model: '',
  color: '',
  year: new Date().getFullYear(),
  seats: 5,
  location: '',
  notes: '',
  active: true,
}

export default function AdminVeiculos() {
  const [rows, setRows] = useState<Vehicle[]>([])
  const [editing, setEditing] = useState<(Omit<Vehicle, 'id'> & { id?: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('vehicles').select('*').order('active', { ascending: false }).order('model')
    setRows((data as Vehicle[]) ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    setError(null)
    const { id, ...payload } = editing
    const clean = {
      ...payload,
      plate: payload.plate.trim().toUpperCase().replace(/\s+/g, ''),
      brand: payload.brand.trim(),
      model: payload.model.trim(),
      color: payload.color?.trim() || null,
      location: payload.location?.trim() || null,
      notes: payload.notes?.trim() || null,
      year: payload.year || null,
      seats: payload.seats || null,
    }
    const { error } = id
      ? await supabase.from('vehicles').update(clean).eq('id', id)
      : await supabase.from('vehicles').insert(clean)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setEditing(null)
    load()
  }

  async function toggle(v: Vehicle) {
    const msg = v.active
      ? `Desativar ${v.model} (${v.plate})? Ele deixará de aparecer para reservas. Reservas já feitas não são canceladas.`
      : `Reativar ${v.model} (${v.plate})?`
    if (!confirm(msg)) return
    await supabase.from('vehicles').update({ active: !v.active }).eq('id', v.id)
    load()
  }

  const set = <K extends keyof Vehicle>(k: K, val: Vehicle[K]) => setEditing((p) => (p ? { ...p, [k]: val } : p))

  return (
    <div className="card">
      <div className="row between wrap">
        <h1>Veículos</h1>
        <button className="btn primary" onClick={() => { setError(null); setEditing({ ...empty }) }}>
          + Novo veículo
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Placa</th>
              <th>Veículo</th>
              <th>Cor / Ano</th>
              <th>Lugares</th>
              <th>Local</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted center">
                  Nenhum veículo cadastrado.
                </td>
              </tr>
            )}
            {rows.map((v) => (
              <tr key={v.id} className={v.active ? '' : 'inactive'}>
                <td><span className="plate">{v.plate}</span></td>
                <td>{v.brand} {v.model}</td>
                <td>{[v.color, v.year].filter(Boolean).join(' / ')}</td>
                <td>{v.seats}</td>
                <td>{v.location}</td>
                <td>{v.active ? <span className="badge green">Ativo</span> : <span className="badge gray">Inativo</span>}</td>
                <td className="actions">
                  <button className="btn sm" onClick={() => { setError(null); setEditing({ ...v }) }}>Editar</button>
                  <button className="btn sm" onClick={() => toggle(v)}>{v.active ? 'Desativar' : 'Ativar'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Editar veículo' : 'Novo veículo'} onClose={() => setEditing(null)}>
          <form className="form" onSubmit={save}>
            {error && <div className="alert error">{error}</div>}
            <div className="grid-3">
              <label>
                Placa
                <input value={editing.plate} onChange={(e) => set('plate', e.target.value)} required placeholder="ABC1D23" />
              </label>
              <label>
                Marca
                <input value={editing.brand} onChange={(e) => set('brand', e.target.value)} required />
              </label>
              <label>
                Modelo
                <input value={editing.model} onChange={(e) => set('model', e.target.value)} required />
              </label>
              <label>
                Cor
                <input value={editing.color ?? ''} onChange={(e) => set('color', e.target.value)} />
              </label>
              <label>
                Ano
                <input type="number" value={editing.year ?? ''} onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)} />
              </label>
              <label>
                Lugares
                <input type="number" min={1} value={editing.seats ?? ''} onChange={(e) => set('seats', e.target.value ? Number(e.target.value) : null)} />
              </label>
            </div>
            <label>
              Local de retirada / unidade
              <input value={editing.location ?? ''} onChange={(e) => set('location', e.target.value)} placeholder="Ex.: Matão – Portaria 1" />
            </label>
            <label>
              Observações
              <textarea rows={2} value={editing.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Ex.: Chave na portaria; cartão combustível no porta-luvas" />
            </label>
            <label className="check">
              <input type="checkbox" checked={editing.active} onChange={(e) => set('active', e.target.checked)} />
              Disponível para reservas
            </label>
            <div className="row gap end">
              <button type="button" className="btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
