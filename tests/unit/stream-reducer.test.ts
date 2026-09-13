import { describe, it, expect } from "vitest";
import { createStreamReducer } from "../../src/ai/stream-reducer";

describe("createStreamReducer", () => {
  it("initializes with default empty state", () => {
    const reducer = createStreamReducer();
    expect(reducer.state().rawText).toBe("");
    expect(reducer.state().isStreaming).toBe(false);
  });

  it("handles start and resets correctly", () => {
    const reducer = createStreamReducer();
    reducer.start();
    expect(reducer.state().isStreaming).toBe(true);
    expect(reducer.state().tokensTotal).toBe(0);
  });

  it("handles Abort event cleanly", () => {
    const reducer = createStreamReducer();
    reducer.start();
    reducer.abort();
    expect(reducer.state().isStreaming).toBe(false);
  });
});
