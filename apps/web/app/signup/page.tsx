import { Suspense } from 'react';
import { AuthScreen } from '../../components/auth-screen';

export default function SignupPage() {
  return (
    <Suspense fallback={<main className="workspace-loading">Loading sign up…</main>}>
      <AuthScreen mode="signup" />
    </Suspense>
  );
}
