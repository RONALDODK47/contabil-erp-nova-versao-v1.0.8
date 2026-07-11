import { useEffect, useState } from 'react';
import { probeWorkspaceStorageHealth } from '../../gestaoContabil/dbClientPostgres';
import { resolveStorageBackendMode } from '../../lib/storageBackend';

export default function WorkspaceOfflineBanner() {
  const [offline, setOffline] = useState(false);
  const isCloud = resolveStorageBackendMode() === 'supabase';

  useEffect(() => {
    if (!isCloud) return;
    let cancelled = false;
    const check = async () => {
      const ok = await probeWorkspaceStorageHealth();
      if (!cancelled) setOffline(!ok);
    };
    void check();
    const id = window.setInterval(() => void check(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isCloud]);

  if (!isCloud || !offline) return null;

  return (
    <div
      className="mx-4 md:mx-6 mt-3 mb-0 rounded border border-amber-400/80 bg-amber-50 px-3 py-2 text-[11px] text-amber-950"
      role="alert"
    >
      <p className="font-black uppercase tracking-wide">Banco na nuvem offline</p>
      <p className="mt-1 opacity-90">
        As empresas do Docker já foram enviadas ao Supabase, mas a API no Render não conectou.
        No Render → Environment, confira <code className="font-mono text-[10px]">DATABASE_URL</code> (senha
        sem colchetes, usuário <code className="font-mono text-[10px]">postgres.flyeahipaobtoixscfzq</code>)
        e faça redeploy. Se aparecer “circuit breaker”, suspenda o serviço 15 min e tente de novo.
      </p>
    </div>
  );
}
