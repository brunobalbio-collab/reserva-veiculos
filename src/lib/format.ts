export const TZ = 'America/Sao_Paulo'

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const dayMonthFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

export const fmtDate = (d: Date | string) => dateFmt.format(new Date(d))
export const fmtTime = (d: Date | string) => timeFmt.format(new Date(d))
export const fmtDateTime = (d: Date | string) => `${fmtDate(d)} ${fmtTime(d)}`
export const fmtWeekday = (d: Date) => weekdayFmt.format(d).replace('.', '')
export const fmtDayMonth = (d: Date) => dayMonthFmt.format(d)

export function fmtRange(start: string | Date, end: string | Date) {
  const s = new Date(start)
  const e = new Date(end)
  return sameDay(s, e)
    ? `${fmtDate(s)} · ${fmtTime(s)} – ${fmtTime(e)}`
    : `${fmtDateTime(s)} → ${fmtDateTime(e)}`
}

export function fmtDuration(start: string | Date, end: string | Date) {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function addMinutes(d: Date, n: number) {
  return new Date(d.getTime() + n * 60000)
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Valor para <input type="datetime-local"> no fuso local */
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(v: string) {
  return v ? new Date(v) : null
}

/** Arredonda para cima ao próximo múltiplo de `step` minutos */
export function ceilMinutes(d: Date, step = 30) {
  const ms = step * 60000
  return new Date(Math.ceil(d.getTime() / ms) * ms)
}
