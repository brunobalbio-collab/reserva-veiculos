/**
 * MODO DEMONSTRAÇÃO — simula o Supabase em memória para apresentar o sistema sem backend.
 * Só é incluído quando o build roda com VITE_DEMO=1. Os dados voltam ao estado inicial ao recarregar a página.
 */
import type { Profile, Reservation, Settings, Vehicle } from '../lib/types'

export const DEMO_URL = 'https://demo.supabase.co'

type Row = Record<string, unknown>

const uid = () => crypto.randomUUID()
const at = (dayOffset: number, h: number, m = 0) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m)
  return d.toISOString()
}

const ADMIN_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'

const profiles: Profile[] = [
  { id: ADMIN_ID, full_name: 'Bruno Rodrigues', email: 'admin@demo.com', department: 'Gestão de Frota', phone: null, role: 'admin', active: true, created_at: at(-40, 9) },
  { id: USER_ID, full_name: 'Mariana Souza', email: 'usuario@demo.com', department: 'Agrícola', phone: null, role: 'user', active: true, created_at: at(-30, 9) },
  { id: uid(), full_name: 'Carlos Lima', email: 'carlos.lima@demo.com', department: 'Qualidade', phone: null, role: 'user', active: true, created_at: at(-25, 9) },
  { id: uid(), full_name: 'Fernanda Alves', email: 'fernanda.alves@demo.com', department: 'Logística', phone: null, role: 'user', active: true, created_at: at(-20, 9) },
  { id: uid(), full_name: 'Roberto Dias', email: 'roberto.dias@demo.com', department: 'Industrial', phone: null, role: 'user', active: false, created_at: at(-60, 9) },
]

const vehicles: Vehicle[] = [
  { id: uid(), plate: 'ABC1D23', brand: 'Fiat', model: 'Strada Freedom', color: 'Branco', year: 2024, seats: 2, location: 'Matão – Portaria 1', notes: 'Chave na portaria. Cartão combustível no porta-luvas.', active: true },
  { id: uid(), plate: 'BRA2E19', brand: 'Volkswagen', model: 'Polo Track', color: 'Prata', year: 2024, seats: 5, location: 'Matão – Portaria 1', notes: null, active: true },
  { id: uid(), plate: 'RIO3F45', brand: 'Toyota', model: 'Hilux SR', color: 'Branco', year: 2023, seats: 5, location: 'Bebedouro – Administrativo', notes: 'Uso preferencial para visitas a fazendas.', active: true },
  { id: uid(), plate: 'SPO4G67', brand: 'Chevrolet', model: 'Onix', color: 'Cinza', year: 2025, seats: 5, location: 'Araraquara – Escritório', notes: null, active: true },
  { id: uid(), plate: 'MTA5H89', brand: 'Renault', model: 'Duster', color: 'Preto', year: 2022, seats: 5, location: 'Matão – Portaria 1', notes: null, active: false },
]

const settings: Settings & { id: number } = { id: 1, max_duration_hours: 72, max_advance_days: 60, min_interval_minutes: 0 }

const [v1, v2, v3, v4] = vehicles
const [, , carlos, fernanda] = profiles
const res = (vehicle: Vehicle, user: Profile, s: string, e: string, extra: Partial<Reservation> = {}): Reservation => ({
  id: uid(), vehicle_id: vehicle.id, user_id: user.id, starts_at: s, ends_at: e, kind: 'reserva', status: 'confirmada',
  destination: null, purpose: null, passengers: 1, cancelled_at: null, created_at: at(-3, 10), ...extra,
})

