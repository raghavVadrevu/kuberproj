/** Format amounts in Indian rupees for display. */
export function formatRupees(
  amount: number,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
): string {
  const { minimumFractionDigits = 2, maximumFractionDigits = 2 } = options ?? {}
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount)
}

export const RUPEE_SYMBOL = '₹'
