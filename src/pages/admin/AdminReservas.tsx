import { confirmDialog } from '../../components/confirm'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import type { Reservation, Vehicle } from '../../lib/types'
import { friendlyError } from '../../lib/errors'
import { addDays, fmtDateTime, fmtDuration, fromLocalInput, startOfDay, toLocalInput } from '../../lib/format'
import Modal from '../../components/Modal'

const toDateInput = (d: Date) => toLocalInput(d).slice(0, 10)

export default function AdminReservas() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Reservation[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [from, setFrom] = useState(toDateInput(startOfDay(new Date())))
  const [to, setTo] = useState(toDateInput(addDays(new Date(), 30)))
  const [vehicleId, setVehicleId] = useState('')
  const [status, setStatus] = useState<'confirmada' | 'cancelada' | ''>('confirmada')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [maint, setMaint] = useState<{ vehicle_id: string; start: string; end: string; purpose: string } | null>(null)

  useEffect(() => {
    supabase.from('vehicles').select('*').order('model').then(({ data }) => setVehicles((data as Vehicle[]) ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('reservations')
      .select('*, vehicle:vehicles(plate,brand,model), profile:profiles!reservations_user_id_fkey(full_name,email)')
      .lt('starts_at', addDays(new Date(to + 'T00:00'), 1).toISOString())
      .gt('ends_at', new Date(from + 'T00:00').toISOString())
      .order('starts_at')
      .limit(1000)
    if (vehicleId) q = q.eq('vehicle_id', vehicleId)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) setError(friendlyError(error))
    setRows((data as Reservation[]) ?? [])
    setLoading(false)
  }, [from, to, vehicleId, status])

  useEffect(() => {
    load()
  }, [load])

  async function cancel(r: Reservation) {
    if (!(await confirmDialog(`Cancelar a reserva de ${r.profile?.full_name || r.profile?.email}? O usuário será notificado por e-mail.`))) return
    const { error } = await supabase.rpc('cancel_reservation', { p_id: r.id })
    if (error) setError(friendlyError(error))
    load()
  }

  async function saveMaint(e: FormEvent) {
    e.preventDefault()
    if (!maint || !profile) return
    const s = fromLocalInput(maint.start)
    const en = fromLocalInput(maint.end)
    if (!s || !en || en <= s) return setError('Período inválido.')
    const { error } = await supabase.from('reservations').insert({
      vehicle_id: maint.vehicle_id,
      user_id: profile.id,
      starts_at: s.toISOString(),
      ends_at: en.toISOString(),
      kind: 'manutencao',
      purpose: maint.purpose || 'Manutenção',
    })
    if (error) return setError(friendlyError(error))
    setMaint(null)
    setError(null)
    load()
  }

  function exportCsv() {
    const header = ['Retirada', 'Devolução', 'Duração', 'Veículo', 'Placa', 'Usuário', 'E-mail', 'Tipo', 'Status', 'Destino', 'Motivo', 'Passageiros']
    const lines = rows.map((r) => [
      fmtDateTime(r.starts_at),
      fmtDateTime(r.ends_at),
      fmtDuration(r.starts_at, r.ends_at),
      `${r.vehicle?.brand ?? ''} ${r.vehicle?.model ?? ''}`,
      r.vehicle?.plate ?? '',
      r.profile?.full_name ?? '',
      r.profile?.email ?? '',
      r.kind,
      r.status,
      r.destination ?? '',
      r.purpose ?? '',
      r.passengers ?? '',
    ])
    const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `reservas_${from}_a_${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const now = new Date()

  return (
    <div className="card">
      <div className="row between wrap">
        <h1>Todas as reservas</h1>
        <div className="row gap">
          <button className="btn" onClick={exportCsv} disabled={!rows.length}>Exportar CSV</button>
          <button
            className="btn primary"
            onClick={() =>
              setMaint({ vehicle_id: vehicles.find((v) => v.active)?.id ?? '', start: toLocalInput(new Date()), end: toLocalInput(addDays(new Date(), 1)), purpose: '' })
            }
          >
            Bloquear p/ manutenção
          </button>
        </div>
      </div>

      <div className="filters">
        <label>De<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Até<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>
          Veículo
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Todos</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.model} – {v.plate}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="confirmada">Confirmadas</option>
            <option value="cancelada">Canceladas</option>
            <option value="">Todas</option>
          </select>
        </label>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Período</th>
              <th>Veículo</th>
              <th>Usuário</th>
              <th>Destino / motivo</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="center"><div className="spinner" /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="muted center">Nenhuma reserva no período.</td></tr>
            )}
            {!loading &&
              rows.map((r) => {
                const inUse = r.status === 'confirmada' && new Date(r.starts_at) <= now && new Date(r.ends_at) > now
                return (
                  <tr key={r.id} className={r.status === 'cancelada' ? 'inactive' : ''}>
                    <td>
                      <div>{fmtDateTime(r.starts_at)}</div>
                      <div className="small muted">até {fmtDateTime(r.ends_at)} · {fmtDuration(r.starts_at, r.ends_at)}</div>
                    </td>
                    <td>{r.vehicle?.model} <span className="plate">{r.vehicle?.plate}</span></td>
                    <td>
                      {r.kind === 'manutencao' ? <span className="badge orange">Manutenção</span> : (
                        <>
                          <div>{r.profile?.full_name}</div>
                          <div className="small muted">{r.profile?.email}</div>
                        </>
                      )}
                    </td>
                    <td className="small">{[r.destination, r.purpose].filter(Boolean).join(' — ')}</td>
                    <td>
                      {r.status === 'cancelada' ? <span className="badge gray">Cancelada</span>
                        : inUse ? <span className="badge green">Em uso</span>
                        : new Date(r.ends_at) < now ? <span className="badge gray">Concluída</span>
                        : <span className="badge blue">Confirmada</span>}
                    </td>
                    <td className="actions">
                      {r.status === 'confirmada' && new Date(r.ends_at) > now && (
                        <button className="btn sm danger" onClick={() => cancel(r)}>Cancelar</button>
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {maint && (
        <Modal title="Bloquear veículo para manutenção" onClose={() => setMaint(null)}>
          <form className="form" onSubmit={saveMaint}>
            <p className="small muted">O período ficará indisponível para reservas. Se já houver reservas no período, cancele-as antes.</p>
            {error && <div className="alert error">{error}</div>}
            <label>
              Veículo
              <select value={maint.vehicle_id} onChange={(e) => setMaint({ ...maint, vehicle_id: e.target.value })} required>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.model} – {v.plate}</option>
                ))}
              </select>
            </label>
            <div className="grid-2">
              <label>Início<input type="datetime-local" value={maint.start} onChange={(e) => setMaint({ ...maint, start: e.target.value })} required /></label>
              <label>Fim<input type="datetime-local" value={maint.end} onChange={(e) => setMaint({ ...maint, end: e.target.value })} required /></label>
            </div>
            <label>Descrição<input value={maint.purpose} onChange={(e) => setMaint({ ...maint, purpose: e.target.value })} placeholder="Ex.: Revisão 40.000 km" /></label>
            <div className="row gap end">
              <button type="button" className="btn" onClick={() => setMaint(null)}>Cancelar</button>
              <button className="btn primary">Bloquear</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
