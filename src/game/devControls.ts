/** Explicit URL opt-in, also usable without browser globals in tests. */
export function devControlsEnabled(search = typeof location === "undefined" ? "" : location.search) {
  return new URLSearchParams(search).get("dev") === "1";
}

export function typingInInput() {
  return typeof document !== "undefined" && !!document.activeElement?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
}
