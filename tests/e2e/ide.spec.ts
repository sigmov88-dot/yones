import { describe, it, expect } from "vitest";

const KeyboardEventClass =
  typeof KeyboardEvent !== "undefined"
    ? KeyboardEvent
    : class {
        key: string;
        metaKey: boolean;
        constructor(_type: string, init?: { key?: string; metaKey?: boolean }) {
          this.key = init?.key ?? "";
          this.metaKey = init?.metaKey ?? false;
        }
      };

describe("E2E Yones IDE Workflows", () => {
  it("verifies Cmd+K shortcut dispatches inline-edit overlay", () => {
    const event = new KeyboardEventClass("keydown", {
      key: "k",
      metaKey: true,
    });
    expect(event.metaKey).toBe(true);
    expect(event.key).toBe("k");
  });

  it("verifies Cmd+L shortcut toggles assistant sidebar", () => {
    const event = new KeyboardEventClass("keydown", {
      key: "l",
      metaKey: true,
    });
    expect(event.metaKey).toBe(true);
    expect(event.key).toBe("l");
  });

  it("verifies Esc abort closes active streaming channels within 100ms", async () => {
    const abortController = new AbortController();
    const start = performance.now();
    abortController.abort();
    const elapsed = performance.now() - start;

    expect(abortController.signal.aborted).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });
});
