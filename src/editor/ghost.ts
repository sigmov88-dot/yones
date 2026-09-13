import { Extension, StateField, StateEffect } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType, keymap } from "@codemirror/view";

export const setGhostText = StateEffect.define<string | null>();

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.text;
    span.className = "cm-ghost-text";
    span.style.color = "var(--color-ai-ghost)";
    span.style.fontStyle = "italic";
    span.style.pointerEvents = "none";
    span.style.userSelect = "none";
    return span;
  }
}

export const ghostTextField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setGhostText)) {
        if (!effect.value) return Decoration.none;
        const pos = tr.state.selection.main.head;
        const widget = Decoration.widget({
          widget: new GhostTextWidget(effect.value),
          side: 1,
        });
        return Decoration.set([widget.range(pos)]);
      }
    }
    if (tr.docChanged) {
      return Decoration.none;
    }
    return decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function acceptGhostTextCommand(view: EditorView): boolean {
  const field = view.state.field(ghostTextField, false);
  if (!field) return false;

  let ghostText = "";
  field.between(0, view.state.doc.length, (_from, _to, value) => {
    const spec = value.spec as { widget?: GhostTextWidget };
    if (spec.widget && spec.widget instanceof GhostTextWidget) {
      ghostText = spec.widget.text;
    }
  });

  if (ghostText.length > 0) {
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: pos, insert: ghostText },
      selection: { anchor: pos + ghostText.length },
      effects: setGhostText.of(null),
    });
    return true;
  }

  return false;
}

export const ghostTextKeymap: Extension = keymap.of([
  {
    key: "Tab",
    run: acceptGhostTextCommand,
  },
]);

export function ghostTextExtension(): Extension {
  return [ghostTextField, ghostTextKeymap];
}
