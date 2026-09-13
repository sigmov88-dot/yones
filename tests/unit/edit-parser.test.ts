import { describe, it, expect } from "vitest";
import { parseSearchReplaceBlocks, generateUnifiedDiff } from "../../src/ai/edit-parser";

describe("parseSearchReplaceBlocks", () => {
  it("parses valid SEARCH/REPLACE blocks", () => {
    const output = `
Here is the proposed update:
### src/main.rs
<<<<<<< SEARCH
fn main() {
    println!("hello");
}
=======
fn main() {
    println!("hello world");
}
>>>>>>> REPLACE
`;

    const patches = parseSearchReplaceBlocks(output);
    expect(patches).toHaveLength(1);
    expect(patches[0].filePath).toBe("src/main.rs");
    expect(patches[0].blocks).toHaveLength(1);
    expect(patches[0].blocks[0].search).toContain('println!("hello");');
    expect(patches[0].blocks[0].replace).toContain('println!("hello world");');
  });

  it("handles incomplete/truncated stream without throwing", () => {
    const broken = `
### src/broken.ts
<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
// Stream cuts off here without closing marker
`;
    const patches = parseSearchReplaceBlocks(broken);
    expect(patches).toHaveLength(0);
  });
});

describe("generateUnifiedDiff", () => {
  it("generates correct added/removed/unchanged lines", () => {
    const original = "alpha\nbeta\ngamma";
    const updated = "alpha\nbeta modified\ngamma";

    const diff = generateUnifiedDiff(original, updated);
    expect(diff.some((l) => l.type === "removed" && l.content === "beta")).toBe(true);
    expect(diff.some((l) => l.type === "added" && l.content === "beta modified")).toBe(true);
    expect(diff.filter((l) => l.type === "unchanged")).toHaveLength(2);
  });
});
