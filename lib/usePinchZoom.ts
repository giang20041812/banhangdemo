import { useEffect } from 'react'

/** Chụm 2 ngón để thu/phóng: gọi onScale(tỉ lệ thay đổi so với lần đo trước).
 *  Nhận phần tử (lưu bằng state) để gắn đúng lúc phần tử mới xuất hiện. */
export function usePinchZoom(el: HTMLElement | null, onScale: (ratio: number) => void) {
  useEffect(() => {
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
  }, [el, onScale])
}
