import { createSignal, onCleanup } from "solid-js";
import type { LlmEvent } from "./provider";

export interface StreamState {
  rawText: string;
  isStreaming: boolean;
  activeTool: { id: string; name: string; args: string } | null;
  tokensTotal: number;
  tokensPerSec: number;
  costUsd: number;
  error: string | null;
}

export function createStreamReducer() {
  const [state, setState] = createSignal<StreamState>({
    rawText: "",
    isStreaming: false,
    activeTool: null,
    tokensTotal: 0,
    tokensPerSec: 0,
    costUsd: 0,
    error: null,
  });

  let textBuffer = "";
  let rafId: number | null = null;
  let tokensInBatch = 0;
  let startTime = 0;
  let totalGeneratedTokens = 0;

  const flushBuffer = () => {
    rafId = null;
    if (textBuffer.length === 0 && tokensInBatch === 0) return;

    const deltaText = textBuffer;
    textBuffer = "";

    const now = performance.now();
    const elapsedSec = Math.max((now - startTime) / 1000, 0.001);
    const currentSpeed = Math.round(totalGeneratedTokens / elapsedSec);

    setState((prev) => ({
      ...prev,
      rawText: prev.rawText + deltaText,
      tokensTotal: totalGeneratedTokens,
      tokensPerSec: currentSpeed,
    }));

    tokensInBatch = 0;
  };

  const scheduleFlush = () => {
    if (rafId === null) {
      rafId = requestAnimationFrame(flushBuffer);
    }
  };

  const processEvent = (event: LlmEvent) => {
    switch (event.type) {
      case "TextDelta": {
        textBuffer += event.payload;
        tokensInBatch += 1;
        totalGeneratedTokens += 1;
        scheduleFlush();
        break;
      }
      case "ToolCall": {
        flushBuffer();
        setState((prev) => ({
          ...prev,
          activeTool: {
            id: event.payload.id,
            name: event.payload.name,
            args: event.payload.arguments,
          },
        }));
        break;
      }
      case "ToolResult": {
        flushBuffer();
        setState((prev) => ({
          ...prev,
          activeTool: null,
        }));
        break;
      }
      case "Usage": {
        setState((prev) => ({
          ...prev,
          costUsd: prev.costUsd + event.payload.cost_usd,
        }));
        break;
      }
      case "Done": {
        flushBuffer();
        setState((prev) => ({
          ...prev,
          isStreaming: false,
        }));
        break;
      }
      case "Error": {
        flushBuffer();
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: event.payload,
        }));
        break;
      }
    }
  };

  const start = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    textBuffer = "";
    tokensInBatch = 0;
    totalGeneratedTokens = 0;
    startTime = performance.now();
    setState({
      rawText: "",
      isStreaming: true,
      activeTool: null,
      tokensTotal: 0,
      tokensPerSec: 0,
      costUsd: 0,
      error: null,
    });
  };

  const abort = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    textBuffer = "";
    setState((prev) => ({ ...prev, isStreaming: false }));
  };

  onCleanup(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  });

  return {
    state,
    start,
    processEvent,
    abort,
  };
}
