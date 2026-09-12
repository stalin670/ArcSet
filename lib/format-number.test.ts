import { describe, expect, it } from "vitest";
import { formatNumber } from "./format-number";

describe("formatNumber", () => {
  it("normalizes invalid and signed-zero values", () => {
    expect(formatNumber(null, { type: "stable_value" }).display).toBe("--");
    expect(formatNumber(Number.POSITIVE_INFINITY, { type: "stable_value" }).display).toBe("--");
    expect(formatNumber(-0, { type: "stable_value" }).display).toBe("$0.00");
  });

  it("formats stable values without scientific notation", () => {
    expect(formatNumber(0.004, { type: "stable_value" }).display).toBe("<$0.01");
    expect(formatNumber(1234.5, { type: "stable_value", context: "compact" }).display).toBe("$1.2K");
    expect(formatNumber(1.52e12, { type: "stable_value", context: "compact" }).display).toBe("$1.5T");
  });

  it("uses accessible zero-subscript notation for tiny prices", () => {
    const result = formatNumber(0.00005835, { type: "token_price", context: "compact" });
    expect(result.display).toBe("$0.0₄58");
    expect(result.ariaLabel).toBe("$0.000058");
    expect(result.raw).toBe("0.00005835");
    expect(result.isSubscript).toBe(true);
  });

  it("does not treat decimals above one as tiny values", () => {
    const result = formatNumber(1.0006174, { type: "token_price", context: "detailed" });
    expect(result.display).toBe("$1.001");
    expect(result.isSubscript).toBe(false);
  });

  it("formats percentage and ratio metrics", () => {
    expect(formatNumber(12.345, { type: "percent", sign: "always" }).display).toBe("+12.35%");
    expect(formatNumber(2.567, { type: "ratio" }).display).toBe("2.57x");
  });
});
