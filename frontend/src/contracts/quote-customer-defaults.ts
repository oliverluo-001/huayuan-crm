export function quoteCustomerDefaults<T extends { currency: string; incoterm: string; exchangeRate: string }>(form: T, customer: { preferredCurrency?: string; preferredIncoterm?: string }, edited: { currency: boolean; incoterm: boolean }, hasPrices: boolean): T {
  const currency = customer.preferredCurrency?.trim().toUpperCase();
  const incoterm = customer.preferredIncoterm?.trim().toUpperCase();
  const changeCurrency = !edited.currency && !hasPrices && Boolean(currency && currency !== form.currency && /^[A-Z]{3}$/.test(currency));
  return { ...form, ...(changeCurrency ? { currency: currency!, exchangeRate: "" } : {}), ...(!edited.incoterm && incoterm ? { incoterm } : {}) };
}
