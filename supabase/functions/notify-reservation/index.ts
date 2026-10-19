// Edge Function: envio de e-mails de reserva via Resend (https://resend.com)
//
// Chamada por:
//   - trigger no banco (pg_net) a cada INSERT/UPDATE em reservations  -> confirmação / cancelamento
//   - pg_cron a cada 15 min com body {"type":"reminder"}             -> lembrete antes da retirada
//
// Deploy:  supabase functions deploy notify-reservation --no-verify-jwt
// Secrets: RESEND_API_KEY, EMAIL_FROM, WEBHOOK_SECRET, SITE_URL
//          (opcionais) ADMIN_NOTIFY_EMAIL, REMINDER_MINUTES (padrão 60), APP_NAME

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'Reserva de Veículos <onboarding@resend.dev>'
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? ''
const SITE_URL = Deno.env.get('SITE_URL') ?? ''
const ADMIN_NOTIFY_EMAIL = Deno.env.get('ADMIN_NOTIFY_EMAIL') ?? ''
const REMINDER_MINUTES = Number(Deno.env.get('REMINDER_MINUTES') ?? '60')
const APP_NAME = Deno.env.get('APP_NAME') ?? 'Reserva de Veículos'
const TZ = 'America/Sao_Paulo'

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

interface ReservationRow {
  id: string
  vehicle_id: string
  user_id: string
  starts_at: string
  ends_at: string
  kind: string
  status: string
  destination: string | null
  purpose: string | null
  cancelled_by: string | null
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

async function details(r: ReservationRow) {
  const [{ data: v }, { data: p }] = await Promise.all([
    db.from('vehicles').select('plate, brand, model, location, notes').eq('id', r.vehicle_id).single(),
    db.from('profiles').select('full_name, email').eq('id', r.user_id).single(),
  ])
  return { vehicle: v!, user: p! }
}

function ics(r: ReservationRow, summary: string, location: string, method: 'REQUEST' | 'CANCEL') {
  const d = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reserva de Veiculos//PT-BR',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${r.id}@reserva-veiculos`,
    `DTSTAMP:${d(new Date().toISOString())}`,
    `DTSTART:${d(r.starts_at)}`,
    `DTEND:${d(r.ends_at)}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    method === 'CANCEL' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

function layout(title: string, intro: string, rows: [string, string][], footer = '') {
  const tr = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#52606d;white-space:nowrap">${k}</td><td style="padding:6px 0;color:#1f2933"><strong>${esc(v)}</strong></td></tr>`,
    )
    .join('')
  const btn = SITE_URL
    ? `<p style="margin:24px 0 0"><a href="${SITE_URL}#/minhas-reservas" style="background:#e8790c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Ver minhas reservas</a></p>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Segoe UI,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border:1px solid #e4e7eb;border-radius:12px;padding:24px">
      <p style="margin:0 0 4px;color:#e8790c;font-weight:700;font-size:13px">${esc(APP_NAME)}</p>
      <h1 style="margin:0 0 12px;font-size:20px;color:#1f2933">${esc(title)}</h1>
      <p style="color:#52606d;margin:0 0 16px">${intro}</p>
      <table style="border-collapse:collapse;font-size:14px">${tr}</table>
      ${footer ? `<p style="color:#52606d;font-size:13px;margin-top:16px">${footer}</p>` : ''}
      ${btn}
    </div>
    <p style="color:#9aa5b1;font-size:12px;text-align:center">Mensagem automática — não responda este e-mail.</p>
  </div></body></html>`
}

async function send(to: string, subject: string, html: string, attachment?: { filename: string; content: string }) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY não configurada; e-mail não enviado:', subject, to)
    return
  }
  const payload: Record<string, unknown> = { from: EMAIL_FROM, to: [to], subject, html }
  if (ADMIN_NOTIFY_EMAIL) payload.bcc = [ADMIN_NOTIFY_EMAIL]
  if (attachment) payload.attachments = [{ filename: attachment.filename, content: btoa(unescape(encodeURIComponent(attachment.content))) }]
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) console.error('Falha ao enviar e-mail', res.status, await res.text())
}

