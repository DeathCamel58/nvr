import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'

export interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

/**
 * Контекст отдаёт только функции показа. Список видимых сообщений живёт
 * внутри провайдера и в контекст не попадает намеренно.
 *
 * Раньше в контекст входил и массив toasts, поэтому его значение менялось
 * на каждом новом сообщении. Страницы, у которых эффект загрузки зависел
 * от объекта контекста, перезапускали запрос после собственного тоста об
 * ошибке: запрос падал, показывал тост, эффект запускался снова — и так
 * по кругу. Один сбой API заваливал DOM тысячами тостов и держал панель
 * в состоянии «Загрузка…».
 */
interface ToastContextType {
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const ToastContext = createContext<ToastContextType>({
  success: () => {},
  error: () => {},
  info: () => {},
})

let toastId = 0

// Сколько сообщений держим одновременно. Повторяющиеся ошибки не дублируем
// (см. addToast), а общий предел не даёт списку разрастаться.
const MAX_VISIBLE = 5

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: Toast['type']) => {
    const id = ++toastId
    setToasts((prev) => {
      // Повторяющуюся ошибку не дублируем: зацикленный сбой не должен
      // заваливать экран. Успешные сообщения относятся к разным действиям
      // (например, две проверки камер подряд) — их показываем оба раза.
      if (type === 'error' && prev.some((t) => t.message === message && t.type === type)) return prev
      const next = [...prev, { id, message, type }]
      return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next
    })
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const success = useCallback((msg: string) => addToast(msg, 'success'), [addToast])
  const error = useCallback((msg: string) => addToast(msg, 'error'), [addToast])
  const info = useCallback((msg: string) => addToast(msg, 'info'), [addToast])

  // Значение стабильно: функции не меняются, поэтому эффекты с зависимостью
  // от toast больше не перезапускаются из-за каждого показанного сообщения.
  const value = useMemo(() => ({ success, error, info }), [success, error, info])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
