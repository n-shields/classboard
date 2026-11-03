import { useEffect, useState } from "react";

const WIDGET_FONT_SCALES_KEY = "classboard_widget_font_scales";

export const FONT_SCALE_MIN = 0.4;
export const FONT_SCALE_MAX = 4;

/** `scale` one 5% step up (dir 1) or down (dir -1), in points of the widget's
 *  original size (100% -> 105% -> 110%). Lands on a multiple of 5%, so a size
 *  saved before this step existed joins the same steps on its first click. */
export function stepFontScale(scale, dir) {
  const next = (Math.round(scale * 20) + dir) / 20;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, next));
}

function loadScale(widget) {
  try {
    const scale = JSON.parse(localStorage.getItem(WIDGET_FONT_SCALES_KEY) || "{}")[widget];
    return Number.isFinite(scale) ? scale : 1;
  } catch (_) { return 1; }
}

/** A widget's saved font scale, shared with its copies in other windows. For
 *  widgets with no settings store of their own to keep it in. */
export function useWidgetFontScale(widget) {
  const [scale, setScaleState] = useState(() => loadScale(widget));
  useEffect(() => {
    const onStorage = (e) => { if (e.key === WIDGET_FONT_SCALES_KEY) setScaleState(loadScale(widget)); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [widget]);
  const setScale = (next) => {
    setScaleState(next);
    try {
      const all = JSON.parse(localStorage.getItem(WIDGET_FONT_SCALES_KEY) || "{}");
      localStorage.setItem(WIDGET_FONT_SCALES_KEY, JSON.stringify({ ...all, [widget]: next }));
    } catch (_) {}
  };
  return [scale, setScale];
}
