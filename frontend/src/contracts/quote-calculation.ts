export interface QuoteCalculationLine {
  quantity: number | string;
  unitPrice: number | string;
  discount?: number | string;
}

export interface QuoteCalculationCharge {
  amount: number | string;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateQuoteTotals(
  lines: QuoteCalculationLine[],
  freight: number | string,
  taxRate: number | string,
  charges: QuoteCalculationCharge[],
  exchangeRate: number | string,
) {
  const subtotal = roundMoney(lines.reduce((sum, line) => {
    const quantity = Number(line.quantity) || 0;
    const unitPrice = Number(line.unitPrice) || 0;
    const discount = Math.min(100, Math.max(0, Number(line.discount) || 0));
    return sum + quantity * unitPrice * (1 - discount / 100);
  }, 0));
  const normalizedFreight = roundMoney(Number(freight) || 0);
  const additionalFeeTotal = roundMoney(
    charges.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0),
  );
  const taxAmount = roundMoney(subtotal * (Number(taxRate) || 0) / 100);
  const total = roundMoney(
    subtotal + normalizedFreight + additionalFeeTotal + taxAmount,
  );
  const convertedTotal = roundMoney(total * (Number(exchangeRate) || 0));
  return {
    subtotal,
    freight: normalizedFreight,
    additionalFeeTotal,
    taxAmount,
    total,
    convertedTotal,
  };
}
