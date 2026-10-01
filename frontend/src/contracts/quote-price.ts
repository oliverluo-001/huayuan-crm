/** A quote has one currency: never relabel existing lines when selecting a product. */
export function quoteReferencePrice(
  currency: string,
  prices: Array<{ currency: string; referencePrice?: number }> = [],
  fallback?: { currency?: string; price?: number },
): string {
  const match = prices.find((price) => price.currency.toUpperCase() === currency.toUpperCase());
  if (match && Number.isFinite(match.referencePrice)) return String(match.referencePrice);
  if (fallback?.currency?.toUpperCase() === currency.toUpperCase() && Number.isFinite(fallback.price)) {
    return String(fallback.price);
  }
  return "";
}
