import { createSignal, onCleanup } from "solid-js";
import type { LlmEvent } from "./provider";

export interface StreamState {
  rawText: string;
  thinkingText: string;
  isThinking: boolean;
  thinkingDurationMs: number;
  isStreaming: boolean;
  activeTool: { id: string; name: string; args: string } | null;
  tokensTotal: number;
  tokensPerSec: number;
  costUsd: number;
  error: string | null;
}

const requestRaf = (fn: () => void): number => {
  if (typeof requestAnimationFrame !== "undefined") {
    return requestAnimationFrame(fn);
  }
  return setTimeout(fn, 0) as unknown as number;
};

const cancelRaf = (id: number): void => {
  if (typeof cancelAnimationFrame !== "undefined") {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
};

export function createStreamReducer() {
  const [state, setState] = createSignal<StreamState>({
    rawText: "",
    thinkingText: "",
    isThinking: false,
    thinkingDurationMs: 0,
    isStreaming: false,
    activeTool: null,
    tokensTotal: 0,
    tokensPerSec: 0,
    costUsd: 0,
    error: null,
  });

  let textBuffer = "";
  let thinkingBuffer = "";
  let rafId: number | null = null;
  let tokensInBatch = 0;
  let startTime = 0;
  let thinkStartTime = 0;
  let thinkDuration = 0;
  let isCurrentlyThinking = false;
  let insideThinkTag = false;
  let totalGeneratedTokens = 0;

  const flushBuffer = () => {
    rafId = null;
    if (textBuffer.length === 0 && thinkingBuffer.length === 0 && tokensInBatch === 0) return;

    const deltaText = textBuffer;
    const deltaThinking = thinkingBuffer;
    textBuffer = "";
    thinkingBuffer = "";

    const now = performance.now();
    const elapsedSec = Math.max((now - startTime) / 1000, 0.001);
    const currentSpeed = Math.round(totalGeneratedTokens / elapsedSec);

    if (isCurrentlyThinking && thinkStartTime > 0) {
      thinkDuration = Math.round(now - thinkStartTime);
    }

    setState((prev) => ({
      ...prev,
      rawText: prev.rawText + deltaText,
      thinkingText: prev.thinkingText + deltaThinking,
      isThinking: isCurrentlyThinking,
      thinkingDurationMs: thinkDuration,
      tokensTotal: totalGeneratedTokens,
      tokensPerSec: currentSpeed,
    }));

    tokensInBatch = 0;
  };

  const scheduleFlush = () => {
    if (rafId === null) {
      rafId = requestRaf(flushBuffer);
    }
  };

  const processEvent = (event: LlmEvent) => {
    switch (event.type) {
      case "ThinkingDelta": {
        if (!isCurrentlyThinking) {
          isCurrentlyThinking = true;
          thinkStartTime = performance.now();
        }
        thinkingBuffer += event.payload;
        tokensInBatch += 1;
        totalGeneratedTokens += 1;
        scheduleFlush();
        break;
      }
      case "TextDelta": {
        let content = event.payload;

        // Check for inline <think> tags (common in DeepSeek R1 / Ollama)
        if (content.includes("<think>")) {
          const parts = content.split("<think>");
          textBuffer += parts[0];
          insideThinkTag = true;
          isCurrentlyThinking = true;
          thinkStartTime = performance.now();
          content = parts[1] ?? "";
        }

        if (insideThinkTag) {
          if (content.includes("</think>")) {
            const parts = content.split("</think>");
            thinkingBuffer += parts[0];
            insideThinkTag = false;
            isCurrentlyThinking = false;
            thinkDuration = Math.round(performance.now() - thinkStartTime);
            textBuffer += parts[1] ?? "";
          } else {
            thinkingBuffer += content;
          }
        } else {
          // If we were thinking via explicit ThinkingDelta and now text starts arriving
          if (isCurrentlyThinking) {
            isCurrentlyThinking = false;
            thinkDuration = Math.round(performance.now() - thinkStartTime);
          }
          textBuffer += content;
        }

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
        isCurrentlyThinking = false;
        insideThinkTag = false;
        flushBuffer();
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          isThinking: false,
        }));
        break;
      }
      case "Error": {
        isCurrentlyThinking = false;
        insideThinkTag = false;
        flushBuffer();
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          isThinking: false,
          error: event.payload,
        }));
        break;
      }
    }
  };

  const start = () => {
    if (rafId !== null) cancelRaf(rafId);
    textBuffer = "";
    thinkingBuffer = "";
    tokensInBatch = 0;
    totalGeneratedTokens = 0;
    startTime = performance.now();
    thinkStartTime = performance.now();
    thinkDuration = 0;
    isCurrentlyThinking = false;
    insideThinkTag = false;

    setState({
      rawText: "",
      thinkingText: "",
      isThinking: false,
      thinkingDurationMs: 0,
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
      cancelRaf(rafId);
      rafId = null;
    }
    textBuffer = "";
    thinkingBuffer = "";
    isCurrentlyThinking = false;
    insideThinkTag = false;
    setState((prev) => ({
      ...prev,
      isStreaming: false,
      isThinking: false,
    }));
  };

  onCleanup(() => {
    if (rafId !== null) cancelRaf(rafId);
  });

  return {
    state,
    start,
    processEvent,
    abort,
  };
}
