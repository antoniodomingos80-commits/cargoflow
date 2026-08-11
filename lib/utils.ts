import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata valores monetários. Angola usa o Kwanza (AOA) por omissão, mas a
 * plataforma está preparada para múltiplas moedas desde o início.
 */
export function formatCurrency(amount: number, currency = 'AOA'): string {
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatWeight(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toLocaleString('pt-AO', { maximumFractionDigits: 1 })} t`;
  }
  return `${kg.toLocaleString('pt-AO')} kg`;
}

export function formatDistance(km: number): string {
  return `${km.toLocaleString('pt-AO', { maximumFractionDigits: 0 })} km`;
}

/**
 * Tempo relativo em português ("há 5 minutos", "amanhã").
 * Usado nas listagens e na linha temporal de eventos.
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat('pt', { numeric: 'auto' });

  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 24) return rtf.format(diffH, 'hour');
  return rtf.format(Math.round(diffH / 24), 'day');
}

/** Gera referência legível para cargas e viagens: CF-2026-000123 */
export function buildReference(prefix: 'CF' | 'VG', sequence: number): string {
  return `${prefix}-${new Date().getFullYear()}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Parse a user-provided currency/amount string into a number.
 * Handles formats like "1.234.567,89" or "1,234,567.89" and plain numbers.
 */
export function parseAmount(value: FormDataEntryValue | null | undefined): number | null {
  if (value == null) return null;
  const s = typeof value === 'string' ? value : String(value);
  const cleaned = s.trim().replace(/[\s\u00A0]/g, '');
  if (cleaned === '') return null;

  // Keep only digits, dot and comma and minus
  let only = cleaned.replace(/[^0-9.,-]/g, '');
  const lastDot = only.lastIndexOf('.');
  const lastComma = only.lastIndexOf(',');

  if (lastComma > lastDot) {
    // comma as decimal separator, dots as thousands
    only = only.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // dot as decimal separator, commas as thousands
    only = only.replace(/,/g, '');
  }

  const n = Number(only);
  return Number.isFinite(n) ? n : null;
}
