import { AppProvider } from '@/components/AppProvider'
import { StaffShell } from '@/components/StaffShell'

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <StaffShell>{children}</StaffShell>
    </AppProvider>
  )
}