const reservations: (Reservation & Row)[] = ([
  res(v1, carlos, at(0, 7), at(0, 12), { destination: 'Fazenda Santa Rita – Matão', purpose: 'Coleta de amostras' }),
  res(v1, profiles[1], at(1, 7, 30), at(1, 17), { destination: 'Fazenda Boa Vista', purpose: 'Visita técnica', passengers: 2 }),
  res(v1, fernanda, at(2, 13), at(2, 18), { destination: 'Porto de Santos', purpose: 'Reunião logística' }),
  res(v1, carlos, at(3, 9), at(3, 11), { destination: 'Laboratório Araraquara' }),
  res(v1, profiles[0], at(4, 0), at(5, 12), { kind: 'manutencao', purpose: 'Revisão 40.000 km' }),
  res(v2, fernanda, at(0, 14), at(0, 18), { destination: 'Centro – Matão' }),
  res(v2, profiles[1], at(3, 8), at(3, 18), { destination: 'Bebedouro', purpose: 'Treinamento' }),
  res(v3, carlos, at(1, 6), at(2, 19), { destination: 'Fazendas região de Bebedouro', purpose: 'Auditoria de campo', passengers: 3 }),
  res(v3, profiles[1], at(6, 8), at(6, 12), { destination: 'Fazenda Santa Rita', purpose: 'Visita técnica' }),
  res(v4, fernanda, at(2, 8), at(2, 10)),
  res(v2, profiles[1], at(-5, 8), at(-5, 12), { destination: 'Araraquara', purpose: 'Reunião' }),
  res(v1, profiles[1], at(-2, 13), at(-2, 15), { status: 'cancelada', cancelled_at: at(-3, 9) }),
] as unknown) as (Reservation & Row)[]

let currentUserId: string | null = null

