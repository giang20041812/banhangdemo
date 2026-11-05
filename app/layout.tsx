import type { Metadata, Viewport } from 'next'
import { Be_Vietnam_Pro, Lora } from 'next/font/google'
import { ToastProvider } from '@/components/Toast'
import './globals.css'

const sans = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam',
  display: 'swap',
})
const serif = Lora({
  subsets: ['vietnamese', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-lora',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Quản lý bàn & gọi món',
  description: 'Quản lý bàn và gọi món tại chỗ',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#4a2e15',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
