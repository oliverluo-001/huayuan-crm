import { describe, expect, it } from "vitest";
import { parseQuoteTable } from "./quote-paste";

describe("quote inquiry paste", () => {
  it("parses Excel tab-separated rows and optional header without changing prices", () => {
    expect(parseQuoteTable("产品名称\t数量\t单位\t单价\t描述\r\n法兰\t10\tpcs\t12.50\tASME B16.5")).toEqual({
      lines: [{ productName: "法兰", quantity: "10", unit: "pcs", unitPrice: "12.50", description: "ASME B16.5" }], errors: [],
    });
  });
  it("rejects ambiguous prices, invalid quantities and shifted columns", () => {
    for (const row of ["法兰\t10\tpcs\t$12", "法兰\t10\tpcs\t1,200", "法兰\t0\tpcs\t12", "法兰\t-1\tpcs\t12", "法兰\t10\t12", "法兰\t10\tpcs\tNaN", "法兰\t10\tpcs\t12\textra\tshifted"]) {
      expect(parseQuoteTable(row).errors).toHaveLength(1);
    }
  });
  it("keeps valid preview rows but reports errors so partial append is not allowed", () => {
    const result = parseQuoteTable("法兰\t10\tpcs\t12\n弯头\t0\tpcs\t10");
    expect(result.lines).toHaveLength(1);
    expect(result.errors[0]).toContain("第 2 行");
    expect(parseQuoteTable("").errors).toHaveLength(1);
    expect(parseQuoteTable(Array(201).fill("法兰\t10\tpcs\t12").join("\n")).errors).toHaveLength(1);
  });
});
