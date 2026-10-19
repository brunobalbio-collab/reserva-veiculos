import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Settings } from '../../lib/types'
import { friendlyError } from '../../lib/errors'

export default function AdminConfig() {
  const [s, setS] = useState<Settings | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    supabase.from('settings').select('max_duration_hours,max_advance_days,min_interval_minutes').eq('id', 1).maybeSingle()
      .then(({ data }) => setS(data as Settings))
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!s) return
    const { error } = await supabase.from('settings').update(s).eq('id', 1)
    setMsg(error ? { type: 'error', text: friendlyError(error) } : { type: 'success', text: 'Configurações salvas.' })
  }

  if (!s) return <div className="card"><div className="spinner" /></div>

  return (
    <form className="card narrow form" onSubmit={save}>
      <h1>Regras de reserva</h1>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <label>
        Duração máxima de uma reserva (horas)
        <input type="number" min={1} value={s.max_duration_hours} onChange={(e) => setS({ ...s, max_duration_hours: Number(e.target.value) })} />
      </label>
      <label>
        Antecedência máxima (dias)
        <input type="number" min={1} value={s.max_advance_days} onChange={(e) => setS({ ...s, max_advance_days: Number(e.target.value) })} />
      </label>
      <label>
        Intervalo mínimo entre reservas do mesmo veículo (minutos)
        <input type="number" min={0} step={5} value={s.min_interval_minutes} onChange={(e) => setS({ ...s, min_interval_minutes: Number(e.target.value) })} />
        <small className="muted">Útil para abastecimento/limpeza entre usos. 0 = sem intervalo.</small>
      </label>
      <p className="small muted">Administradores não estão sujeitos aos limites de duração e antecedência.</p>
      <button className="btn primary">Salvar</button>
    </form>
  )
}
