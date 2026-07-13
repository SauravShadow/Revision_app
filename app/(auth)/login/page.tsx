'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/auth/client';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(username.trim(), password);
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
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
          <div className="auth-brand-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="currentColor" opacity=".15"/>
              <path d="M7 21V14l7-7 7 7v7H17v-5h-6v5H7Z" fill="currentColor"/>
            </svg>
          </div>
          <span className="auth-brand-name">RevisionOS</span>
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
      </div>
    </div>
  );
}