// ------------------------------------------------------------------ helpers
const ok = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const pgError = (message: string, code = 'P0001', status = 400) => ok({ code, message, details: null, hint: null }, status)

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
function sessionFor(p: Profile) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 12
  const user = { id: p.id, email: p.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { full_name: p.full_name }, created_at: p.created_at }
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: p.id, exp, role: 'authenticated', email: p.email })}.demo`,
    refresh_token: `demo-${p.id}`,
    token_type: 'bearer',
    expires_in: 3600 * 12,
    expires_at: exp,
    user,
  }
}

const me = () => profiles.find((p) => p.id === currentUserId) ?? null
const isAdmin = () => me()?.role === 'admin'

function cmp(a: unknown, b: string) {
  const sa = String(a ?? '')
  if (/^\d{4}-\d{2}-\d{2}T/.test(sa) && /^\d{4}-\d{2}-\d{2}T/.test(b)) return new Date(sa).getTime() - new Date(b).getTime()
  if (typeof a === 'number') return a - Number(b)
  return sa < b ? -1 : sa > b ? 1 : 0
}

function test(row: Row, col: string, expr: string): boolean {
  const i = expr.indexOf('.')
  const op = expr.slice(0, i)
  const val = expr.slice(i + 1)
  const v = row[col]
  switch (op) {
    case 'eq': return String(v) === val
    case 'neq': return String(v) !== val
    case 'gt': return cmp(v, val) > 0
    case 'gte': return cmp(v, val) >= 0
    case 'lt': return cmp(v, val) < 0
    case 'lte': return cmp(v, val) <= 0
    case 'is': return val === 'null' ? v == null : String(v) === val
    case 'in': return val.replace(/[()]/g, '').split(',').includes(String(v))
    default: return true
  }
}

function applyQuery(rows: Row[], params: URLSearchParams) {
  let out = rows.filter((row) => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset', 'columns'].includes(k)) continue
      if (k === 'or') {
        const parts = v.replace(/^\(|\)$/g, '').split(',')
        if (!parts.some((p) => { const [c, ...rest] = p.split('.'); return test(row, c, rest.join('.')) })) return false
        continue
      }
      if (!test(row, k, v)) return false
    }
    return true
  })
  const order = params.get('order')
  if (order) {
    const keys = order.split(',').map((o) => o.split('.'))
    out = [...out].sort((a, b) => {
      for (const [c, dir] of keys) {
        const r = cmp(a[c], String(b[c] ?? ''))
        if (r) return dir === 'desc' ? -r : r
      }
      return 0
    })
  }
  const limit = params.get('limit')
  if (limit) out = out.slice(0, Number(limit))
  return out
}

function embed(rows: Row[], select: string | null) {
  if (!select) return rows
  return rows.map((r) => {
    const x: Row = { ...r }
    if (select.includes('vehicle:')) {
      const v = vehicles.find((v) => v.id === r.vehicle_id)
      x.vehicle = v ? { plate: v.plate, brand: v.brand, model: v.model } : null
    }
    if (select.includes('profile:')) {
      const p = profiles.find((p) => p.id === r.user_id)
      x.profile = p ? { full_name: p.full_name, email: p.email } : null
    }
    return x
  })
}

const overlaps = (vehicleId: string, s: string, e: string, ignore?: string) =>
  reservations.some((r) => r.vehicle_id === vehicleId && r.status === 'confirmada' && r.id !== ignore &&
    new Date(r.starts_at) < new Date(e) && new Date(r.ends_at) > new Date(s))

// ------------------------------------------------------------------ handlers
async function handleRest(table: string, method: string, params: URLSearchParams, body: Row | Row[] | null, wantsObject: boolean) {
  const sources: Record<string, Row[]> = { profiles: profiles as unknown as Row[], vehicles: vehicles as unknown as Row[], settings: [settings as unknown as Row], reservations }
  let rows = sources[table]
  if (!rows) return pgError('tabela desconhecida', '42P01', 404)

  // RLS simplificado
  if (!isAdmin()) {
    if (table === 'profiles') rows = rows.filter((r) => r.id === currentUserId)
    if (table === 'reservations') rows = rows.filter((r) => r.user_id === currentUserId)
  }

  if (method === 'GET') {
    const out = embed(applyQuery(rows, params), params.get('select'))
    return wantsObject ? (out[0] ? ok(out[0]) : pgError('no rows', 'PGRST116', 406)) : ok(out)
  }

  if (method === 'POST') {
    const items = (Array.isArray(body) ? body : [body]) as Row[]
    for (const it of items) {
      if (table === 'reservations') {
        if (!isAdmin() && it.user_id !== currentUserId) return pgError('new row violates row-level security policy for table "reservations"', '42501', 403)
        if (new Date(String(it.ends_at)) <= new Date(String(it.starts_at))) return pgError('reservations_periodo_valido', '23514')
        if (!isAdmin() && new Date(String(it.starts_at)).getTime() < Date.now() - 5 * 60000) return pgError('Não é possível reservar no passado.')
        if (overlaps(String(it.vehicle_id), String(it.starts_at), String(it.ends_at)))
          return pgError('conflicting key value violates exclusion constraint "reservations_sem_sobreposicao"', '23P01', 409)
        reservations.push({ id: uid(), kind: 'reserva', status: 'confirmada', destination: null, purpose: null, passengers: null, cancelled_at: null, created_at: new Date().toISOString(), ...it } as unknown as Reservation & Row)
      } else if (table === 'vehicles') {
        if (!isAdmin()) return pgError('row-level security', '42501', 403)
        if (vehicles.some((v) => v.plate === it.plate)) return pgError('duplicate key value violates unique constraint "vehicles_plate_key"', '23505', 409)
        vehicles.push({ id: uid(), active: true, ...it } as unknown as Vehicle)
      }
    }
    return ok(undefined, 201)
  }

  if (method === 'PATCH') {
    const targets = applyQuery(rows, params)
    for (const t of targets) {
      const patch = { ...(body as Row) }
      if (table === 'profiles' && !isAdmin()) { delete patch.role; delete patch.active }
      Object.assign(t, patch)
    }
    return ok(undefined, 204)
  }

  return ok(undefined, 204)
}

function handleRpc(name: string, args: Row) {
  if (name === 'vehicle_schedule') {
    const from = new Date(String(args.p_from)), to = new Date(String(args.p_to))
    return ok(
      reservations
        .filter((r) => r.vehicle_id === args.p_vehicle_id && r.status === 'confirmada' && new Date(r.starts_at) < to && new Date(r.ends_at) > from)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((r) => ({
          id: r.id, starts_at: r.starts_at, ends_at: r.ends_at, kind: r.kind, is_mine: r.user_id === currentUserId,
          user_name: r.user_id === currentUserId || isAdmin() ? profiles.find((p) => p.id === r.user_id)?.full_name ?? null : null,
        })),
    )
  }
  if (name === 'available_vehicles') {
    return ok(vehicles.filter((v) => v.active && !overlaps(v.id, String(args.p_from), String(args.p_to))))
  }
  if (name === 'cancel_reservation') {
    const r = reservations.find((r) => r.id === args.p_id)
    if (!r) return pgError('Reserva não encontrada.')
    if (r.user_id !== currentUserId && !isAdmin()) return pgError('Você não pode cancelar esta reserva.')
    r.status = 'cancelada'
    r.cancelled_at = new Date().toISOString()
    return ok(null)
  }
  return pgError('função desconhecida', '42883', 404)
}

function handleAdminFunction(body: Row) {
  if (!isAdmin()) return ok({ error: 'Apenas administradores podem executar esta ação.' }, 403)
  if (body.action === 'invite') {
    const email = String(body.email)
    if (profiles.some((p) => p.email === email)) return ok({ error: 'Este e-mail já está cadastrado. Use "Enviar acesso" na lista para reenviar o link.' }, 400)
    profiles.push({ id: uid(), email, full_name: String(body.full_name), department: (body.department as string) || null, phone: null, role: body.role === 'admin' ? 'admin' : 'user', active: true, created_at: new Date().toISOString() })
    return ok({ ok: true })
  }
  if (body.action === 'set_active') {
    const p = profiles.find((p) => p.id === body.user_id)
    if (p) {
      p.active = Boolean(body.active)
      if (!p.active) reservations.filter((r) => r.user_id === p.id && r.status === 'confirmada' && new Date(r.starts_at) > new Date()).forEach((r) => (r.status = 'cancelada'))
    }
    return ok({ ok: true })
  }
  return ok({ error: 'Ação desconhecida' }, 400)
}

function handleAuth(path: string, method: string, params: URLSearchParams, body: Row | null) {
  if (path === '/auth/v1/token') {
    if (params.get('grant_type') === 'refresh_token') {
      const id = String(body?.refresh_token ?? '').replace('demo-', '')
      const p = profiles.find((p) => p.id === id)
      if (!p) return ok({ error: 'invalid_grant', error_description: 'Invalid Refresh Token' }, 400)
      currentUserId = p.id
      return ok(sessionFor(p))
    }
    const email = String(body?.email ?? '').toLowerCase()
    const p = profiles.find((p) => p.email === email)
    if (!p || !String(body?.password ?? '')) return ok({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' }, 400)
    currentUserId = p.id
    return ok(sessionFor(p))
  }
  if (path === '/auth/v1/user') {
    const p = me()
    if (!p) return ok({ msg: 'not authenticated' }, 401)
    return ok(sessionFor(p).user)
  }
  if (path === '/auth/v1/logout') {
    currentUserId = null
    return ok(undefined, 204)
  }
  if (path === '/auth/v1/recover') return ok({})
  return ok({}, method === 'GET' ? 200 : 200)
}

export function installMockBackend() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.origin !== DEMO_URL) return realFetch(input, init)

    await new Promise((r) => setTimeout(r, 120)) // latência simulada
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers = new Headers(init?.headers)
    const raw = typeof init?.body === 'string' ? init.body : null
    const body = raw ? JSON.parse(raw) : null

    // Recupera o usuário pelo token (útil após recarregar a página)
    const auth = headers.get('Authorization') ?? ''
    const token = auth.replace('Bearer ', '')
    if (token.split('.').length === 3) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (payload.sub) currentUserId = payload.sub
      } catch { /* token anônimo */ }
    }

    const path = url.pathname
    if (path.startsWith('/auth/v1/')) return handleAuth(path, method, url.searchParams, body)
    if (path.startsWith('/rest/v1/rpc/')) return handleRpc(path.replace('/rest/v1/rpc/', ''), body ?? {})
    if (path.startsWith('/rest/v1/')) {
      const wantsObject = (headers.get('Accept') ?? '').includes('vnd.pgrst.object')
      return handleRest(path.replace('/rest/v1/', ''), method, url.searchParams, body, wantsObject)
    }
    if (path === '/functions/v1/admin-users') return handleAdminFunction(body ?? {})
    return ok({}, 404)
  }
}
