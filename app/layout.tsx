import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import 'katex/dist/katex.min.css';
import './globals.css';
import { StoreHydrator } from '@/components/StoreHydrator';
import { DndProvider } from '@/components/dnd/DndProvider';
import { AppShell } from '@/components/layout/AppShell';

// Blueprint Drafting type system: an engineered grotesque for structure,
// a technical monospace for every label, dimension and data readout.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = { title: 'CE ESE Revision Manager', description: 'Track your Civil Engineering revision.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${archivo.variable} ${plexMono.variable}`}>
      <body className="bg-ground text-ink antialiased">
        <StoreHydrator>
          <DndProvider>
            <AppShell>{children}</AppShell>
          </DndProvider>
        </StoreHydrator>
      </body>
    </html>
  );
}
