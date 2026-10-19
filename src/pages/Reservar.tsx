import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { ScheduleItem, Settings, Vehicle } from '../lib/types'
import { friendlyError } from '../lib/errors'
import {
  addDays,
  addMinutes,
  ceilMinutes,
  fmtDayMonth,
  fmtDuration,
  fmtRange,
  fromLocalInput,
  startOfDay,
  toLocalInput,
} from '../lib/format'
import WeekSchedule from '../components/WeekSchedule'

export default function Reservar() {
  const { profile } = useAuth()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [weekStart, setWeekStart] = useState(() => startOfDay(new Date()))
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [loadingSchedule, setLoadingSchedule] = useState(false)

  // Busca de veículos livres em um período
  const [findStart, setFindStart] = useState('')
  const [findEnd, setFindEnd] = useState('')
  const [availableIds, setAvailableIds] = useState<Set<string> | null>(null)

  // Formulário
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [destination, setDestination] = useState('')
  const [purpose, setPurpose] = useState('')
  const [passengers, setPassengers] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    supabase
      .from('vehicles')
      .select('*')
      .eq('active', true)
      .order('model')
      .then(({ data }) => {
        const list = (data as Vehicle[]) ?? []
        setVehicles(list)
        if (list.length && !selectedId) setSelectedId(list[0].id)
      })
    supabase
      .from('settings')
      .select('max_duration_hours,max_advance_days,min_interval_minutes')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => setSettings(data as Settings))
  }, [])

  const loadSchedule = useCallback(async () => {
    if (!selectedId) return
    setLoadingSchedule(true)
    const { data, error } = await supabase.rpc('vehicle_schedule', {
      p_vehicle_id: selectedId,
      p_from: weekStart.toISOString(),
      p_to: addDays(weekStart, 7).toISOString(),
    })
    if (!error) setItems((data as ScheduleItem[]) ?? [])
    setLoadingSchedule(false)
  }, [selectedId, weekStart])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  // Recarrega a agenda a cada minuto para refletir reservas de outros usuários
  useEffect(() => {
    const id = window.setInterval(loadSchedule, 60000)
    return () => window.clearInterval(id)
  }, [loadSchedule])

  const selected = vehicles.find((v) => v.id === selectedId) ?? null
  const startDate = fromLocalInput(start)
  const endDate = fromLocalInput(end)
  const selection = startDate && endDate && endDate > startDate ? { start: startDate, end: endDate } : null

  const conflict = useMemo(() => {
    if (!selection) return null
    return items.find(
      (it) => new Date(it.starts_at) < selection.end && new Date(it.ends_at) > selection.start,
    )
  }, [items, selection])

  const filteredVehicles = vehicles.filter((v) => {
    const q = search.trim().toLowerCase()
    const matches = !q || `${v.brand} ${v.model} ${v.plate} ${v.location ?? ''}`.toLowerCase().includes(q)
    return matches && (!availableIds || availableIds.has(v.id))
  })

  function pickSlot(s: Date) {
    const st = ceilMinutes(s, 15)
    setStart(toLocalInput(st))
    setEnd(toLocalInput(addMinutes(st, 60)))
    setError(null)
    setSuccess(null)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  async function findAvailable(e: FormEvent) {
    e.preventDefault()
    const s = fromLocalInput(findStart)
    const en = fromLocalInput(findEnd)
    if (!s || !en || en <= s) return
    const { data } = await supabase.rpc('available_vehicles', { p_from: s.toISOString(), p_to: en.toISOString() })
    const ids = new Set(((data as Vehicle[]) ?? []).map((v) => v.id))
    setAvailableIds(ids)
    setStart(findStart)
    setEnd(findEnd)
    setWeekStart(startOfDay(s))
    const first = vehicles.find((v) => ids.has(v.id))
    if (first) setSelectedId(first.id)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!selected || !profile) return
    if (!startDate || !endDate) return setError('Informe retirada e devolução.')
    if (endDate <= startDate) return setError('A devolução deve ser depois da retirada.')
    if (startDate < addMinutes(new Date(), -5)) return setError('Não é possível reservar no passado.')
    if (settings && endDate.getTime() - startDate.getTime() > settings.max_duration_hours * 3600000)
      return setError(`A duração máxima de uma reserva é de ${settings.max_duration_hours} horas.`)
    if (conflict) return setError('Esse período conflita com outra reserva deste veículo.')

    setBusy(true)
    const { error } = await supabase.from('reservations').insert({
      vehicle_id: selected.id,
      user_id: profile.id,
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      destination: destination.trim() || null,
      purpose: purpose.trim() || null,
      passengers: passengers ? Number(passengers) : null,
    })
    setBusy(false)
    if (error) {
      setError(friendlyError(error))
      loadSchedule()
      return
    }
    setSuccess(`Reserva confirmada: ${selected.brand} ${selected.model} (${selected.plate}) · ${fmtRange(startDate, endDate)}`)
    setStart('')
    setEnd('')
    setDestination('')
    setPurpose('')
    setPassengers('1')
    loadSchedule()
  }

  const today = startOfDay(new Date())
  const minInput = toLocalInput(ceilMinutes(new Date(), 15))

  return (
    <div className="reserve-layout">
      <aside className="sidebar">
        <form className="card find-card" onSubmit={findAvailable}>
          <h3>Encontrar veículo livre</h3>
          <label>
            Retirada
            <input type="datetime-local" step={900} min={minInput} value={findStart} onChange={(e) => setFindStart(e.target.value)} required />
          </label>
          <label>
            Devolução
            <input type="datetime-local" step={900} min={findStart || minInput} value={findEnd} onChange={(e) => setFindEnd(e.target.value)} required />
          </label>
          <div className="row gap">
            <button className="btn primary sm">Buscar</button>
            {availableIds && (
              <button type="button" className="btn sm" onClick={() => setAvailableIds(null)}>
                Limpar
              </button>
            )}
          </div>
          {availableIds && (
            <p className="small muted">
              {availableIds.size} veículo(s) livre(s) no período.
            </p>
          )}
        </form>

        <div className="card vehicle-list">
          <input className="search" placeholder="Filtrar por modelo, placa ou local" value={search} onChange={(e) => setSearch(e.target.value)} />
          {filteredVehicles.length === 0 && <p className="muted small">Nenhum veículo encontrado.</p>}
          {filteredVehicles.map((v) => (
            <button
              key={v.id}
              className={`vehicle-item ${v.id === selectedId ? 'active' : ''}`}
              onClick={() => setSelectedId(v.id)}
            >
              <div>
                <strong>
                  {v.brand} {v.model}
                </strong>
                <small>{[v.color, v.location].filter(Boolean).join(' · ')}</small>
              </div>
              <span className="plate">{v.plate}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="main-col">
        {vehicles.length === 0 ? (
          <div className="card empty">
            <h2>Nenhum veículo cadastrado</h2>
            <p className="muted">
              {profile?.role === 'admin' ? (
                <>
                  Cadastre os veículos da frota em <Link to="/admin/veiculos">Administração › Veículos</Link>.
                </>
              ) : (
                'Aguarde o administrador cadastrar os veículos da frota.'
              )}
            </p>
          </div>
        ) : selected ? (
          <>
            <div className="card">
              <div className="vehicle-header">
                <div>
                  <h1>
                    {selected.brand} {selected.model} <span className="plate">{selected.plate}</span>
                  </h1>
                  <p className="muted">
                    {[selected.color, selected.year, selected.seats && `${selected.seats} lugares`, selected.location]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {selected.notes && <p className="small">{selected.notes}</p>}
                </div>
                <div className="week-nav">
                  <button className="btn sm" disabled={weekStart <= today} onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semana anterior">
                    ‹
                  </button>
                  <button className="btn sm" onClick={() => setWeekStart(today)}>
                    Hoje
                  </button>
                  <button className="btn sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Próxima semana">
                    ›
                  </button>
                  <span className="small muted">
                    {fmtDayMonth(weekStart)} – {fmtDayMonth(addDays(weekStart, 6))}
                  </span>
                </div>
              </div>
              <div className="legend">
                <span><i className="sw sw-free" /> Livre</span>
                <span><i className="sw sw-busy" /> Reservado</span>
                <span><i className="sw sw-mine" /> Sua reserva</span>
                <span><i className="sw sw-maint" /> Manutenção</span>
                <span><i className="sw sw-sel" /> Seleção</span>
              </div>
              <WeekSchedule weekStart={weekStart} items={items} selection={selection} onPickSlot={pickSlot} loading={loadingSchedule} />
              <p className="small muted">Clique em um horário livre para iniciar a reserva e ajuste a devolução no formulário abaixo.</p>
            </div>

            <form className="card form" ref={formRef} onSubmit={onSubmit}>
              <h2>Nova reserva</h2>
              {error && <div className="alert error">{error}</div>}
              {success && (
                <div className="alert success">
                  {success} — <Link to="/minhas-reservas">ver minhas reservas</Link>
                </div>
              )}
              <div className="grid-2">
                <label>
                  Retirada
                  <input type="datetime-local" step={900} min={minInput} value={start} onChange={(e) => setStart(e.target.value)} required />
                </label>
                <label>
                  Devolução
                  <input type="datetime-local" step={900} min={start || minInput} value={end} onChange={(e) => setEnd(e.target.value)} required />
                </label>
              </div>
              {selection && (
                <p className={`small ${conflict ? 'text-error' : 'muted'}`}>
                  {conflict
                    ? 'Conflito: o veículo já está ocupado em parte desse período.'
                    : `Duração: ${fmtDuration(selection.start, selection.end)}`}
                </p>
              )}
              <div className="grid-2">
                <label>
                  Destino
                  <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Ex.: Fazenda Santa Rita – Matão" />
                </label>
                <label>
                  Passageiros
                  <input type="number" min={1} max={selected.seats ?? 9} value={passengers} onChange={(e) => setPassengers(e.target.value)} />
                </label>
              </div>
              <label>
                Motivo da viagem
                <textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Ex.: Visita técnica" />
              </label>
              <div className="row gap">
                <button className="btn primary" disabled={busy || Boolean(conflict)}>
                  {busy ? 'Reservando…' : 'Confirmar reserva'}
                </button>
                {settings && (
                  <span className="small muted">
                    Máx. {settings.max_duration_hours}h por reserva · até {settings.max_advance_days} dias de antecedência
                  </span>
                )}
              </div>
            </form>
          </>
        ) : (
          <div className="card empty">
            <p className="muted">Selecione um veículo.</p>
          </div>
        )}
      </section>
    </div>
  )
}
