import { Suspense } from 'react';
import { PasswordResetConfirmScreen } from '../../components/password-reset-screen';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="workspace-loading">Loading password reset…</main>}>
      <PasswordResetConfirmScreen />
    </Suspense>
  );
}
