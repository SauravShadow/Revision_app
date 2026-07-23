import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import 'katex/dist/katex.min.css';
import './globals.css';
import { StoreHydrator } from '@/components/StoreHydrator';
import { DndProvider } from '@/components/dnd/DndProvider';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/AuthProvider';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

// Blocking pre-paint theme resolution — must mirror resolveTheme() in
// lib/theme/theme.ts (an inline <head> script can't import). Sets data-theme
// before first paint so there is no flash of the wrong theme. Legacy ce-theme
// values 'dark'/'light' migrate to 'blueprint'/'engpad'; default is 'engpad'.
const themeScript = `(function(){try{var s=localStorage.getItem('ce-theme');var valid=['blueprint','engpad','slate'];var legacy={dark:'blueprint',light:'engpad'};var t=!s?'engpad':(valid.indexOf(s)>=0?s:(legacy[s]||'engpad'));document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','engpad');}})();`;

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

// metadataBase makes the file-based opengraph-image / icon URLs absolute.
// Override via NEXT_PUBLIC_SITE_URL in production; falls back to the local port.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3200'),
  title: 'RevisionWorks',
  description: 'Track your exam revision — Civil Engineering, Software Engineering & more.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-ground text-ink antialiased">
        <ThemeProvider>
          <AuthProvider>
            <StoreHydrator>
              <DndProvider>
                <AppShell>{children}</AppShell>
              </DndProvider>
            </StoreHydrator>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

