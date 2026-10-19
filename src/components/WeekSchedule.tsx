import { useEffect, useMemo, useRef } from 'react'
import type { ScheduleItem } from '../lib/types'
import { addDays, fmtDayMonth, fmtTime, fmtWeekday, sameDay, startOfDay } from '../lib/format'

const HOUR_PX = 36
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface Props {
  weekStart: Date
  items: ScheduleItem[]
  selection?: { start: Date; end: Date } | null
  onPickSlot: (start: Date) => void
  loading?: boolean
}

/**
 * Agenda semanal do veículo: colunas = dias, linhas = horas.
 * Blocos ocupados aparecem preenchidos; clicar num horário livre inicia uma reserva.
 */
export default function WeekSchedule({ weekStart, items, selection, onPickSlot, loading }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const now = new Date()

  useEffect(() => {
    // Rola para começar perto das 7h
    if (scrollRef.current) scrollRef.current.scrollTop = HOUR_PX * 6.5
  }, [weekStart])

  function blocksForDay(day: Date) {
    const dayStart = startOfDay(day).getTime()
    const dayEnd = dayStart + 24 * 3600 * 1000
    return items
      .map((it) => {
        const s = Math.max(new Date(it.starts_at).getTime(), dayStart)
        const e = Math.min(new Date(it.ends_at).getTime(), dayEnd)
        if (e <= s) return null
        return {
          it,
          top: ((s - dayStart) / 3600000) * HOUR_PX,
          height: Math.max(((e - s) / 3600000) * HOUR_PX, 14),
        }
      })
      .filter(Boolean) as { it: ScheduleItem; top: number; height: number }[]
  }

  function selectionBlock(day: Date) {
    if (!selection) return null
    const dayStart = startOfDay(day).getTime()
    const dayEnd = dayStart + 24 * 3600 * 1000
    const s = Math.max(selection.start.getTime(), dayStart)
    const e = Math.min(selection.end.getTime(), dayEnd)
    if (e <= s) return null
    return { top: ((s - dayStart) / 3600000) * HOUR_PX, height: ((e - s) / 3600000) * HOUR_PX }
  }

  return (
    <div className={`week ${loading ? 'is-loading' : ''}`}>
      <div className="week-head">
        <div className="week-gutter" />
        {days.map((d) => (
          <div key={d.toISOString()} className={`week-day-label ${sameDay(d, now) ? 'today' : ''}`}>
            <span>{fmtWeekday(d)}</span>
            <strong>{fmtDayMonth(d)}</strong>
          </div>
        ))}
      </div>
      <div className="week-body" ref={scrollRef}>
        <div className="week-grid" style={{ height: HOUR_PX * 24 }}>
          <div className="week-gutter">
            {HOURS.map((h) => (
              <div key={h} className="hour-label" style={{ height: HOUR_PX }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {days.map((d) => {
            const sel = selectionBlock(d)
            const isToday = sameDay(d, now)
            return (
              <div key={d.toISOString()} className="week-col">
                {HOURS.map((h) => {
                  const slotStart = new Date(d)
                  slotStart.setHours(h, 0, 0, 0)
                  const slotEnd = new Date(slotStart.getTime() + 3600000)
                  const past = slotEnd <= now
                  return (
                    <button
                      key={h}
                      type="button"
                      className={`slot ${past ? 'past' : ''}`}
                      style={{ height: HOUR_PX }}
                      disabled={past}
                      title={past ? '' : `Reservar a partir de ${String(h).padStart(2, '0')}:00`}
                      onClick={() => onPickSlot(slotStart < now ? now : slotStart)}
                    />
                  )
                })}
                {isToday && (
                  <div
                    className="now-line"
                    style={{ top: ((now.getTime() - startOfDay(now).getTime()) / 3600000) * HOUR_PX }}
                  />
                )}
                {blocksForDay(d).map(({ it, top, height }) => (
                  <div
                    key={it.id + d.toISOString()}
                    className={`busy ${it.kind === 'manutencao' ? 'maint' : it.is_mine ? 'mine' : ''}`}
                    style={{ top, height }}
                    title={`${it.kind === 'manutencao' ? 'Manutenção' : it.is_mine ? 'Sua reserva' : 'Reservado'} · ${fmtTime(it.starts_at)}–${fmtTime(it.ends_at)}`}
                  >
                    {height >= 28 && (
                      <>
                        <strong>{it.kind === 'manutencao' ? 'Manutenção' : it.is_mine ? 'Sua reserva' : 'Reservado'}</strong>
                        <span>
                          {fmtTime(it.starts_at)}–{fmtTime(it.ends_at)}
                        </span>
                      </>
                    )}
                  </div>
                ))}
                {sel && <div className="selection" style={{ top: sel.top, height: sel.height }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
