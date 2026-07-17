'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { getEmailStatus, updateEmail } from '@/lib/auth/client';
import { OrganisationCard } from '@/components/settings/OrganisationCard';

type EmailStatus = { email: string | null; verified: boolean };

export default function SettingsPage() {
  const { session, loading } = useAuth();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    getEmailStatus().then(setStatus);
  }, [session]);

  if (loading || !session) return null; // AuthProvider redirects logged-out visitors

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    const r = await updateEmail(email.trim());
    setBusy(false);
    if (r.error) {
      setError(r.error);
    } else {
      setNotice(r.message ?? '');
      setStatus({ email: email.trim(), verified: false });
    }
  }

  return (
    <div className="auth-card-wrap">
      <div className="auth-card">
        <h1 className="auth-title">Account settings</h1>
        <p className="auth-subtitle">Signed in as {session.username}</p>

        <div className="auth-field">
          <span className="auth-label">Email</span>
          {status === null ? (
            <p className="auth-subtitle">Loading…</p>
          ) : status.email === null ? (
            <p className="auth-subtitle">No email on this account</p>
          ) : (
            <p className="auth-subtitle">
              {status.email} — {status.verified ? 'Verified' : 'Awaiting verification'}
            </p>
          )}
        </div>

        {status !== null && !status.verified && (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="settings-email" className="auth-label">Email</label>
              <input
                id="settings-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                placeholder="you@example.com"
                required
                disabled={busy}
              />
            </div>
            {error && <p className="auth-error">{error}</p>}
            {notice && <p className="auth-footer">{notice}</p>}
            <button type="submit" className="auth-btn" disabled={busy || !email}>
              {busy ? <span className="auth-spinner" /> : 'Send verification email'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link href="/" className="auth-link">← Back to the app</Link>
        </p>
      </div>

      <OrganisationCard />
    </div>
  );
}
