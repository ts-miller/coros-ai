/**
 * Returns YYYYMMDD as a number for n days ago.
 */
export function getDateIntDaysAgo(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return Number(`${year}${month}${day}`);
}

/**
 * Returns YYYYMMDD as a number for n days ahead.
 */
export function getDateIntDaysAhead(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return Number(`${year}${month}${day}`);
}
