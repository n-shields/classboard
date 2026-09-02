import { useEffect, useRef } from "react";

const IDLE_MS = 10000;

/**
 * Hides the text caret in a contentEditable / input element after IDLE_MS with
 * no typing, and brings it back on the next keystroke or click. The browser
 * owns the blink rate, so `caret-color: transparent` (via the `.caret-idle`
 * class) is the only lever available.
 */
export default function useIdleCaret(ref) {
  const timerRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const wake = () => {
      el.classList.remove("caret-idle");
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => el.classList.add("caret-idle"), IDLE_MS);
    };

    wake();
    el.addEventListener("keydown", wake);
    el.addEventListener("input", wake);
    el.addEventListener("pointerdown", wake);
    el.addEventListener("focus", wake);

    return () => {
      clearTimeout(timerRef.current);
      el.removeEventListener("keydown", wake);
      el.removeEventListener("input", wake);
      el.removeEventListener("pointerdown", wake);
      el.removeEventListener("focus", wake);
    };
  }, [ref]);
}
