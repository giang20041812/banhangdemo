import { useEffect, type RefObject } from 'react'

/** Chụm 2 ngón để thu/phóng: gọi onScale(tỉ lệ thay đổi so với lần đo trước) */
export function usePinchZoom(ref: RefObject<HTMLElement | null>, onScale: (ratio: number) => void) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let last = 0
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const start = (e: TouchEvent) => {
      last = e.touches.length === 2 ? dist(e.touches) : 0
    }
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !last) return
      e.preventDefault()
      const d = dist(e.touches)
      if (d > 0) onScale(d / last)
      last = d
    }
    const end = (e: TouchEvent) => {
      last = e.touches.length === 2 ? dist(e.touches) : 0
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', end, { passive: true })
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [ref, onScale])
}
