import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Reservation } from '../lib/types'
import { friendlyError } from '../lib/errors'
import { fmtDuration, fmtRange } from '../lib/format'

export default function MinhasReservas() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<'proximas' | 'historico'>('proximas')
  const [rows, setRows] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const nowIso = new Date().toISOString()
    let q = supabase
      .from('reservations')
      .select('*, vehicle:vehicles(plate,brand,model)')
      .eq('user_id', profile.id)
      .eq('kind', 'reserva')
    q =
      tab === 'proximas'
        ? q.eq('status', 'confirmada').gte('ends_at', nowIso).order('starts_at', { ascending: true })
        : q.or(`status.eq.cancelada,ends_at.lt.${nowIso}`).order('starts_at', { ascending: false }).limit(100)
    const { data, error } = await q
    if (error) setError(friendlyError(error))
    setRows((data as Reservation[]) ?? [])
    setLoading(false)
  }, [profile, tab])

  useEffect(() => {
    load()
  }, [load])

  async function cancel(r: Reservation) {
    if (!confirm(`Cancelar a reserva do ${r.vehicle?.model} (${r.vehicle?.plate}) em ${fmtRange(r.starts_at, r.ends_at)}?`)) return
    const { error } = await supabase.rpc('cancel_reservation', { p_id: r.id })
    if (error) setError(friendlyError(error))
    load()
  }

  const now = new Date()

  return (
    <div className="card">
      <div className="row between wrap">
        <h1>Minhas reservas</h1>
        <Link className="btn primary" to="/">
          + Nova reserva
        </Link>
      </div>
      <div className="tabs">
        <button className={tab === 'proximas' ? 'active' : ''} onClick={() => setTab('proximas')}>
          Próximas
        </button>
        <button className={tab === 'historico' ? 'active' : ''} onClick={() => setTab('historico')}>
          Histórico
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {loading ? (
        <div className="spinner" />
      ) : rows.length === 0 ? (
        <p className="muted empty">{tab === 'proximas' ? 'Você não tem reservas futuras.' : 'Nenhuma reserva no histórico.'}</p>
      ) : (
        <ul className="res-list">
          {rows.map((r) => {
            const inProgress = r.status === 'confirmada' && new Date(r.starts_at) <= now && new Date(r.ends_at) > now
            return (
              <li key={r.id} className={`res-item ${r.status}`}>
                <div className="res-main">
                  <div className="res-when">
                    <strong>{fmtRange(r.starts_at, r.ends_at)}</strong>
                    <span className="small muted">{fmtDuration(r.starts_at, r.ends_at)}</span>
                  </div>
                  <div>
                    {r.vehicle?.brand} {r.vehicle?.model} <span className="plate">{r.vehicle?.plate}</span>
                  </div>
                  {(r.destination || r.purpose) && (
                    <div className="small muted">{[r.destination, r.purpose].filter(Boolean).join(' — ')}</div>
                  )}
                </div>
                <div className="res-actions">
                  {r.status === 'cancelada' ? (
                    <span className="badge gray">Cancelada</span>
                  ) : inProgress ? (
                    <span className="badge green">Em uso</span>
                  ) : new Date(r.ends_at) < now ? (
                    <span className="badge gray">Concluída</span>
                  ) : (
                    <>
                      <span className="badge blue">Confirmada</span>
                      <button className="btn sm danger" onClick={() => cancel(r)}>
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
