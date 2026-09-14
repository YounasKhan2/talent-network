import { Suspense } from 'react';
import { EmailVerificationScreen } from '../../components/token-action-screen';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="workspace-loading">Loading verification…</main>}>
      <EmailVerificationScreen />
    </Suspense>
  );
}
