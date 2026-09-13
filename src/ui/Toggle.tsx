export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
  class?: string;
}

export function Toggle(props: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled}
      title={props.title}
      class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-ring)] ${
        props.disabled ? "opacity-40 cursor-not-allowed" : ""
      } ${
        props.checked
          ? "bg-[var(--color-accent)] border-transparent"
          : "bg-[var(--color-bg-editor)] border-[var(--color-border)]"
      } ${props.class || ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!props.disabled) {
          props.onChange(!props.checked);
        }
      }}
    >
      <span
        class={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out mt-[2px] ml-[2px] ${
          props.checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
