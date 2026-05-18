import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-surface-100)] px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
