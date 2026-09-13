import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const yonesEditorTheme = EditorView.theme(
  {
    "&": {
      color: "var(--color-fg-primary)",
      backgroundColor: "var(--color-bg-editor)",
      height: "100%",
      fontSize: "13px",
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
    },
    ".cm-content": {
      caretColor: "var(--color-accent)",
      padding: "8px 0",
      lineHeight: "1.6",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "var(--color-accent)",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--color-accent-ring)",
    },
    ".cm-panels": {
      backgroundColor: "var(--color-bg-panel)",
      color: "var(--color-fg-primary)",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid var(--color-border-subtle)",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "1px solid var(--color-border-subtle)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--color-bg-editor)",
      color: "var(--color-fg-muted)",
      borderRight: "1px solid var(--color-border-subtle)",
      paddingRight: "8px",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--color-fg-secondary)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--color-bg-active)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--color-bg-raised)",
      border: "none",
      color: "var(--color-fg-muted)",
    },
  },
  { dark: true }
);

export const yonesHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--color-syn-keyword)" },
  { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: "var(--color-syn-variable)" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "var(--color-syn-function)" },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "var(--color-syn-number)" },
  { tag: [tags.definition(tags.name), tags.separator], color: "var(--color-syn-variable)" },
  {
    tag: [
      tags.typeName,
      tags.className,
      tags.number,
      tags.changed,
      tags.annotation,
      tags.modifier,
      tags.self,
      tags.namespace,
    ],
    color: "var(--color-syn-type)",
  },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link], color: "var(--color-syn-operator)" },
  { tag: [tags.meta, tags.comment], color: "var(--color-syn-comment)", fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.string, color: "var(--color-syn-string)" },
]);

export const yonesThemeExtension: Extension = [
  yonesEditorTheme,
  syntaxHighlighting(yonesHighlightStyle),
];
