import { describe, expect, it } from "vitest";
import { applyBulkSpecs, previewBulkSpecs, type SpecLine } from "./quote-bulk-specs";
const line = (key: string, material = "") => ({ key, standard: "", material, pressureRating: "", facing: "", surfaceTreatment: "", packaging: "", inspectionRequirements: "", certificateRequirements: "", unitPrice: "12.5", quantity: "20", nominalSize: "DN50", sku: "SKU-1" });
describe("bulk quote specifications", () => {
  it("only fills blank fields of selected lines, preserving commercial values", () => {
    const lines = [line("a", "316L"), line("b"), line("c")];
    const result = applyBulkSpecs(lines, ["a", "b"], { material: " 304 ", standard: "ASME" }, false);
    expect(result.map((item) => item.material)).toEqual(["316L", "304", ""]);
    expect(result[0].standard).toBe("ASME");
    expect(result[2]).toBe(lines[2]);
    expect(lines[1].material).toBe("");
    for (const item of result) expect([item.unitPrice, item.quantity, item.nominalSize, item.sku]).toEqual(["12.5", "20", "DN50", "SKU-1"]);
  });
  it("previews overwrite, ignores empty values and removed line keys", () => {
    const lines = [line("a", "316L")];
    expect(previewBulkSpecs(lines, ["removed"], { material: "304" }, true)).toEqual([]);
    expect(previewBulkSpecs(lines, ["a"], { material: " " }, true)).toEqual([]);
    expect(previewBulkSpecs(lines, ["a"], { material: "304" }, true)).toEqual([{ lineKey: "a", row: 1, field: "material", label: "材质", before: "316L", after: "304" }]);
    expect(applyBulkSpecs(lines, ["a"], { material: "304" }, true)[0].material).toBe("304");
  });
  it("rejects non-whitelisted identity or price fields even in malformed input", () => {
    const input = { material: "304", unitPrice: "0", sku: "WRONG" };
    const result = applyBulkSpecs([line("a")], ["a"], input, true)[0];
    expect(result.unitPrice).toBe("12.5"); expect(result.sku).toBe("SKU-1");
    expect(previewBulkSpecs([line("a") as SpecLine], ["a"], { material: "" }, false)).toEqual([]);
  });
});
