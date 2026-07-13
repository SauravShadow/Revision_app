'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { register } from '@/lib/auth/client';
import { DOMAIN_LABELS, DOMAIN_COLORS } from '@/lib/auth/types';
import type { Domain } from '@/lib/auth/types';

const DOMAINS: { id: Domain; emoji: string; description: string }[] = [
  {
    id: 'civil-engineering',
    emoji: '🏗️',
    description: 'UPSC ESE Civil — Structures, Fluid Mechanics, Geotechnical & more',
  },
  {
    id: 'software-engineering',
    emoji: '💻',
    description: 'DSA, OS, DBMS, Networks, System Design & more',
  },
  {
    id: 'gate-cs',
    emoji: '🖥️',
    description: 'GATE CS — Theory of Computation, Algorithms, Compiler Design & more',
  },
  {
    id: 'mechanical-engineering',
    emoji: '⚙️',
    description: 'UPSC ESE Mechanical — Thermodynamics, Fluid Mechanics, Manufacturing & more',
  },
  {
    id: 'electrical-engineering',
    emoji: '⚡',
    description: 'UPSC ESE Electrical — Circuits, Power Systems, Control Systems & more',
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | 'domain'>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setError('Only letters, numbers, and underscores allowed');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPwd) {
      setError('Passwords do not match');
      return;
    }
    setStep('domain');
  }

  async function handleRegister() {
    if (!selectedDomain) return;
    setError('');
    setLoading(true);
    const result = await register(username.trim(), password, selectedDomain);
    setLoading(false);
    if ('error' in result) {
      setError(result.error);
      setStep('credentials');
    } else {
      router.replace('/');
      router.refresh();
    }
  }

  return (
    <div className="auth-card-wrap">
      <div className="auth-glow auth-glow--a" />
      <div className="auth-glow auth-glow--b" />

      <div className={`auth-card ${step === 'domain' ? 'auth-card--wide' : ''}`}>
        {/* Logo */}
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="currentColor" opacity=".15"/>
              <path d="M7 21V14l7-7 7 7v7H17v-5h-6v5H7Z" fill="currentColor"/>
            </svg>
          </div>
          <span className="auth-brand-name">RevisionOS</span>
        </div>

        {step === 'credentials' ? (
          <>
            <h1 className="auth-title">Create your account</h1>
            <p className="auth-subtitle">Track, revise, and master your exam syllabus</p>

            <form onSubmit={handleCredentialsSubmit} className="auth-form" noValidate>
              <div className="auth-field">
                <label htmlFor="reg-username" className="auth-label">Username</label>
                <input
                  id="reg-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="auth-input"
                  placeholder="your_username"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="reg-password" className="auth-label">Password</label>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input"
                  placeholder="Min 6 characters"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="reg-confirm" className="auth-label">Confirm Password</label>
                <input
                  id="reg-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  className="auth-input"
                  placeholder="Re-enter password"
                  required
                />
              </div>

              {error && <p className="auth-error">{error}</p>}

              <button
                type="submit"
                id="reg-next-btn"
                className="auth-btn"
                disabled={!username || !password || !confirmPwd}
              >
                Continue →
              </button>
            </form>

            <p className="auth-footer">
              Already have an account?{' '}
              <Link href="/login" className="auth-link">Sign in</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="auth-title">Choose your domain</h1>
            <p className="auth-subtitle">
              Your subjects will be pre-seeded based on your exam. You can customise everything later.
            </p>

            <div className="domain-grid">
              {DOMAINS.map((d) => (
                <button
                  key={d.id}
                  id={`domain-${d.id}`}
                  className={`domain-card ${selectedDomain === d.id ? 'domain-card--selected' : ''}`}
                  style={{ '--domain-color': DOMAIN_COLORS[d.id] } as React.CSSProperties}
                  onClick={() => setSelectedDomain(d.id)}
                  type="button"
                >
                  <span className="domain-emoji">{d.emoji}</span>
                  <span className="domain-name">{DOMAIN_LABELS[d.id]}</span>
                  <span className="domain-desc">{d.description}</span>
                  {selectedDomain === d.id && (
                    <span className="domain-check">✓</span>
                  )}
                </button>
              ))}
            </div>

            {error && <p className="auth-error">{error}</p>}

            <div className="auth-domain-actions">
              <button
                type="button"
                className="auth-btn-ghost"
                onClick={() => { setStep('credentials'); setError(''); }}
              >
                ← Back
              </button>
              <button
                id="reg-submit"
                type="button"
                className="auth-btn"
                disabled={!selectedDomain || loading}
                onClick={handleRegister}
              >
                {loading ? <span className="auth-spinner" /> : 'Create Account'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
