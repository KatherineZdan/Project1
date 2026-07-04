import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ontario Listings Tracker',
  description:
    'Track condo and home listings across Ontario, watch specific buildings, and get notified when new units hit the market.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
