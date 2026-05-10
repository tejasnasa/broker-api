export const parseDate = (dateStr: string): string | null => {
  // ISO 8601 with timezone e.g. 2026-04-01T14:30:00Z
  if (dateStr.includes("T")) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // DD-MM-YYYY (Zerodha)
  const dmy = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
  }

  // MM/DD/YYYY (ibkr)
  const mdy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mdy) {
    const [, month, day, year] = mdy;
    return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
  }

  return null;
};
