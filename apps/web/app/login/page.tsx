import { Suspense } from 'react';
import { AuthScreen } from '../../components/auth-screen';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="workspace-loading">Loading sign in…</main>}>
      <AuthScreen mode="login" />
    </Suspense>
  );
}
