'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getBackend, type Backend } from '@/lib/backend'
import type { Branch, Snapshot } from '@/lib/types'
import { useToast } from './Toast'

interface AppCtx {
  backend: Backend
  branches: Branch[]
  /** đã tải xong danh sách chi nhánh (để phân biệt "đang tải" với "chưa có chi nhánh nào") */
  branchesLoaded: boolean
  snap: Snapshot | null
  loading: boolean
  now: Date
  setBranchId: (id: string) => void
  refresh: () => Promise<void>
  reloadBranches: () => Promise<void>
  /** Chạy thao tác, tự báo lỗi bằng toast; trả về undefined nếu lỗi */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>
}

const Ctx = createContext<AppCtx | null>(null)
export const useApp = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp ngoài AppProvider')
  return v
}

const BRANCH_KEY = 'vqm-branch'

let audioCtx: AudioContext | null = null
function getAudio(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new AC()
    }
    return audioCtx
  } catch {
    return null
  }
}

/** Thông báo đẩy của hệ điều hành (hiện cả khi tab nằm nền / khóa màn hình điện thoại) */
function showPush(tableCode: string, body: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const opts = { body, tag: 'vqm-order', icon: '/icon.png', requireInteraction: true } as NotificationOptions
    const title = `Bàn ${tableCode} vừa gọi món`
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then((r) => r.showNotification(title, opts)).catch(() => new Notification(title, opts))
    } else new Notification(title, opts)
  } catch {
    /* bỏ qua */
  }
}

/** Chuông "ding-dong" + đọc to bằng tiếng Việt */
function notifySound(tableCode: string, body: string) {
  showPush(tableCode, body)
  const ctx = getAudio()
  if (ctx) {
    void ctx.resume().catch(() => {})
    const t0 = ctx.currentTime
    ;[880, 1175, 880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      const t = t0 + i * 0.25
      o.type = 'sine'
      o.frequency.setValueAtTime(f, t)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.26)
    })
  }
  // Giọng đọc thu sẵn (public/sounds): không phụ thuộc giọng tiếng Việt trên máy
  const num = parseInt(tableCode.replace(/\D/g, ''), 10)
  const src = (n: string) => `/sounds/${n}.wav`
  const audio = new Audio(src(num >= 1 && num <= 99 ? `ban-${num}` : 'khach-goi-mon'))
  audio.onerror = () => {
    if (!audio.src.endsWith('khach-goi-mon.wav')) void new Audio(src('khach-goi-mon')).play().catch(() => {})
  }
  setTimeout(() => void audio.play().catch(() => {}), 1000)
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast()
  const [backend, setBackend] = useState<Backend | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchesLoaded, setBranchesLoaded] = useState(false)
  const [branchId, setBranchIdState] = useState<string | null>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [now, setNow] = useState(() => new Date())
  const seenOrders = useRef<Set<string> | null>(null)
  const branchIdRef = useRef<string | null>(null)
  branchIdRef.current = branchId

  useEffect(() => {
    setBackend(getBackend())
  }, [])

  // Trình duyệt chỉ cho phát âm thanh sau khi người dùng chạm/bấm lần đầu: mở khóa ở đây
  useEffect(() => {
    const unlock = () => {
      void getAudio()?.resume().catch(() => {})
      try {
        if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
        if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js')
      } catch {}
      try {
        window.speechSynthesis?.getVoices()
      } catch {}
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  const run = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      try {
        return await fn()
      } catch (e) {
        toast({ text: e instanceof Error ? e.message : 'Có lỗi xảy ra', tone: 'warn' })
        return undefined
      }
    },
    [toast],
  )

  const reloadBranches = useCallback(async () => {
    if (!backend) return
    const list = await backend.listBranches()
    setBranches(list)
    setBranchesLoaded(true)
    setBranchIdState((cur) => {
      if (cur && list.some((b) => b.id === cur)) return cur
      let saved: string | null = null
      try {
        saved = localStorage.getItem(BRANCH_KEY)
      } catch {}
      return list.find((b) => b.id === saved)?.id ?? list[0]?.id ?? null
    })
  }, [backend])

  useEffect(() => {
    void reloadBranches()
  }, [reloadBranches])

  const refresh = useCallback(async () => {
    const id = branchIdRef.current
    if (!backend || !id) return
    try {
      const next = await backend.load(id)
      if (branchIdRef.current !== id) return
      // phát hiện lượt gọi mới để báo cho nhân viên
      const known = seenOrders.current
      const ids = new Set(next.orders.map((o) => o.id))
      if (known) {
        const fresh = next.orders.filter((o) => !known.has(o.id) && o.source === 'qr')
        if (fresh.length) {
          const o = fresh[fresh.length - 1]
          const t = next.tables.find((x) => x.id === o.tableId)
          const n = next.orderItems.filter((i) => i.orderId === o.id).reduce((s, i) => s + i.qty, 0)
          toast({ text: `Bàn ${t?.code ?? ''} vừa gọi ${n} món (lượt ${o.seq})`, tone: 'info' })
          notifySound(t?.code ?? '', `Bàn ${t?.code ?? ''} vừa gọi ${n} món (lượt ${o.seq})`)
        }
      }
      seenOrders.current = ids
      // đồng bộ đồng hồ UI với thời điểm dữ liệu vừa tải, nếu không món vừa báo hết sẽ bị coi là "hẹn giờ"
      setNow(new Date())
      setSnap(next)
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : 'Không tải được dữ liệu', tone: 'warn' })
    }
  }, [backend, toast])

  // Tải & đăng ký realtime theo chi nhánh
  useEffect(() => {
    if (!backend || !branchId) return
    seenOrders.current = null
    setSnap(null)
    void refresh()
    const unsub = backend.subscribe(branchId, () => void refresh())
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      unsub()
      window.removeEventListener('focus', onFocus)
    }
  }, [backend, branchId, refresh])

  // Đồng hồ: để món hết theo hẹn giờ và thời gian chờ tự cập nhật
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20_000)
    return () => clearInterval(id)
  }, [])

  const setBranchId = useCallback((id: string) => {
    setBranchIdState(id)
    try {
      localStorage.setItem(BRANCH_KEY, id)
    } catch {}
  }, [])

  const value = useMemo<AppCtx | null>(
    () =>
      backend
        ? { backend, branches, branchesLoaded, snap, loading: !snap, now, setBranchId, refresh, reloadBranches, run }
        : null,
    [backend, branches, branchesLoaded, snap, now, setBranchId, refresh, reloadBranches, run],
  )

  if (!value) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="size-9 animate-spin rounded-full border-4 border-wood-200 border-t-wood-500" />
      </div>
    )
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
