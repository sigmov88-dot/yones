import { describe, it, expect } from "vitest";
import { createStreamReducer } from "../../src/ai/stream-reducer";

describe("createStreamReducer", () => {
  it("initializes with default empty state", () => {
    const reducer = createStreamReducer();
    expect(reducer.state().rawText).toBe("");
    expect(reducer.state().thinkingText).toBe("");
    expect(reducer.state().isThinking).toBe(false);
    expect(reducer.state().isStreaming).toBe(false);
  });

  it("handles start and resets correctly", () => {
    const reducer = createStreamReducer();
    reducer.start();
    expect(reducer.state().isStreaming).toBe(true);
    expect(reducer.state().tokensTotal).toBe(0);
    expect(reducer.state().thinkingText).toBe("");
    expect(reducer.state().rawText).toBe("");
  });

  it("handles Abort event cleanly", () => {
    const reducer = createStreamReducer();
    reducer.start();
    reducer.abort();
    expect(reducer.state().isStreaming).toBe(false);
    expect(reducer.state().isThinking).toBe(false);
  });

  it("accumulates thinking deltas and marks isThinking", () => {
    const reducer = createStreamReducer();
    reducer.start();
    reducer.processEvent({ type: "ThinkingDelta", payload: "Let's inspect the files." });
    reducer.processEvent({ type: "Done" });

    expect(reducer.state().thinkingText).toBe("Let's inspect the files.");
    expect(reducer.state().isStreaming).toBe(false);
  });

  it("extracts inline <think>...</think> tags seamlessly", () => {
    const reducer = createStreamReducer();
    reducer.start();
    reducer.processEvent({
      type: "TextDelta",
      payload: "<think>Planning the implementation</think>Here is the solution.",
    });
    reducer.processEvent({ type: "Done" });

    expect(reducer.state().thinkingText).toBe("Planning the implementation");
    expect(reducer.state().rawText).toBe("Here is the solution.");
  });

  it("captures Error events and terminates streaming cleanly", () => {
    const reducer = createStreamReducer();
    reducer.start();
    reducer.processEvent({
      type: "Error",
      payload: "API key is not configured",
    });

    expect(reducer.state().isStreaming).toBe(false);
    expect(reducer.state().isThinking).toBe(false);
    expect(reducer.state().error).toBe("API key is not configured");
  });
});
