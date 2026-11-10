import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const WIDGET_FONT_SCALES_KEY = "classboard_widget_font_scales";
// { [period label]: { [widget]: scale } } — each period's own sizes. A
// widget a period hasn't sized yet shows the size it had before sizes went
// per period (its old shared setting, which is no longer written).
const FONT_SCALES_BY_PERIOD_KEY = "classboard_font_scales_by_period";

export const FONT_SCALE_MIN = 0.4;
export const FONT_SCALE_MAX = 4;

/** The period whose font sizes the widgets below it use (its label; null
 *  between periods, which keeps a set of its own too). */
export const FontScalePeriodCtx = createContext(null);

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

function loadPeriodScale(period, widget) {
  try {
    const scale = JSON.parse(localStorage.getItem(FONT_SCALES_BY_PERIOD_KEY) || "{}")[period]?.[widget];
    return Number.isFinite(scale) ? scale : null;
  } catch (_) { return null; }
}

/** `widget`'s font scale in the current period (see FontScalePeriodCtx), or
 *  `fallback` until that period sets one. Shared with other windows. */
export function usePeriodFontScale(widget, fallback = 1) {
  const period = useContext(FontScalePeriodCtx) ?? "";
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onStorage = (e) => { if (e.key === FONT_SCALES_BY_PERIOD_KEY) setVersion(v => v + 1); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const saved = useMemo(() => loadPeriodScale(period, widget), [period, widget, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const setScale = useCallback((next) => {
    try {
      const all = JSON.parse(localStorage.getItem(FONT_SCALES_BY_PERIOD_KEY) || "{}");
      all[period] = { ...all[period], [widget]: next };
      localStorage.setItem(FONT_SCALES_BY_PERIOD_KEY, JSON.stringify(all));
    } catch (_) {}
    setVersion(v => v + 1);
  }, [period, widget]);
  return [saved ?? fallback, setScale];
}

/** A widget's font scale in the current period, for widgets with no settings
 *  store of their own to keep it in. */
export function useWidgetFontScale(widget) {
  const [fallback] = useState(() => loadScale(widget));
  return usePeriodFontScale(widget, fallback);
}
