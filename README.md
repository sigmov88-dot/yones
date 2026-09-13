# Yones IDE

> High-performance desktop code editor with embedded AI agent (Tauri v2 + SolidJS + CodeMirror 6).

Yones IDE delivers the engineering feel of a local tool rather than an artificial chat wrapper. AI edits text with unified diff previews, awaiting explicit confirmation from the human developer.

---

## Architectural Principles

- **Shell:** Tauri v2 (Rust). Handles file I/O, search, path virtualization, process sandboxing, and secure provider proxying.
- **UI:** SolidJS + TypeScript (strict). Zero VDOM overhead.
- **Editor:** CodeMirror 6 with Lezer grammars. Isolated rendering canvas unaffected by sidebar or assistant updates.
- **Styling:** Tailwind CSS v4 design tokens via `@theme`. Zero hex literals in components.
- **Safety:** Path-jail containment preventing reads/writes outside workspace root. Strict command allow-list. API secrets stored in OS keychain.

---

## Hotkeys

| Hotkey | Action |
|---|---|
| `Cmd+O` / `Ctrl+O` | Open Project Folder |
| `Cmd+K` / `Ctrl+K` | Inline Edit (on selection) |
| `Cmd+L` / `Ctrl+L` | Assistant Panel (with `@` context) |
| `Tab` | Accept Ghost Completion |
| `Cmd+Enter` / `Ctrl+Enter` | Apply Inline Diff / Edit |
| `Esc` | Abort Stream (≤ 100 ms) / Dismiss Overlay |
| `Cmd+Z` / `Ctrl+Z` | Undo Modification |

---

## Verification & Definition of Done

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Run Unit Tests (Vitest):**
   ```bash
   pnpm test
   ```

3. **Run Typing Benchmark (p99 ≤ 8 ms):**
   ```bash
   pnpm bench
   ```

4. **Verify Zero Hex Literals (ESLint):**
   ```bash
   pnpm lint
   ```

5. **Run Rust Path-Jail & Transaction Tests:**
   ```bash
   cargo test --manifest-path src-tauri/Cargo.toml
   ```

6. **Launch Desktop App:**
   ```bash
   pnpm tauri dev
   ```

---

## License

MIT