async function onConfirmed(r: ReservationRow) {
  const { vehicle, user } = await details(r)
  const veic = `${vehicle.brand} ${vehicle.model} (${vehicle.plate})`
  const html = layout(
    'Reserva confirmada',
    `Olá, ${esc(user.full_name || user.email)}! Sua reserva foi registrada.`,
    [
      ['Veículo', veic],
      ['Retirada', fmt(r.starts_at)],
      ['Devolução', fmt(r.ends_at)],
      ['Local', vehicle.location ?? ''],
      ['Destino', r.destination ?? ''],
      ['Motivo', r.purpose ?? ''],
    ],
    vehicle.notes ? `Observações do veículo: ${esc(vehicle.notes)}` : 'Se não for mais utilizar o veículo, cancele a reserva para liberá-lo a outros colegas.',
  )
  await send(user.email, `Reserva confirmada: ${vehicle.model} – ${fmt(r.starts_at)}`, html, {
    filename: 'reserva.ics',
    content: ics(r, `Veículo ${veic}`, vehicle.location ?? '', 'REQUEST'),
  })
}

async function onCancelled(r: ReservationRow) {
  const { vehicle, user } = await details(r)
  const byOther = r.cancelled_by && r.cancelled_by !== r.user_id
  const html = layout(
    'Reserva cancelada',
    byOther
      ? `Olá, ${esc(user.full_name || user.email)}. Sua reserva foi <strong>cancelada pelo administrador da frota</strong>.`
      : `Olá, ${esc(user.full_name || user.email)}. Confirmamos o cancelamento da sua reserva.`,
    [
      ['Veículo', `${vehicle.brand} ${vehicle.model} (${vehicle.plate})`],
      ['Retirada', fmt(r.starts_at)],
      ['Devolução', fmt(r.ends_at)],
    ],
  )
  await send(user.email, `Reserva cancelada: ${vehicle.model} – ${fmt(r.starts_at)}`, html, {
    filename: 'cancelamento.ics',
    content: ics(r, `Veículo ${vehicle.model}`, vehicle.location ?? '', 'CANCEL'),
  })
}

async function sendReminders() {
  const now = new Date()
  const limit = new Date(now.getTime() + REMINDER_MINUTES * 60000)
  const { data, error } = await db
    .from('reservations')
    .select('*')
    .eq('status', 'confirmada')
    .eq('kind', 'reserva')
    .is('reminder_sent_at', null)
    .gte('starts_at', now.toISOString())
    .lte('starts_at', limit.toISOString())
  if (error) throw error

  for (const r of (data ?? []) as ReservationRow[]) {
    const { vehicle, user } = await details(r)
    const html = layout(
      'Lembrete: sua reserva está chegando',
      `Olá, ${esc(user.full_name || user.email)}! Sua retirada é às <strong>${fmt(r.starts_at)}</strong>.`,
      [
        ['Veículo', `${vehicle.brand} ${vehicle.model} (${vehicle.plate})`],
        ['Local', vehicle.location ?? ''],
        ['Devolução', fmt(r.ends_at)],
      ],
      vehicle.notes ? esc(vehicle.notes) : '',
    )
    await send(user.email, `Lembrete: ${vehicle.model} às ${fmt(r.starts_at)}`, html)
    await db.from('reservations').update({ reminder_sent_at: new Date().toISOString() }).eq('id', r.id)
  }
  return data?.length ?? 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) return json({ error: 'unauthorized' }, 401)

  try {
    const body = await req.json()

    if (body.type === 'reminder') {
      const sent = await sendReminders()
      return json({ ok: true, sent })
    }

    const record = body.record as ReservationRow | undefined
    const old = body.old_record as ReservationRow | undefined
    if (!record || record.kind !== 'reserva') return json({ ok: true, skipped: true })

    if (body.type === 'INSERT' && record.status === 'confirmada') await onConfirmed(record)
    else if (body.type === 'UPDATE' && old?.status === 'confirmada' && record.status === 'cancelada') await onCancelled(record)

    return json({ ok: true })
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})
