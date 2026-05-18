import { Sidebar } from '../../components/shell/sidebar';
import { BottomNav } from '../../components/shell/bottom-nav';
import { AuthGuard } from '../../components/auth/auth-guard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-[var(--color-surface-50)]">
        {/* Fixed left sidebar — desktop only */}
        <Sidebar />

        {/* Main content — offset by sidebar width on desktop, clears bottom nav on mobile */}
        <main className="flex-1 lg:ml-[var(--width-sidebar)] pb-safe-nav lg:pb-0">
          <div className="content-container py-6">{children}</div>
        </main>
      </div>

      {/* Fixed bottom nav — mobile only */}
      <BottomNav />
    </AuthGuard>
  );
}
