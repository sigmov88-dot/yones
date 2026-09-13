import { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { json } from "@codemirror/lang-json";

export function getLanguageExtension(filePath: string): Extension {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";

  switch (ext) {
    case "ts":
    case "tsx":
      return javascript({ typescript: true, jsx: ext.endsWith("x") });
    case "js":
    case "jsx":
      return javascript({ jsx: ext.endsWith("x") });
    case "rs":
      return rust();
    case "json":
      return json();
    default:
      return [];
  }
}
