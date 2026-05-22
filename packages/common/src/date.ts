export function isoDateNDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)

  return d.toISOString().slice(0, 10)
}
