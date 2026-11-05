/** Sinh id / token an toàn cả trên http (điện thoại quét QR qua mạng LAN không có crypto.randomUUID) */
function bytes(n: number): Uint8Array {
  const a = new Uint8Array(n)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a)
  else for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256)
  return a
}

export function uid(): string {
  const b = bytes(16)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export function token(len = 14): string {
  return [...bytes(len)].map((x) => ALPHABET[x % ALPHABET.length]).join('')
}
