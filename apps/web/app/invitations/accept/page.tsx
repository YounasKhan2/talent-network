import { Suspense } from 'react';
import { InvitationAcceptanceScreen } from '../../../components/token-action-screen';

export default function InvitationAcceptancePage() {
  return (
    <Suspense fallback={<main className="workspace-loading">Loading invitation…</main>}>
      <InvitationAcceptanceScreen />
    </Suspense>
  );
}
