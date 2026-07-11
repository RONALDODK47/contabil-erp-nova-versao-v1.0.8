/**
 * Reextrai dados dos documentos de uma pasta (texto salvo + IA quando possível).
 */
import { extractColigadasWithAi, extractSociosWithAi } from '../../lib/aiColigadasExtractClient';
import {
  extractColigadasFromTexto,
  extractSociosFromTexto,
  loadAiInteligencia,
  saveAiInteligencia,
  upsertColigadasFromExtract,
  upsertSociosFromExtract,
  type AiInteligenciaDoc,
  type AiInteligenciaPasta,
  type AiInteligenciaStore,
} from './aiInteligenciaStorage';
import { buildPastaTableRows } from './aiInteligenciaPastaTable';

export type PastaExtracaoResult = {
  store: AiInteligenciaStore;
  linhasTabela: number;
  docsProcessados: number;
  docsIgnorados: number;
  message: string;
};


export async function extrairDadosPastaInteligenciaIa(
  company: string,
  pasta: AiInteligenciaPasta,
): Promise<PastaExtracaoResult> {
  const store = loadAiInteligencia(company);
  const docs = store.docs.filter((d) => d.pasta === pasta);
  if (docs.length === 0) {
    return {
      store,
      linhasTabela: buildPastaTableRows(pasta, []).length,
      docsProcessados: 0,
      docsIgnorados: 0,
      message: 'Nenhum documento nesta pasta — configure os grupos ou envie arquivos.',
    };
  }

  let docsProcessados = 0;
  let docsIgnorados = 0;
  const allColigadas: Array<{ nome: string; aliases: string[] }> = [];
  const allSocios: Array<{ nome: string; aliases: string[] }> = [];
  const docsUpdated = [...store.docs];

  for (const doc of docs) {
    const idx = docsUpdated.findIndex((d) => d.id === doc.id);
    if (idx < 0) continue;

    let texto = String(doc.textoExtraido ?? '').trim();
    if (!texto || texto.startsWith('[arquivo]')) {
      docsIgnorados += 1;
      continue;
    }

    docsProcessados += 1;
    let extra = texto;

    if (pasta === 'coligadas') {
      allColigadas.push(...extractColigadasFromTexto(texto));
      const precisaIa =
        /^imagem\s+anexada:/i.test(texto) || texto.length < 80 || !/\[IA coligadas\]/i.test(texto);
      if (precisaIa && texto.length < 8000) {
        const ia = await extractColigadasWithAi({
          fileName: doc.nome,
          text: /^imagem\s+anexada:/i.test(texto) ? '' : texto,
          images: [],
        });
        if (ia.ok && ia.coligadas?.length) {
          allColigadas.push(...ia.coligadas);
          const nomes = ia.coligadas.map((c) => c.nome).join('; ');
          extra = `${texto}\n\n[IA coligadas] ${nomes}`.slice(0, 12_000);
        }
      }
    }

    if (pasta === 'contratos' || pasta === 'honorarios') {
      allSocios.push(...extractSociosFromTexto(texto));
      const precisaIa =
        /^imagem\s+anexada:/i.test(texto) || texto.length < 80 || !/\[IA socios\]/i.test(texto);
      if (precisaIa && texto.length < 8000) {
        const ia = await extractSociosWithAi({
          fileName: doc.nome,
          text: /^imagem\s+anexada:/i.test(texto) ? '' : texto,
          images: [],
        });
        if (ia.ok && ia.coligadas?.length) {
          allSocios.push(...ia.coligadas);
          const nomes = ia.coligadas.map((c) => c.nome).join('; ');
          extra = `${texto}\n\n[IA socios] ${nomes}`.slice(0, 12_000);
        }
      }
    }

    if (extra !== doc.textoExtraido) {
      docsUpdated[idx] = { ...docsUpdated[idx]!, textoExtraido: extra };
    }
  }

  let next = saveAiInteligencia(company, { ...store, docs: docsUpdated });
  if (allColigadas.length > 0 && pasta === 'coligadas') {
    next = upsertColigadasFromExtract(company, allColigadas);
  }
  if (allSocios.length > 0 && (pasta === 'contratos' || pasta === 'honorarios')) {
    next = upsertSociosFromExtract(company, allSocios);
  }

  const pastaDocs = next.docs.filter((d) => d.pasta === pasta);
  const linhasTabela = buildPastaTableRows(pasta, pastaDocs).length;

  const partes: string[] = [];
  if (docsProcessados > 0) partes.push(`${docsProcessados} doc(s) processado(s)`);
  if (linhasTabela > 0) partes.push(`${linhasTabela} linha(s) na tabela`);
  if (docsIgnorados > 0) {
    partes.push(`${docsIgnorados} sem texto — reenvie o arquivo para a IA ler`);
  }
  if (linhasTabela === 0 && docsProcessados > 0) {
    partes.push('nenhum dado estruturado encontrado no texto');
  }

  return {
    store: next,
    linhasTabela,
    docsProcessados,
    docsIgnorados,
    message: partes.length ? partes.join(' · ') : 'Nada a extrair.',
  };
}
