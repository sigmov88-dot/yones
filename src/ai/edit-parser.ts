export interface ParsedBlock {
  search: string;
  replace: string;
}

export interface ParsedFilePatch {
  filePath: string;
  blocks: ParsedBlock[];
}

export interface DiffLine {
  type: "unchanged" | "added" | "removed";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

const SEARCH_START = "<<<<<<< SEARCH";
const DIVIDER = "=======";
const REPLACE_END = ">>>>>>> REPLACE";

export function parseSearchReplaceBlocks(modelOutput: string): ParsedFilePatch[] {
  const patches: Map<string, ParsedBlock[]> = new Map();
  const lines = modelOutput.replace(/\r\n/g, "\n").split("\n");

  let currentFile = "default";
  let mode: "IDLE" | "SEARCH" | "REPLACE" = "IDLE";
  let searchAcc: string[] = [];
  let replaceAcc: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fileMatch = line.match(/^###\s+([^\s]+)/) || line.match(/^\*\*\*([^\*]+)\*\*\*/);
    if (fileMatch && mode === "IDLE") {
      currentFile = fileMatch[1].trim();
      continue;
    }

    if (line.trim() === SEARCH_START) {
      mode = "SEARCH";
      searchAcc = [];
      replaceAcc = [];
      continue;
    }

    if (line.trim() === DIVIDER && mode === "SEARCH") {
      mode = "REPLACE";
      continue;
    }

    if (line.trim() === REPLACE_END && mode === "REPLACE") {
      mode = "IDLE";
      const block: ParsedBlock = {
        search: searchAcc.join("\n") + (searchAcc.length > 0 ? "\n" : ""),
        replace: replaceAcc.join("\n") + (replaceAcc.length > 0 ? "\n" : ""),
      };

      const existing = patches.get(currentFile) ?? [];
      existing.push(block);
      patches.set(currentFile, existing);
      continue;
    }

    if (mode === "SEARCH") {
      searchAcc.push(line);
    } else if (mode === "REPLACE") {
      replaceAcc.push(line);
    }
  }

  return Array.from(patches.entries()).map(([filePath, blocks]) => ({
    filePath,
    blocks,
  }));
}

export function generateUnifiedDiff(original: string, updated: string): DiffLine[] {
  const origLines = original.replace(/\r\n/g, "\n").split("\n");
  const modLines = updated.replace(/\r\n/g, "\n").split("\n");

  const diff: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < origLines.length || j < modLines.length) {
    if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
      diff.push({
        type: "unchanged",
        content: origLines[i],
        oldLineNumber: i + 1,
        newLineNumber: j + 1,
      });
      i++;
      j++;
    } else {
      let matchJ = -1;
      let matchI = -1;

      for (let look = 1; look < 8; look++) {
        if (j + look < modLines.length && origLines[i] === modLines[j + look]) {
          matchJ = j + look;
          break;
        }
        if (i + look < origLines.length && origLines[i + look] === modLines[j]) {
          matchI = i + look;
          break;
        }
      }

      if (matchJ !== -1) {
        while (j < matchJ) {
          diff.push({
            type: "added",
            content: modLines[j],
            newLineNumber: j + 1,
          });
          j++;
        }
      } else if (matchI !== -1) {
        while (i < matchI) {
          diff.push({
            type: "removed",
            content: origLines[i],
            oldLineNumber: i + 1,
          });
          i++;
        }
      } else {
        if (i < origLines.length) {
          diff.push({
            type: "removed",
            content: origLines[i],
            oldLineNumber: i + 1,
          });
          i++;
        }
        if (j < modLines.length) {
          diff.push({
            type: "added",
            content: modLines[j],
            newLineNumber: j + 1,
          });
          j++;
        }
      }
    }
  }

  return diff;
}
