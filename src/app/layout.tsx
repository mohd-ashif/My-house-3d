import './globals.css';
import type { Metadata } from 'next';
import house from '@/data/house.json';

export const metadata: Metadata = {
  title: `${(house as { name: string }).name} · 3D Walkthrough`,
  description: 'Walk through the house in realistic 3D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
