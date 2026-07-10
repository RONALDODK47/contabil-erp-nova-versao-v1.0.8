import { type ReactNode, useEffect, useRef } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
// @ts-expect-error módulo JSX da gestão contábil
import { AuthProvider, useAuth } from './gestaoAuth';
import { useCloudAccess } from './useCloudAccessBridge';
import { queryClientInstance } from './gestaoQueryClient';
import EyeVisionStaffLogin from './EyeVisionStaffLogin';
import EyeVisionTokenGate from './EyeVisionTokenGate';
import EyeVisionCloudBootstrap from '../contabilfacil/components/EyeVisionCloudBootstrap';
import { restoreGestaoCloudAccessFromFirebase } from '../contabilfacil/logic/restoreGestaoCloudAccessFromFirebase';
import TabLoadingFallback from '../contabilfacil/components/TabLoadingFallback';
import { notifyDebugAppHealthy } from '../contabilfacil/agent/browserConsoleBridge';

function FirebaseGestaoRestore({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const restoredRef = useRef(false);

  useEffect(() => {
    const uid = String(user?.uid || '').trim();
    const email = String(user?.email || '').trim().toLowerCase();
    if (!uid || restoredRef.current) return;
    restoredRef.current = true;
    void restoreGestaoCloudAccessFromFirebase(uid, { email });
  }, [user?.uid, user?.email]);

  return <>{children}</>;
}

function GestaoAuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="h-screen bg-brand-bg">
        <TabLoadingFallback />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <EyeVisionStaffLogin />;
  }

  return <GestaoAuthenticatedShell>{children}</GestaoAuthenticatedShell>;
}

function GestaoAuthenticatedShell({ children }: { children: ReactNode }) {
  return (
    <FirebaseGestaoRestore>
      <GestaoCloudAccessGate>{children}</GestaoCloudAccessGate>
    </FirebaseGestaoRestore>
  );
}

/** Só monta após login — `useCloudAccess` exige QueryClient + utilizador Firebase. */
function GestaoCloudAccessGate({ children }: { children: ReactNode }) {
  const { isLoading: isLoadingCloudAccess, companyTokenOk } = useCloudAccess();

  const appHealthy = !isLoadingCloudAccess && companyTokenOk;

  useEffect(() => {
    if (!appHealthy) return;
    notifyDebugAppHealthy();
  }, [appHealthy]);

  if (isLoadingCloudAccess) {
    return (
      <div className="h-screen bg-brand-bg">
        <TabLoadingFallback />
      </div>
    );
  }

  if (!companyTokenOk) {
    return <EyeVisionTokenGate />;
  }

  return (
    <>
      <EyeVisionCloudBootstrap />
      {children}
    </>
  );
}

export default function GestaoAuthShell({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <GestaoAuthGate>{children}</GestaoAuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
