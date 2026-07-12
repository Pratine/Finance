const _formatter = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })

export function fmt(n: number): string {
  return _formatter.format(n)
}
