import { invoke } from "@tauri-apps/api/core";
import type { ToolDefinition } from "./provider";

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read contents of a file within the project. Limited to 64KB output.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to file from workspace root" },
        line_start: { type: "number", description: "Optional 1-based start line" },
        line_end: { type: "number", description: "Optional 1-based end line" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_dir",
    description: "List contents of a directory within the project.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative directory path (empty for root)" },
        recursive: { type: "boolean", description: "Whether to list subdirectories" },
      },
    },
  },
  {
    name: "search",
    description: "Search project files using ripgrep for exact string or regex pattern.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search pattern or query" },
        is_regex: { type: "boolean", description: "Whether query is a regex pattern" },
        include_glob: { type: "string", description: "Optional glob filter, e.g. *.ts" },
      },
      required: ["query"],
    },
  },
  {
    name: "apply_diff",
    description: "Apply search/replace blocks atomically across one or more files in the workspace.",
    parameters: {
      type: "object",
      properties: {
        transaction_id: { type: "string", description: "Unique transaction identifier" },
        patches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              relative_path: { type: "string" },
              blocks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    search: { type: "string" },
                    replace: { type: "string" },
                  },
                  required: ["search", "replace"],
                },
              },
            },
            required: ["relative_path", "blocks"],
          },
        },
      },
      required: ["transaction_id", "patches"],
    },
  },
  {
    name: "run_command",
    description: "Execute allowed terminal command (pnpm, cargo, git status/diff/log, ls, rg) with 60s timeout.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to execute" },
        args: { type: "array", items: { type: "string" }, description: "Command arguments" },
      },
      required: ["command"],
    },
  },
];

export async function executeTool(name: string, argsJson: string): Promise<string> {
  try {
    const args = JSON.parse(argsJson || "{}");
    const result = await invoke<string>("execute_agent_tool", { name, args });
    if (result.length > 65536) {
      return result.slice(0, 65536) + "\n...[Output truncated to 64KB limit]";
    }
    return result;
  } catch (err: unknown) {
    return `Error executing tool '${name}': ${String(err)}`;
  }
}
