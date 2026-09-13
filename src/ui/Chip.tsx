import { JSX } from "solid-js";
import { CloseIcon } from "./icons";

export interface ChipProps {
  label: string;
  onRemove?: () => void;
  icon?: JSX.Element;
  class?: string;
}

export function Chip(props: ChipProps) {
  return (
    <span
      class={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-[var(--color-bg-raised)] border border-[var(--color-border)] text-[var(--color-fg-secondary)] ${props.class || ""}`}
    >
      {props.icon}
      <span>{props.label}</span>
      {props.onRemove && (
        <button
          type="button"
          onClick={props.onRemove}
          class="text-[var(--color-fg-muted)] hover:text-[var(--color-fg-primary)] cursor-pointer leading-none"
        >
          <CloseIcon class="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
