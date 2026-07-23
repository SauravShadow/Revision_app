'use client';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login, resendVerification } from '@/lib/auth/client';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [notice, setNotice] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    const result = await login(username.trim(), password);
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
      setUnverified(result.code === 'EMAIL_UNVERIFIED');
    } else {
      setSession(result.session);
      router.replace('/');
    }
  }

  return (
    <div className="auth-card-wrap">
      <div className="auth-glow auth-glow--a" />
      <div className="auth-glow auth-glow--b" />

      <div className="auth-card">
        {/* Logo / brand */}
        <div className="auth-brand">
          <Image className="auth-brand-icon" src="/logo-icon-transparent.png" alt="" width={36} height={36} priority />
          <span className="auth-brand-name">RevisionWorks</span>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to continue your revision</p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="login-username" className="auth-label">Username</label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="auth-input"
              placeholder="your_username"
              required
              disabled={loading}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="login-password" className="auth-label">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}

          {unverified && (
            <button
              type="button"
              className="auth-btn-ghost"
              onClick={async () => {
                const r = await resendVerification(username.trim());
                setNotice(r.error ?? r.message ?? '');
              }}
            >
              Resend verification email
            </button>
          )}
          {notice && <p className="auth-footer">{notice}</p>}

          <button
            type="submit"
            id="login-submit"
            className="auth-btn"
            disabled={loading || !username || !password}
          >
            {loading ? (
              <span className="auth-spinner" />
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="auth-link">Create one</Link>
        </p>
        <p className="auth-footer">
          <Link href="/forgot-password" className="auth-link">Forgot password?</Link>
        </p>
      </div>
    </div>
  );
}
