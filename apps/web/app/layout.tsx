import type { Metadata } from 'next';
import CareerSectionControls from './career/career-section-controls';
import './globals.css';
import './account-workflows.css';
import './team-workflows.css';
import './career-passport.css';
import './career-section-controls.css';

export const metadata: Metadata = {
  title: 'Talent Network',
  description: 'Intelligent hiring network connecting companies with verified, relevant talent.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <CareerSectionControls />
      </body>
    </html>
  );
}
