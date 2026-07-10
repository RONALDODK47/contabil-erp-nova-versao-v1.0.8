import { addMonths, format, isValid, parseISO } from 'date-fns';

/** Meses de carência (competências mensais após o mês do contrato). */
export function resolveGraceMonths(gracePeriodStr: string, legacyGraceDaysStr = '0'): number {
  const fromMonths = Math.max(0, Math.floor(Number(String(gracePeriodStr ?? '').replace(/\D/g, '')) || 0));
  if (fromMonths > 0) return fromMonths;
  const legacyDays = Math.max(0, Math.floor(Number(String(legacyGraceDaysStr ?? '').replace(/\D/g, '')) || 0));
  if (legacyDays > 0) return Math.max(1, Math.round(legacyDays / 30));
  return 0;
}

/**
 * Data da 1ª parcela de amortização (após carência em meses).
 * Carência N = N competências mensais após o mês do contrato.
 * Sem carência: 1º vencimento no mês civil seguinte ao contrato.
 */
export function computeFirstInstallmentDate(contractDateStr: string, gracePeriodMonths: number): string {
  const base = parseISO(String(contractDateStr ?? '').trim().slice(0, 10));
  if (!isValid(base)) return String(contractDateStr ?? '').trim().slice(0, 10);
  const grace = Math.max(0, Math.floor(gracePeriodMonths));
  if (grace === 0) return format(addMonths(base, 1), 'yyyy-MM-dd');
  return format(addMonths(base, grace + 1), 'yyyy-MM-dd');
}

/** Datas de vencimento dos meses de carência (1º = mês seguinte ao contrato). */
export function computeGraceMonthDates(contractDateStr: string, gracePeriodMonths: number): string[] {
  const grace = Math.max(0, Math.floor(gracePeriodMonths));
  if (grace === 0) return [];
  const contract = parseISO(String(contractDateStr ?? '').trim().slice(0, 10));
  if (!isValid(contract)) return [];
  const out: string[] = [];
  for (let m = 1; m <= grace; m++) {
    out.push(format(addMonths(contract, m), 'yyyy-MM-dd'));
  }
  return out;
}

export function formatBrDateFromIso(iso: string): string {
  const d = parseISO(iso.slice(0, 10));
  if (!isValid(d)) return iso;
  return format(d, 'dd/MM/yyyy');
}
