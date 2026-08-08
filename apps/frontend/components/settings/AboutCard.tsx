import { ExternalLink } from 'lucide-react';
import { MARKETING_URL } from '@/lib/site';

export function AboutCard() {
  return (
    <div className="auth-card">
      <h2 className="auth-title">About</h2>
      <p className="auth-subtitle">
        RevisionWorks is spaced-repetition revision tracking for students and
        coaching centres.
      </p>
      <p className="auth-footer">
        <a
          href={MARKETING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="site-link inline-flex items-center gap-1.5 font-semibold"
        >
          info.revisionworks.in
          <ExternalLink size={13} className="shrink-0" aria-hidden />
        </a>
      </p>
    </div>
  );
}
