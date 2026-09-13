import { JSX } from "solid-js";

export interface ButtonProps {
  variant?: "primary" | "ghost" | "secondary";
  size?: "sm" | "md";
  onClick?: () => void;
  disabled?: boolean;
  class?: string;
  children: JSX.Element;
  type?: "button" | "submit" | "reset";
}

export function Button(props: ButtonProps) {
  const variantClasses = () => {
    switch (props.variant ?? "secondary") {
      case "primary":
        return "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-press)] border-transparent";
      case "ghost":
        return "bg-transparent text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-raised)] border-transparent";
      case "secondary":
      default:
        return "bg-[var(--color-bg-raised)] text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-active)] border-[var(--color-border)]";
    }
  };

  const sizeClasses = () => {
    switch (props.size ?? "sm") {
      case "md":
        return "px-3 py-1.5 text-sm";
      case "sm":
      default:
        return "px-2 py-1 text-xs";
    }
  };

  return (
    <button
      type={props.type ?? "button"}
      disabled={props.disabled}
      onClick={props.onClick}
      class={`inline-flex items-center justify-center font-medium rounded border transition-colors outline-none focus:ring-1 focus:ring-[var(--color-accent-ring)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${variantClasses()} ${sizeClasses()} ${props.class || ""}`}
    >
      {props.children}
    </button>
  );
}
