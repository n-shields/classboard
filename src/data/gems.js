// How fast a held arrow key repeats a gems adjustment — the browser's own
// OS-driven key-repeat rate varies (and can be much faster than this once a
// text input has focus), so callers drive their own interval instead of
// relying on repeat keydowns.
export const GEMS_REPEAT_MS = 250; // 4 per second
