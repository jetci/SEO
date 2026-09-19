export function maskKey(plaintext: string, first4 = 4, last4 = 4): string {
  const s = String(plaintext || '').trim();
  if (!s) return '';
  if (s.length <= first4 + last4 + 2) return s.slice(0, first4) + '*'.repeat(Math.max(2, s.length - first4));
  return s.slice(0, first4) + '*'.repeat(8) + s.slice(-last4);
}
