import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Bücherturm',
    template: '%s | Bücherturm',
  },
  description: 'Dein privates, KI-gestütztes Buch-Tracking.',
  applicationName: 'Bücherturm',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f4ef' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1410' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
