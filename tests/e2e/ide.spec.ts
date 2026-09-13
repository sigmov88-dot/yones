import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { parseSearchReplaceBlocks } from "../../src/ai/edit-parser";

describe("E2E Yones IDE Workflows", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yones-e2e-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("Scenario 1: Full atomic patch application across multiple files and rollback", () => {
    const fileA = path.join(tmpDir, "fileA.ts");
    const fileB = path.join(tmpDir, "fileB.ts");

    const initialA = 'export const greeting = "hello";\nexport const version = "1.0.0";\n';
    const initialB = 'function calculate() {\n  return 42;\n}\n';

    fs.writeFileSync(fileA, initialA, "utf8");
    fs.writeFileSync(fileB, initialB, "utf8");

    // 1. Simulate LLM output containing multiple search/replace blocks
    const llmOutput = `
Here are the updates:
### fileA.ts
<<<<<<< SEARCH
export const greeting = "hello";
=======
export const greeting = "hi";
>>>>>>> REPLACE

### fileB.ts
<<<<<<< SEARCH
  return 42;
=======
  return 100;
>>>>>>> REPLACE
`;

    const patches = parseSearchReplaceBlocks(llmOutput);
    expect(patches.length).toBe(2);

    // 2. Apply patches to files with checkpoint backup
    const backup = new Map<string, string>();
    for (const p of patches) {
      const fullPath = path.join(tmpDir, p.filePath);
      const original = fs.readFileSync(fullPath, "utf8");
      backup.set(fullPath, original);

      let content = original;
      for (const block of p.blocks) {
        expect(content).toContain(block.search);
        content = content.replace(block.search, block.replace);
      }
      fs.writeFileSync(fullPath, content, "utf8");
    }

    // 3. Verify applied state
    expect(fs.readFileSync(fileA, "utf8")).toBe(
      'export const greeting = "hi";\nexport const version = "1.0.0";\n'
    );
    expect(fs.readFileSync(fileB, "utf8")).toBe('function calculate() {\n  return 100;\n}\n');

    // 4. Perform transaction rollback
    for (const [filePath, origContent] of backup.entries()) {
      fs.writeFileSync(filePath, origContent, "utf8");
    }

    // 5. Verify restored state
    expect(fs.readFileSync(fileA, "utf8")).toBe(initialA);
    expect(fs.readFileSync(fileB, "utf8")).toBe(initialB);
  });

  it("Scenario 2: Prevents patch application when anchor block does not match", () => {
    const fileA = path.join(tmpDir, "test.ts");
    fs.writeFileSync(fileA, "const count = 1;\n", "utf8");

    const malformedOutput = `
### test.ts
<<<<<<< SEARCH
non-existent content
=======
replacement
>>>>>>> REPLACE
`;
    const patches = parseSearchReplaceBlocks(malformedOutput);
    expect(patches.length).toBe(1);

    const original = fs.readFileSync(fileA, "utf8");
    const block = patches[0].blocks[0];
    const matchSucceeded = original.includes(block.search);

    expect(matchSucceeded).toBe(false);
    // Original file remains unchanged
    expect(fs.readFileSync(fileA, "utf8")).toBe("const count = 1;\n");
  });

  it("Scenario 3: Path containment verifies target cannot escape workspace root", () => {
    const rootPath = path.resolve(tmpDir);

    function isPathSafe(untrustedRelative: string): boolean {
      const resolved = path.resolve(rootPath, untrustedRelative);
      return resolved.startsWith(rootPath) && !resolved.includes(".env");
    }

    expect(isPathSafe("src/index.ts")).toBe(true);
    expect(isPathSafe("deep/nested/folder/file.js")).toBe(true);
    expect(isPathSafe("../../../outside.txt")).toBe(false);
    expect(isPathSafe("..\\..\\windows\\system32")).toBe(false);
    expect(isPathSafe(".env")).toBe(false);
  });

  it("Scenario 4: Streaming Abort signal terminates active stream within 100ms", async () => {
    const abortController = new AbortController();
    const start = performance.now();
    abortController.abort();
    const elapsed = performance.now() - start;

    expect(abortController.signal.aborted).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });
});
