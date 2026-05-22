export function milliunitsToDollars(milliunits: number): number {
  return milliunits / 1000
}

export function formatDollars(milliunits: number): string {
  const dollars = milliunitsToDollars(milliunits)
  const sign = dollars < 0 ? '-' : ''

  return `${sign}$${Math.abs(dollars).toFixed(2)}`
}
