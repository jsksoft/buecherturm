'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '../../../lib/trpc/client';
import { useSession } from '../../../providers/session-provider';
import type { Session } from '../../../lib/session';

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldError, setFieldError] = useState<{
    email?: string;
    password?: string;
    displayName?: string;
  }>({});

  const mutation = trpc.auth.register.useMutation({
    onSuccess(data) {
      if (data.session) {
        const session: Session = {
          userId: data.userId,
          accessToken: data.session.accessToken,
          refreshToken: data.session.refreshToken,
          expiresAt: data.session.expiresAt,
        };
        login(session);
        router.replace('/app');
      } else {
        // User created but sign-in token unavailable — redirect to login.
        router.replace('/login');
      }
    },
  });

  function validate(): boolean {
    const errors: typeof fieldError = {};
    if (!email) errors.email = 'Email is required';
    if (password.length < 8) errors.password = 'Minimum 8 characters';
    setFieldError(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate({
      email,
      password,
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
    });
  }

  return (
    <div className="card p-8">
      {/* Brand header */}
      <div className="mb-8 text-center">
        <span className="text-3xl" aria-hidden="true">📚</span>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--color-brand-700)]">Bücherturm</h1>
        <p className="mt-1 text-sm text-[oklch(50%_0.02_75)]">Create your private book tracker</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-[oklch(25%_0.02_75)]">
            Display name{' '}
            <span className="font-normal text-[oklch(60%_0.02_75)]">(optional)</span>
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="auth-input mt-1"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[oklch(25%_0.02_75)]">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="auth-input mt-1"
            aria-describedby={fieldError.email ? 'email-err' : undefined}
          />
          {fieldError.email && (
            <p id="email-err" className="mt-1 text-xs text-[var(--color-error)]">
              {fieldError.email}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[oklch(25%_0.02_75)]">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            className="auth-input mt-1"
            aria-describedby={fieldError.password ? 'pw-err' : undefined}
          />
          {fieldError.password && (
            <p id="pw-err" className="mt-1 text-xs text-[var(--color-error)]">
              {fieldError.password}
            </p>
          )}
        </div>

        {mutation.error && (
          <p role="alert" className="rounded-lg bg-[oklch(96%_0.02_25)] px-4 py-3 text-sm text-[var(--color-error)]">
            {mutation.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="auth-btn-primary"
        >
          {mutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[oklch(50%_0.02_75)]">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-[var(--color-brand-600)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
