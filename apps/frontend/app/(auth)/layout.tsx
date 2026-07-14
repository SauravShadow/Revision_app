// Unauthenticated layout — no sidebar, no shell. Pure centered card experience.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      {children}
    </div>
  );
}
