/**
 * Cliente — extração de nomes de coligadas via IA (visão + texto).
 */
import { fetchAiConfig } from '../contabilfacil/ai/aiSettingsClient';
import type { AiExtractImage } from './aiExtratoExtractClient';

const AGENT_BASE =
  typeof import.meta.env.VITE_AGENT_API_URL === 'string' && import.meta.env.VITE_AGENT_API_URL
    ? import.meta.env.VITE_AGENT_API_URL.replace(/\/$/, '')
    : '/api/agent';

const REQUEST_TIMEOUT_MS = 120_000;

export type AiColigadaExtractRow = {
  nome: string;
  aliases: string[];
};

export type AiExtractColigadasResult = {
  ok: boolean;
  coligadas?: AiColigadaExtractRow[];
  model?: string;
  provider?: string;
  detail?: string;
  reason?: string;
};

export async function extractColigadasWithAi(params: {
  fileName?: string;
  text?: string;
  images?: AiExtractImage[];
  signal?: AbortSignal;
}): Promise<AiExtractColigadasResult> {
  try {
    const aiCfg = await fetchAiConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const signal = params.signal ?? controller.signal;
    try {
      const res = await fetch(`${AGENT_BASE}/ai/extract-coligadas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: params.fileName,
          ocrText: params.text,
          images: params.images,
          model: aiCfg?.config?.model,
          providerId: aiCfg?.config?.providerId,
        }),
        signal,
      });
      const data = (await res.json()) as AiExtractColigadasResult & { error?: string };
      if (!res.ok && !data.detail) {
        return {
          ok: false,
          detail: data.error || `HTTP ${res.status}`,
          reason: data.reason,
        };
      }
      return {
        ok: Boolean(data.ok),
        coligadas: Array.isArray(data.coligadas) ? data.coligadas : [],
        model: data.model,
        provider: data.provider,
        detail: data.detail,
        reason: data.reason,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      detail: msg.includes('abort') ? 'Tempo esgotado na IA' : msg,
      reason: 'client_error',
    };
  }
}

export async function extractSociosWithAi(params: {
  fileName?: string;
  text?: string;
  images?: AiExtractImage[];
  signal?: AbortSignal;
}): Promise<AiExtractColigadasResult> {
  try {
    const aiCfg = await fetchAiConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const signal = params.signal ?? controller.signal;
    try {
      const res = await fetch(`${AGENT_BASE}/ai/extract-socios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: params.fileName,
          ocrText: params.text,
          images: params.images,
          model: aiCfg?.config?.model,
          providerId: aiCfg?.config?.providerId,
        }),
        signal,
      });
      const data = (await res.json()) as AiExtractColigadasResult & { error?: string };
      if (!res.ok && !data.detail) {
        return {
          ok: false,
          detail: data.error || `HTTP ${res.status}`,
          reason: data.reason,
        };
      }
      return {
        ok: Boolean(data.ok),
        coligadas: Array.isArray(data.coligadas) ? data.coligadas : [],
        model: data.model,
        provider: data.provider,
        detail: data.detail,
        reason: data.reason,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      detail: msg.includes('abort') ? 'Tempo esgotado na IA' : msg,
      reason: 'client_error',
    };
  }
}
