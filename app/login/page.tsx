'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UtensilsCrossed } from 'lucide-react'
import { isSupabaseConfigured } from '@/lib/backend'
import { getSupabase } from '@/lib/backend/supabase'
import { Button, Field, inputCls } from '@/components/ui'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) router.replace('/van-hanh')
  }, [router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError('Email hoặc mật khẩu chưa đúng.')
    else router.replace('/van-hanh')
  }

  return (
    <div className="wood-surface grid min-h-dvh place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm animate-pop rounded-3xl bg-paper p-7 shadow-lift">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-wood-500 text-white shadow-warm">
            <UtensilsCrossed className="size-7" />
          </span>
          <h1 className="font-display text-2xl font-semibold text-wood-800">Vị Quê Mình</h1>
          <p className="text-sm text-ink-soft">Đăng nhập dành cho nhân viên</p>
        </div>
        <div className="space-y-4">
          <Field label="Email">
            <input className={inputCls} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Mật khẩu">
            <input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p role="alert" className="rounded-lg bg-brick-soft px-3 py-2 text-sm text-brick">{error}</p>}
          <Button variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>
        </div>
      </form>
    </div>
  )
}
