'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { resetPassword } from '@/lib/auth/client';

function ResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPwd) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    const r = await resetPassword(token, password);
    setLoading(false);
    if (r.error) setError(r.error);
    else setMessage(r.message ?? '');
  }

  return (
    <div className="auth-card-wrap">
      <div className="auth-glow auth-glow--a" />
      <div className="auth-glow auth-glow--b" />
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="currentColor" opacity=".15" />
              <path d="M7 21V14l7-7 7 7v7H17v-5h-6v5H7Z" fill="currentColor" />
            </svg>
          </div>
          <span className="auth-brand-name">RevisionOS</span>
        </div>

        <h1 className="auth-title">Choose a new password</h1>

        {message ? (
          <>
            <p className="auth-subtitle">{message}</p>
            <p className="auth-footer">
              <Link href="/login" className="auth-link">Sign in</Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="reset-password" className="auth-label">New password</label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                placeholder="Min 6 characters"
                required
                disabled={loading}
              />
            </div>
            <div className="auth-field">
              <label htmlFor="reset-confirm" className="auth-label">Confirm new password</label>
              <input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                className="auth-input"
                placeholder="Re-enter password"
                required
                disabled={loading}
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="auth-btn" disabled={loading || !password || !confirmPwd}>
              {loading ? <span className="auth-spinner" /> : 'Reset password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
