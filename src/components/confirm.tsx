import { createRoot } from 'react-dom/client'

/**
 * Confirmação dentro da página (substitui window.confirm, que alguns navegadores/iframes bloqueiam).
 * Uso: if (!(await confirmDialog('Cancelar a reserva?'))) return
 */
export function confirmDialog(message: string, confirmLabel = 'Confirmar'): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const done = (v: boolean) => {
      root.unmount()
      host.remove()
      resolve(v)
    }
    root.render(
      <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && done(false)}>
        <div className="modal confirm" role="alertdialog" aria-modal="true">
          <p>{message}</p>
          <div className="row gap end">
            <button className="btn" onClick={() => done(false)}>
              Voltar
            </button>
            <button className="btn primary" autoFocus onClick={() => done(true)}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>,
    )
  })
}
