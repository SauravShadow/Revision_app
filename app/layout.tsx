import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';
import { StoreHydrator } from '@/components/StoreHydrator';
import { DndProvider } from '@/components/dnd/DndProvider';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = { title: 'CE ESE Revision Manager', description: 'Track your Civil Engineering revision.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        <StoreHydrator>
          <DndProvider>
            <AppShell>{children}</AppShell>
          </DndProvider>
        </StoreHydrator>
      </body>
    </html>
  );
}
