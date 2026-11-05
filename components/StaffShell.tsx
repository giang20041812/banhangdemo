'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, ChevronDown, LayoutGrid, LogOut, MapPin, PencilRuler, Plus, QrCode, RotateCcw, UtensilsCrossed } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from './AppProvider'
import { Button, Field, Modal, inputCls } from './ui'

const NAV = [
  { href: '/van-hanh', label: 'Vận hành', icon: LayoutGrid },
  { href: '/so-do', label: 'Sơ đồ bàn', icon: PencilRuler },
  { href: '/thuc-don', label: 'Thực đơn', icon: BookOpen },
  { href: '/qr', label: 'Mã QR', icon: QrCode },
]

export function StaffShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const { backend, branches, branchesLoaded, snap, setBranchId, reloadBranches, run, signOut } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  const current = snap?.branch

  async function addBranch() {
    if (!name.trim()) return
    const b = await run(() => backend.createBranch({ name: name.trim(), address: address.trim() }))
    if (b) {
      await reloadBranches()
      setBranchId(b.id)
      setAdding(false)
      setName('')
      setAddress('')
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="wood-surface relative z-30 flex shrink-0 items-center gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-wood-100 shadow-warm sm:gap-3 sm:px-5">
        <Link href="/van-hanh" className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-turmeric/90 text-wood-900 shadow-inner">
            <UtensilsCrossed className="size-5" />
          </span>
          <span className="hidden font-display text-xl font-semibold leading-none text-white sm:block">
            Vị Quê Mình
          </span>
        </Link>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="touch-target flex items-center gap-2 rounded-xl bg-white/10 px-3 text-left text-sm hover:bg-white/15"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
          >
            <MapPin className="size-4 shrink-0 text-turmeric" />
            <span className="max-w-[9.5rem] truncate font-medium text-white min-[400px]:max-w-[13rem] sm:max-w-[16rem]">{current?.name ?? '…'}</span>
            <ChevronDown className="size-4 opacity-70" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-50 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-72 animate-pop overflow-hidden rounded-2xl bg-paper p-1.5 text-ink shadow-lift" role="listbox">
                {branches.map((b) => (
                  <button
                    key={b.id}
                    role="option"
                    aria-selected={b.id === current?.id}
                    onClick={() => {
                      setBranchId(b.id)
                      setMenuOpen(false)
                    }}
                    className={clsx(
                      'flex w-full flex-col rounded-xl px-3 py-2.5 text-left hover:bg-cream',
                      b.id === current?.id && 'bg-cream ring-1 ring-wood-200',
                    )}
                  >
                    <span className="text-sm font-semibold text-wood-800">{b.name}</span>
                    {b.address && <span className="text-xs text-ink-soft">{b.address}</span>}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setAdding(true)
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-wood-300 px-3 py-2.5 text-sm font-semibold text-wood-600 hover:bg-cream"
                >
                  <Plus className="size-4" /> Thêm chi nhánh
                </button>
                {backend.mode === 'demo' && (
                  <button
                    onClick={() => {
                      if (!window.confirm('Xóa toàn bộ dữ liệu demo và nạp lại dữ liệu mẫu?')) return
                      try {
                        localStorage.removeItem('vqm-demo-db-v1')
                        localStorage.removeItem('vqm-branch')
                      } catch {}
                      window.location.reload()
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-ink-soft hover:bg-cream"
                  >
                    <RotateCcw className="size-4" /> Đặt lại dữ liệu demo
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Điều hướng chính">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'touch-target flex shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition',
                  active ? 'bg-paper text-wood-800 shadow-warm' : 'text-wood-100 hover:bg-white/10',
                )}
              >
                <Icon className="size-[18px]" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            )
          })}
          {backend.mode === 'demo' && (
            <span className="ml-1 hidden rounded-full bg-turmeric px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-wood-900 lg:inline">
              Demo
            </span>
          )}
          {backend.mode === 'supabase' && (
            <button onClick={() => void signOut()} aria-label="Đăng xuất" className="touch-target grid place-items-center rounded-xl text-wood-100 hover:bg-white/10">
              <LogOut className="size-[18px]" />
            </button>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:hidden">
          {backend.mode === 'demo' && (
            <span className="rounded-full bg-turmeric px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-wood-900">Demo</span>
          )}
          {backend.mode === 'supabase' && (
            <button onClick={() => void signOut()} aria-label="Đăng xuất" className="touch-target grid place-items-center rounded-xl text-wood-100 hover:bg-white/10">
              <LogOut className="size-[18px]" />
            </button>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 pb-[var(--bottom-nav-h)] md:pb-0">
        {branchesLoaded && branches.length === 0 ? (
          <div className="grid h-full place-items-center p-6">
            <div className="max-w-md animate-pop text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-wood-500 text-white shadow-warm">
                <UtensilsCrossed className="size-8" />
              </span>
              <h1 className="mt-4 font-display text-2xl font-semibold text-wood-800">Chào mừng đến Vị Quê Mình</h1>
              <p className="mt-2 text-sm text-ink-soft">Bắt đầu bằng việc tạo chi nhánh đầu tiên. Sau đó bạn vẽ sơ đồ bàn, nhập thực đơn và in mã QR.</p>
              <div className="mt-5">
                <Button variant="primary" size="lg" onClick={() => setAdding(true)}>
                  <Plus className="size-5" /> Tạo chi nhánh đầu tiên
                </Button>
              </div>
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      <nav
        aria-label="Điều hướng chính"
        className="wood-surface fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 pb-[env(safe-area-inset-bottom)] shadow-lift md:hidden"
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition',
                active ? 'text-turmeric' : 'text-wood-100/80 active:bg-white/10',
              )}
            >
              <span className={clsx('grid h-7 w-12 place-items-center rounded-full transition', active && 'bg-white/15')}>
                <Icon className="size-5" />
              </span>
              {label}
            </Link>
          )
        })}
      </nav>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Thêm chi nhánh"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>Hủy</Button>
            <Button variant="primary" onClick={addBranch} disabled={!name.trim()}>Tạo chi nhánh</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Tên chi nhánh">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Vị Quê Mình · Quận 3" autoFocus />
          </Field>
          <Field label="Địa chỉ">
            <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Số nhà, đường, quận" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
