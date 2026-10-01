export interface PastedQuoteLine { productName: string; quantity: string; unit: string; unitPrice: string; description: string }
export function parseQuoteTable(text: string): { lines: PastedQuoteLine[]; errors: string[] } {
  const rows = text.trim().split(/\r?\n/).filter((row) => row.trim());
  const errors: string[] = [];
  if (rows.length > 200) return { lines: [], errors: ["一次最多粘贴 200 行"] };
  const lines = rows.flatMap((row, index) => {
    const cells = row.split("\t").map((cell) => cell.trim());
    if (index === 0 && /^(产品名称|品名|product|product name)$/i.test(cells[0])) return [];
    const [productName, quantity, unit, unitPrice, description = ""] = cells;
    if (cells.length < 4 || cells.length > 5 || !productName || !unit || !/^(\d+)(\.\d+)?$/.test(quantity) || Number(quantity) <= 0 || !Number.isFinite(Number(quantity))
      || !/^(\d+)(\.\d+)?$/.test(unitPrice) || !Number.isFinite(Number(unitPrice))) {
      errors.push(`第 ${index + 1} 行无效：请按产品名称、数量、单位、单价、描述排列；金额不带币种和千位分隔符`);
      return [];
    }
    return [{ productName, quantity, unit, unitPrice, description }];
  });
  if (!rows[0] || (!lines.length && !errors.length)) errors.push("请粘贴至少一行产品");
  return { lines, errors };
}
