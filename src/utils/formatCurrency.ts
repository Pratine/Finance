export function fmt(n: number): string {
  return n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
}
