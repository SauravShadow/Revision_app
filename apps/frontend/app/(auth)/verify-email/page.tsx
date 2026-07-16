'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmail, resendVerification } from '@/lib/auth/client';

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [resendNotice, setResendNotice] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('This verification link is missing its token.');
      return;
    }
    verifyEmail(token).then((r) => {
      if (r.error) {
        setState('error');
        setMessage(r.error);
      } else {
        setState('success');
        setMessage(r.message ?? 'Email verified — you can now sign in.');
      }
    });
  }, [token]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendNotice('');
    const r = await resendVerification(identifier.trim());
    setResendNotice(r.error ?? r.message ?? '');
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

        {state === 'verifying' && (
          <>
            <h1 className="auth-title">Verifying…</h1>
            <p className="auth-subtitle">Checking your verification link.</p>
          </>
        )}

        {state === 'success' && (
          <>
            <h1 className="auth-title">You&apos;re verified</h1>
            <p className="auth-subtitle">{message}</p>
            <p className="auth-footer">
              <Link href="/login" className="auth-link">Sign in</Link>
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <h1 className="auth-title">Link problem</h1>
            <p className="auth-error">{message}</p>
            <p className="auth-subtitle">
              If you already verified earlier, just sign in — otherwise request a new link below.
            </p>
            <form onSubmit={handleResend} className="auth-form" noValidate>
              <div className="auth-field">
                <label htmlFor="verify-identifier" className="auth-label">Username or email</label>
                <input
                  id="verify-identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="auth-input"
                  placeholder="your_username"
                  required
                />
              </div>
              {resendNotice && <p className="auth-footer">{resendNotice}</p>}
              <button type="submit" className="auth-btn" disabled={!identifier}>
                Send a new link
              </button>
            </form>
            <p className="auth-footer">
              <Link href="/login" className="auth-link">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
