'use client';
import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '@/lib/auth/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const r = await forgotPassword(email.trim());
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

        <h1 className="auth-title">Forgot your password?</h1>
        <p className="auth-subtitle">Enter your account email and we&apos;ll send a reset link.</p>

        {message ? (
          <p className="auth-subtitle">{message}</p>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="forgot-email" className="auth-label">Email</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                placeholder="you@example.com"
                required
                disabled={loading}
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="auth-btn" disabled={loading || !email}>
              {loading ? <span className="auth-spinner" /> : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link href="/login" className="auth-link">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
