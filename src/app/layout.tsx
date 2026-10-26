import './globals.css';
import type { Metadata, Viewport } from 'next';
import house from '@/data/house.json';

export const metadata: Metadata = {
  title: `${(house as { name: string }).name} · 3D Walkthrough`,
  description: 'Walk through the house in realistic 3D',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: "Ashik's Home 3D", statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0d1117',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
