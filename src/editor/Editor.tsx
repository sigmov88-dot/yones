import { onMount, onCleanup, createSignal, createEffect, Show } from "solid-js";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, undo, redo } from "@codemirror/commands";
import { yonesThemeExtension } from "./theme";
import { getLanguageExtension } from "./lezer";
import { ghostTextExtension, setGhostText } from "./ghost";
import { createLspDiagnosticsExtension, type DiagnosticCount } from "./diagnostics";
import { InlineEdit } from "./inline-edit";

export interface EditorProps {
  filePath: string;
  initialContent: string;
  targetLine?: number;
  onContentChange?: (newContent: string) => void;
  onSave?: (content: string) => void;
  onDiagnosticsChange?: (counts: DiagnosticCount) => void;
}

export function Editor(props: EditorProps) {
  let editorParent!: HTMLDivElement;
  let view: EditorView | null = null;

  const [inlineEditState, setInlineEditState] = createSignal<{
    visible: boolean;
    selectedText: string;
    from: number;
    to: number;
  }>({
    visible: false,
    selectedText: "",
    from: 0,
    to: 0,
  });

  const openInlineEdit = () => {
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);
    setInlineEditState({
      visible: true,
      selectedText,
      from,
      to,
    });
  };

  const applyInlineReplacement = (replacement: string) => {
    if (!view) return;
    const { from, to } = inlineEditState();
    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + replacement.length },
      userEvent: "input.ai",
    });
    setInlineEditState((prev) => ({ ...prev, visible: false }));
  };

  onMount(() => {
    const customKeymap = keymap.of([
      {
        key: "Mod-k",
        run: () => {
          openInlineEdit();
          return true;
        },
      },
      {
        key: "Mod-s",
        run: () => {
          if (view && props.onSave) {
            props.onSave(view.state.doc.toString());
          }
          return true;
        },
      },
      {
        key: "Mod-z",
        run: undo,
      },
      {
        key: "Mod-y",
        run: redo,
      },
      {
        key: "Mod-Shift-z",
        run: redo,
      },
    ]);

    const state = EditorState.create({
      doc: props.initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        yonesThemeExtension,
        getLanguageExtension(props.filePath),
        ghostTextExtension(),
        createLspDiagnosticsExtension(props.onDiagnosticsChange),
        customKeymap,
        keymap.of(historyKeymap),
        keymap.of(defaultKeymap),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && props.onContentChange) {
            props.onContentChange(update.state.doc.toString());
          }
        }),
      ],
    });

    view = new EditorView({
      state,
      parent: editorParent,
    });

    if (props.targetLine && props.targetLine > 0) {
      try {
        const line = view.state.doc.line(Math.min(props.targetLine, view.state.doc.lines));
        view.dispatch({
          selection: { anchor: line.from },
          scrollIntoView: true,
        });
      } catch (e) {
        console.error("Scroll to line error:", e);
      }
    }
  });

  createEffect(() => {
    const target = props.targetLine;
    if (view && target && target > 0) {
      try {
        const line = view.state.doc.line(Math.min(target, view.state.doc.lines));
        view.dispatch({
          selection: { anchor: line.from },
          scrollIntoView: true,
        });
      } catch (e) {
        console.error("Scroll to line error:", e);
      }
    }
  });

  onCleanup(() => {
    view?.destroy();
  });

  return (
    <div class="relative flex-1 h-full w-full overflow-hidden bg-[var(--color-bg-editor)]">
      <div ref={editorParent} class="h-full w-full" />

      <Show when={inlineEditState().visible}>
        <div class="absolute top-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4">
          <InlineEdit
            filePath={props.filePath}
            selectedText={inlineEditState().selectedText}
            onApply={applyInlineReplacement}
            onClose={() => setInlineEditState((prev) => ({ ...prev, visible: false }))}
          />
        </div>
      </Show>
    </div>
  );
}

export { setGhostText };
