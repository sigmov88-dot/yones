import { describe, it, expect } from "vitest";
import { analyzeBracketsAndSyntax } from "../../src/editor/diagnostics";

describe("LSP Diagnostics & Syntax Analysis", () => {
  it("detects unmatched closing brackets", () => {
    const code = "function test() { return 1; }}";
    const result = analyzeBracketsAndSyntax(code);

    expect(result.errors).toBe(1);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain("Unmatched closing bracket '}'");
  });

  it("detects unclosed brackets", () => {
    const code = "function test() { if (true) {";
    const result = analyzeBracketsAndSyntax(code);

    expect(result.errors).toBe(2);
    expect(result.diagnostics.some((d) => d.message.includes("Unclosed bracket"))).toBe(true);
  });

  it("reports 0 errors for balanced brackets", () => {
    const code = "function test() { return [1, 2, 3]; }";
    const result = analyzeBracketsAndSyntax(code);

    expect(result.errors).toBe(0);
    expect(result.diagnostics).toHaveLength(0);
  });
});
