import { Diagnostic, linter, lintGutter } from "@codemirror/lint";
import { Extension } from "@codemirror/state";

export interface DiagnosticCount {
  errors: number;
  warnings: number;
}

export function analyzeBracketsAndSyntax(text: string): {
  diagnostics: Diagnostic[];
  errors: number;
  warnings: number;
} {
  const diagnostics: Diagnostic[] = [];
  const stack: { char: string; pos: number }[] = [];
  const pairs: Record<string, string> = { "}": "{", "]": "[", ")": "(" };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "{" || char === "[" || char === "(") {
      stack.push({ char, pos: i });
    } else if (char === "}" || char === "]" || char === ")") {
      const expected = pairs[char];
      const last = stack.pop();
      if (!last || last.char !== expected) {
        diagnostics.push({
          from: i,
          to: Math.min(i + 1, text.length),
          severity: "error",
          message: `Unmatched closing bracket '${char}'`,
        });
      }
    }
  }

  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    diagnostics.push({
      from: unclosed.pos,
      to: Math.min(unclosed.pos + 1, text.length),
      severity: "error",
      message: `Unclosed bracket '${unclosed.char}'`,
    });
  }

  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;

  return { diagnostics, errors, warnings };
}

export function createLspDiagnosticsExtension(
  onDiagnosticsChange?: (counts: DiagnosticCount) => void
): Extension {
  const customLinter = linter((view) => {
    const text = view.state.doc.toString();
    const result = analyzeBracketsAndSyntax(text);

    if (onDiagnosticsChange) {
      onDiagnosticsChange({ errors: result.errors, warnings: result.warnings });
    }

    return result.diagnostics;
  });

  return [lintGutter(), customLinter];
}
