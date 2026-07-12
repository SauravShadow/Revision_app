import type { Metadata } from 'next';
import './globals.css';
import { StoreHydrator } from '@/components/StoreHydrator';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = { title: 'CE ESE Revision Manager', description: 'Track your Civil Engineering revision.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        <StoreHydrator>
          <AppShell>{children}</AppShell>
        </StoreHydrator>
      </body>
    </html>
  );
}
