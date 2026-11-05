'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Eraser, Hand, Info, PaintBucket, Plus, QrCode, Redo2, Save, Trash2, Undo2, ZoomIn, ZoomOut,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '@/components/AppProvider'
import { FloorGrid } from '@/components/floor/FloorGrid'
import { useToast } from '@/components/Toast'
import { Button, Empty, Field, Modal, Stepper, inputCls } from '@/components/ui'
import { erase, paint, type Ids, type LayoutEvent, type LayoutTable } from '@/lib/grid/grid'
import { token, uid } from '@/lib/id'
import type { Cell } from '@/lib/types'

type Tool = 'paint' | 'erase' | 'select'
const ids: Ids = { newId: uid, newToken: token }
const sig = (t: LayoutTable[]) =>
  JSON.stringify(
    [...t]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((x) => [x.id, x.code, x.seats, x.cells.map((c) => `${c.r},${c.c}`).sort()]),
  )

export default function FloorEditorPage() {
  const { backend, snap, run, refresh } = useApp()
  const toast = useToast()
  const [floorId, setFloorId] = useState<string | null>(null)
  const [draft, setDraft] = useState<LayoutTable[]>([])
  const [past, setPast] = useState<LayoutTable[][]>([])
  const [future, setFuture] = useState<LayoutTable[][]>([])
  const [tool, setTool] = useState<Tool>('paint')
  const [cell, setCell] = useState(44)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dim, setDim] = useState({ name: '', rows: 12, cols: 20 })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const draftRef = useRef<LayoutTable[]>([])
  draftRef.current = draft

  const floor = snap?.floors.find((f) => f.id === floorId) ?? snap?.floors[0]
  const saved = useMemo(
    () => (snap && floor ? snap.tables.filter((t) => t.floorId === floor.id) : []),
    [snap, floor],
  )
  const dirty =
    !!floor &&
    (sig(draft) !== sig(saved) || dim.name !== floor.name || dim.rows !== floor.rows || dim.cols !== floor.cols)

  // Nạp lại bản nháp khi đổi tầng, hoặc khi dữ liệu máy chủ đổi mà chưa có thay đổi dở dang
  const serverSig = sig(saved) + (floor ? `${floor.id}|${floor.name}|${floor.rows}|${floor.cols}` : '')
  useEffect(() => {
    if (!floor) return
    setDraft(saved.map((t) => ({ id: t.id, code: t.code, seats: t.seats, cells: t.cells, qrToken: t.qrToken, kind: t.kind, surcharge: t.surcharge })))
    setDim({ name: floor.name, rows: floor.rows, cols: floor.cols })
    setPast([])
    setFuture([])
    setSelectedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig])


  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const otherCodes = useMemo(
    () => (snap && floor ? snap.tables.filter((t) => t.floorId !== floor.id).map((t) => t.code) : []),
    [snap, floor],
  )

  const commit = useCallback(
    (next: LayoutTable[]) => {
      setPast((p) => [...p.slice(-49), draft])
      setFuture([])
      setDraft(next)
    },
    [draft],
  )
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p
      setFuture((f) => [draft, ...f])
      setDraft(p[p.length - 1])
      return p.slice(0, -1)
    })
  }, [draft])
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f
      setPast((p) => [...p, draft])
      setDraft(f[0])
      return f.slice(1)
    })
  }, [draft])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [undo, redo])

  if (!snap) return <div className="grid h-full place-items-center"><div className="size-9 animate-spin rounded-full border-4 border-wood-200 border-t-wood-500" /></div>
  if (!floor) {
    return (
      <div className="grid h-full place-items-center">
        <Empty icon={<Plus className="size-7" />} title="Chưa có tầng nào" hint="Tạo tầng đầu tiên để bắt đầu vẽ sơ đồ." />
        <Button variant="primary" onClick={() => run(() => backend.createFloor(snap.branch.id, 'Tầng trệt'))}>Tạo tầng trệt</Button>
      </div>
    )
  }

  /** Quay về bản trước đó nhưng vẫn giữ được lịch sử undo/redo */
  const restore = (to: LayoutTable[]) => {
    setPast((p) => [...p.slice(-49), draftRef.current])
    setFuture([])
    setDraft(to)
  }

  const message = (events: LayoutEvent[], before: LayoutTable[]) => {
    for (const e of events) {
      if (e.type === 'merged')
        toast({
          text: `Đã ghép ${e.codes.join(' + ')} thành ${e.into}`,
          tone: 'success',
          action: { label: 'Hoàn tác', run: () => restore(before) },
        })
      else if (e.type === 'split')
        toast({
          text: `${e.from} bị tách đôi: tạo thêm ${e.created.join(', ')}`,
          tone: 'info',
          action: { label: 'Hoàn tác', run: () => restore(before) },
        })
    }
  }

  function onStroke(cells: Cell[]) {
    if (tool === 'select') return
    const before = draft
    if (tool === 'paint') {
      const { tables, events } = paint(draft, cells, { reservedCodes: otherCodes, rows: dim.rows, cols: dim.cols }, ids)
      if (tables === draft || sig(tables) === sig(draft)) return
      commit(tables)
      message(events, before)
    } else {
      const { tables, events } = erase(draft, cells, { reservedCodes: otherCodes }, ids)
      if (sig(tables) === sig(draft)) return
      commit(tables)
      message(events, before)
    }
  }

  function resize(rows: number, cols: number) {
    const outside: Cell[] = []
    for (const t of draft) for (const c of t.cells) if (c.r >= rows || c.c >= cols) outside.push(c)
    if (outside.length) commit(erase(draft, outside, { reservedCodes: otherCodes }, ids).tables)
    setDim((d) => ({ ...d, rows, cols }))
  }

  const selected = draft.find((t) => t.id === selectedId)
  const codeClash =
    !!selected &&
    (draft.some((t) => t.id !== selected.id && t.code.trim().toLowerCase() === selected.code.trim().toLowerCase()) ||
      otherCodes.some((c) => c.toLowerCase() === selected.code.trim().toLowerCase()))
  const anyClash = draft.some((t) => draft.some((u) => u.id !== t.id && u.code.toLowerCase() === t.code.toLowerCase()))
  const savedIds = new Set(saved.map((t) => t.id))

  function patchSelected(p: Partial<LayoutTable>) {
    if (!selected) return
    commit(draft.map((t) => (t.id === selected.id ? { ...t, ...p } : t)))
  }

  async function save() {
    if (!floor) return
    if (anyClash || draft.some((t) => !t.code.trim())) {
      toast({ text: 'Mã bàn bị trùng hoặc để trống, hãy sửa trước khi lưu', tone: 'warn' })
      return
    }
    const keep = new Set(draft.map((t) => t.id))
    const lost = saved.filter((t) => !keep.has(t.id))
    const busy = lost.filter((t) => snap!.sessions.some((s) => s.tableId === t.id))
    if (busy.length && !window.confirm(`Bàn ${busy.map((t) => t.code).join(', ')} đang có khách. Xóa bàn sẽ mất các món đã gọi. Vẫn lưu?`)) return
    setSaving(true)
    const ok = await run(async () => {
      if (dim.name.trim() !== floor.name || dim.rows !== floor.rows || dim.cols !== floor.cols)
        await backend.updateFloor(floor.id, { name: dim.name.trim() || floor.name, rows: dim.rows, cols: dim.cols })
      await backend.saveLayout(floor.id, draft.map((t) => ({ ...t, code: t.code.trim(), floorId: floor.id, branchId: floor.branchId })))
      return true
    })
    setSaving(false)
    if (ok) {
      await refresh()
      toast({ text: 'Đã lưu sơ đồ', tone: 'success' })
    }
  }

  function switchFloor(id: string) {
    if (id === floor!.id) return
    if (dirty && !window.confirm('Sơ đồ tầng này chưa lưu. Chuyển tầng sẽ bỏ các thay đổi?')) return
    setFloorId(id)
  }

  async function addFloor() {
    if (dirty && !window.confirm('Sơ đồ tầng này chưa lưu. Tạo tầng mới sẽ bỏ các thay đổi?')) return
    const f = await run(() => backend.createFloor(snap!.branch.id, `Tầng ${snap!.floors.length + 1}`))
    if (f) {
      await refresh()
      setFloorId(f.id)
    }
  }

  const tools: { id: Tool; label: string; icon: typeof Hand; hint: string }[] = [
    { id: 'paint', label: 'Vẽ bàn', icon: PaintBucket, hint: 'Kéo qua các ô để tạo bàn' },
    { id: 'erase', label: 'Xóa ô', icon: Eraser, hint: 'Kéo để xóa ô khỏi bàn' },
    { id: 'select', label: 'Chọn bàn', icon: Hand, hint: 'Bấm vào bàn để sửa tên, số chỗ' },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-visible">
      {/* Vùng vẽ */}
      <div className="flex min-w-0 shrink-0 flex-col lg:min-h-0 lg:flex-1 lg:shrink">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-wood-100 bg-paper/90 px-3 py-2 sm:px-4 sm:py-2.5">
          <div className="flex rounded-xl bg-cream p-1 ring-1 ring-wood-200" role="radiogroup" aria-label="Công cụ">
            {tools.map(({ id, label, icon: Icon, hint }) => (
              <button
                key={id}
                role="radio"
                aria-checked={tool === id}
                title={hint}
                onClick={() => setTool(id)}
                className={clsx(
                  'touch-target flex items-center gap-2 rounded-lg px-3 text-sm font-semibold transition',
                  tool === id ? (id === 'erase' ? 'bg-brick text-white shadow-warm' : 'bg-wood-500 text-white shadow-warm') : 'text-wood-700 hover:bg-sand',
                )}
              >
                <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={undo} disabled={!past.length} aria-label="Hoàn tác" title="Ctrl+Z"><Undo2 className="size-[18px]" /></Button>
            <Button variant="ghost" onClick={redo} disabled={!future.length} aria-label="Làm lại" title="Ctrl+Y"><Redo2 className="size-[18px]" /></Button>
            <Button variant="ghost" onClick={() => setCell((c) => Math.max(24, c - 6))} aria-label="Thu nhỏ"><ZoomOut className="size-[18px]" /></Button>
            <Button variant="ghost" onClick={() => setCell((c) => Math.min(72, c + 6))} aria-label="Phóng to"><ZoomIn className="size-[18px]" /></Button>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {dirty && <span className="flex items-center gap-1.5 text-sm font-medium text-[#8a6417]"><span className="size-2 rounded-full bg-turmeric" /> Chưa lưu</span>}
            <Button variant="primary" onClick={save} disabled={!dirty || saving}>
              <Save className="size-4" /> {saving ? 'Đang lưu…' : 'Lưu sơ đồ'}
            </Button>
          </div>
        </div>

        <div className="scroll-thin h-[60dvh] overflow-auto bg-cream/40 p-3 sm:p-5 lg:h-auto lg:min-h-0 lg:flex-1">
          <div className="mx-auto w-fit">
            <FloorGrid
              rows={dim.rows}
              cols={dim.cols}
              cell={cell}
              tables={draft}
              selectedId={selectedId}
              onTableClick={tool === 'select' ? setSelectedId : undefined}
              toneOf={(t) => ({ tone: t.id === selectedId ? 'cooking' : 'empty' })}
              draw={tool === 'select' ? undefined : { mode: tool, onCommit: onStroke }}
            />
            <p className="mt-3 text-xs text-ink-soft">
              {draft.length} bàn · {draft.reduce((s, t) => s + t.seats, 0)} chỗ ngồi
            </p>
          </div>
        </div>
      </div>

      {/* Thanh bên */}
      <aside className="scroll-thin flex shrink-0 flex-col gap-4 overflow-y-auto border-t border-wood-200 bg-paper p-4 lg:w-80 lg:border-l lg:border-t-0">
        <section>
          <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-wood-500">Tầng</h3>
          <div className="flex flex-wrap gap-1.5">
            {snap.floors.map((f) => (
              <button
                key={f.id}
                onClick={() => switchFloor(f.id)}
                aria-pressed={f.id === floor.id}
                className={clsx(
                  'min-h-10 rounded-xl px-3.5 text-sm font-semibold transition',
                  f.id === floor.id ? 'bg-wood-800 text-white' : 'bg-cream text-wood-700 ring-1 ring-wood-200 hover:bg-sand',
                )}
              >
                {f.name}
              </button>
            ))}
            <button onClick={addFloor} aria-label="Thêm tầng" className="grid min-h-10 min-w-10 place-items-center rounded-xl border border-dashed border-wood-300 text-wood-600 hover:bg-cream">
              <Plus className="size-4" />
            </button>
          </div>
          <div className="mt-3 space-y-3 rounded-2xl bg-white p-3 ring-1 ring-wood-100">
            <Field label="Tên tầng">
              <input className={inputCls} value={dim.name} onChange={(e) => setDim((d) => ({ ...d, name: e.target.value }))} />
            </Field>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-wood-700">Số hàng</span>
              <Stepper size="sm" value={dim.rows} min={4} max={40} onChange={(v) => resize(v, dim.cols)} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-wood-700">Số cột</span>
              <Stepper size="sm" value={dim.cols} min={4} max={40} onChange={(v) => resize(dim.rows, v)} />
            </div>
            {snap.floors.length > 1 && (
              <Button variant="danger" size="sm" className="w-full" onClick={() => setDeleting(true)}>
                <Trash2 className="size-4" /> Xóa tầng này
              </Button>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-wood-500">Bàn đang chọn</h3>
          {selected ? (
            <div className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-wood-100">
              <Field label="Mã bàn">
                <input
                  className={clsx(inputCls, codeClash && 'ring-2 ring-brick')}
                  value={selected.code}
                  onChange={(e) => patchSelected({ code: e.target.value })}
                  aria-invalid={codeClash}
                />
                {codeClash && <span className="mt-1 block text-xs text-brick">Mã này đã được dùng</span>}
              </Field>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-wood-700">Số chỗ ngồi</span>
                <Stepper size="sm" value={selected.seats} min={1} max={200} onChange={(v) => patchSelected({ seats: v })} />
              </div>
              <p className="text-xs text-ink-soft">{selected.cells.length} ô</p>
              <div className="flex gap-2">
                {savedIds.has(selected.id) ? (
                  <Link href={`/qr?table=${selected.id}`} className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-cream px-3 text-[13px] font-semibold text-wood-800 ring-1 ring-wood-200 hover:bg-sand">
                    <QrCode className="size-4" /> Mã QR
                  </Link>
                ) : (
                  <span className="flex-1 rounded-xl bg-cream px-3 py-2 text-center text-xs text-ink-soft">Lưu sơ đồ để có mã QR</span>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    commit(draft.filter((t) => t.id !== selected.id))
                    setSelectedId(null)
                  }}
                >
                  <Trash2 className="size-4" /> Xóa bàn
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-wood-200 p-4 text-sm text-ink-soft">
              Chọn công cụ <b>Chọn bàn</b> rồi bấm vào một bàn để đổi tên, số chỗ.
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-wood-100/70 p-4 text-sm leading-relaxed text-wood-800">
          <h3 className="mb-1.5 flex items-center gap-2 font-display font-semibold"><Info className="size-4" /> Cách vẽ bàn</h3>
          <ul className="list-disc space-y-1 pl-5 text-[13px]">
            <li>Kéo chuột (hoặc ngón tay) qua các ô để tạo bàn.</li>
            <li>Các ô <b>sát nhau</b> tự ghép thành một bàn; vẽ nối hai bàn sẽ gộp chúng lại.</li>
            <li>Xóa ô giữa một bàn dài sẽ tự tách thành hai bàn.</li>
          </ul>
        </section>
      </aside>

      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Xóa ${floor.name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>Hủy</Button>
            <Button
              variant="danger"
              onClick={async () => {
                const id = floor.id
                setDeleting(false)
                await run(() => backend.deleteFloor(id))
                setFloorId(null)
                await refresh()
              }}
            >
              Xóa tầng và {saved.length} bàn
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">Toàn bộ bàn, mã QR và các món đang gọi của tầng này sẽ bị xóa. Không thể hoàn tác.</p>
      </Modal>
    </div>
  )
}
