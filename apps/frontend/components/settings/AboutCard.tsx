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
          className="auth-link"
        >
          info.revisionworks.in
        </a>
      </p>
    </div>
  );
}
