/**
 * @fileoverview Funções de formatação para UI
 */

import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Formata valor em centavos para exibição em Reais
 * @param cents - Valor em centavos
 * @returns String formatada (ex: "R$ 150,00")
 */
export function formatPrice(cents: number): string {
  const reais = cents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(reais);
}

/**
 * Formata telefone para exibição
 * @param phone - Telefone (pode ter ou não formatação)
 * @returns Telefone formatado (XX) XXXXX-XXXX
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  
  // Remove código do país se presente
  const withoutCountry = cleaned.startsWith('55') && cleaned.length > 11
    ? cleaned.slice(2)
    : cleaned;
  
  if (withoutCountry.length === 11) {
    return `(${withoutCountry.slice(0, 2)}) ${withoutCountry.slice(2, 7)}-${withoutCountry.slice(7)}`;
  }
  
  if (withoutCountry.length === 10) {
    return `(${withoutCountry.slice(0, 2)}) ${withoutCountry.slice(2, 6)}-${withoutCountry.slice(6)}`;
  }
  
  return phone;
}

/**
 * Format date to Brazilian locale
 * @param date - Date to format
 * @param options - Intl.DateTimeFormat options
 */
export function formatDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('pt-BR', options).format(d);
}

/**
 * Format relative time (e.g., "há 2 horas")
 * Uses date-fns for proper i18n support
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Validação de Invalid Date
  if (isNaN(d.getTime())) {
    return 'Data inválida';
  }
  
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

/**
 * Trunca texto com ellipsis
 * @param text - Texto original
 * @param maxLength - Tamanho máximo
 * @returns Texto truncado
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Slugify string for URLs
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Formata número com separador de milhares
 * @param num - Número
 * @returns String formatada
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('pt-BR').format(num);
}

/**
 * Formata porcentagem
 * @param value - Valor decimal (0.15 = 15%)
 * @param decimals - Casas decimais
 * @returns String formatada (ex: "15%")
 */
export function formatPercent(value: number, decimals = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

