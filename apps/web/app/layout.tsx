import type { Metadata } from 'next';
import './globals.css';
import './account-workflows.css';

export const metadata: Metadata = {
  title: 'Talent Network',
  description: 'Intelligent hiring network connecting companies with verified, relevant talent.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
