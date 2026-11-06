/**
 * Parses storefront price strings independent of locale:
 * "29,95 €", "€29.95", "ab 1.299,00 €", "$1,299.00*" → number
 */
export function parsePrice(text: string): number {
  const m = text.replace(/\s/g, '').match(/\d[\d.,]*/);
  if (!m) return NaN;
  let n = m[0];
  const lastComma = n.lastIndexOf(',');
  const lastDot = n.lastIndexOf('.');
  if (lastComma > lastDot) {
    n = n.replace(/\./g, '').replace(',', '.'); // 1.299,00
  } else {
    n = n.replace(/,/g, ''); // 1,299.00
  }
  return parseFloat(n);
}

export function isSortedAsc(values: number[]): boolean {
  return values.every((v, i) => i === 0 || v >= values[i - 1] - 0.001);
}

export function isSortedDesc(values: number[]): boolean {
  return values.every((v, i) => i === 0 || v <= values[i - 1] + 0.001);
}
