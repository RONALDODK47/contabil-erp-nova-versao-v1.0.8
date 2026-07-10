/** Base URL da Agent API (Render em produção, proxy Vite em dev). */
export function getAgentApiBase(): string {
  const raw = import.meta.env.VITE_AGENT_API_URL;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().replace(/\/$/, '');
  }
  return '/api/agent';
}

/** Origem do serviço backend (ex.: https://eye-vision-agent-api.onrender.com). */
export function getAgentApiOrigin(): string | null {
  const base = getAgentApiBase();
  if (base.startsWith('http://') || base.startsWith('https://')) {
    try {
      return new URL(base).origin;
    } catch {
      return null;
    }
  }
  return null;
}
