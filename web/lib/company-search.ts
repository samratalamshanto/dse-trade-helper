const LIMIT = 8;

export function searchCompanies<T extends { code: string; name: string }>(q: string, companies: T[], limit = LIMIT): T[] {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  return companies.filter((c) =>
    c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term)
  ).slice(0, limit);
}
