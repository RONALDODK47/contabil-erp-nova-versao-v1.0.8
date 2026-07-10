/**
 * Luz verde + SALVANDO / SINCRONIZANDO COM DOCKER ao lado do título do módulo.
 */
import { useEffect, useState } from 'react';
import {
  getOperationalSaveError,
  getOperationalSavePhase,
  subscribeOperationalSave,
  type OperationalSavePhase,
} from '../../lib/operationalSaveStatus';
import { storageBackendShortLabel, resolveStorageBackendMode } from '../../lib/storageBackend';

const SAVED_VISIBLE_MS = 2500;

function resolveStatusLabels(
  phase: OperationalSavePhase,
  backend: string,
): { primary: string; secondary: string | null } {
  switch (phase) {
    case 'syncing':
      return { primary: 'Carregando', secondary: `Sincronizando com ${backend}` };
    case 'scheduled':
    case 'saving':
      return { primary: 'Salvando', secondary: `Sincronizando com ${backend}` };
    case 'saved':
      return { primary: 'Salvo', secondary: `Sincronizado com ${backend}` };
    case 'offline':
      return { primary: 'Aguardando', secondary: `${backend} offline` };
    case 'error':
      return { primary: 'Erro ao salvar', secondary: null };
    default:
      return { primary: '', secondary: null };
  }
}

export default function PersistenceStatusBar() {
  const [phase, setPhase] = useState<OperationalSavePhase>(() => getOperationalSavePhase());
  const [error, setError] = useState<string | null>(() => getOperationalSaveError());
  const [hideSaved, setHideSaved] = useState(true);
  const backend = storageBackendShortLabel(resolveStorageBackendMode());
  const { primary, secondary } = resolveStatusLabels(phase, backend);

  useEffect(() => {
    return subscribeOperationalSave(() => {
      const next = getOperationalSavePhase();
      setPhase(next);
      setError(getOperationalSaveError());
      if (next === 'scheduled' || next === 'saving' || next === 'syncing' || next === 'error') {
        setHideSaved(false);
      }
    });
  }, []);

  useEffect(() => {
    if (phase !== 'saved') return;
    setHideSaved(false);
    const t = window.setTimeout(() => setHideSaved(true), SAVED_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const active =
    phase === 'scheduled' ||
    phase === 'saving' ||
    phase === 'syncing' ||
    phase === 'offline';

  if (phase === 'idle') return null;
  if (phase === 'saved' && hideSaved) return null;

  const ariaLabel = secondary ? `${primary}. ${secondary}` : primary;

  return (
    <div
      className="flex items-center gap-2 shrink-0 min-w-0"
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      title={phase === 'error' ? error || 'Erro ao gravar' : ariaLabel}
    >
      <span
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          phase === 'error'
            ? 'bg-red-600'
            : active
              ? 'bg-green-500 animate-pulse'
              : 'bg-green-600'
        }`}
      />
      <div className="flex items-center gap-1.5 min-w-0 text-[10px] font-black uppercase tracking-widest">
        <span className={phase === 'error' ? 'text-red-700' : 'text-green-700'}>{primary}</span>
        {secondary ? (
          <>
            <span className="text-green-700/30 shrink-0">·</span>
            <span
              className={`truncate ${
                phase === 'error'
                  ? 'text-red-700'
                  : active
                    ? 'text-green-600'
                    : 'text-green-700/80'
              }`}
            >
              {secondary}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
