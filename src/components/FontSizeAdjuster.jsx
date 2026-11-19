import { FONT_SCALE_MIN, FONT_SCALE_MAX, stepFontScale } from "../data/fontScale";
import "./FontSizeAdjuster.css";

// The A− / A+ font size control in each widget's settings. `scale` is a
// multiplier of the widget's original size (1 = 100%); `max` lets a widget
// whose original size is small (e.g. one fitted to its pane) go further.
export default function FontSizeAdjuster({ scale, onChange, max = FONT_SCALE_MAX, className = "" }) {
  return (
    <div className={`font-size-adjuster ${className}`}>
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(stepFontScale(scale, -1, max))} title="Smaller (10%)" disabled={scale <= FONT_SCALE_MIN + 1e-6}>A−</button>
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(stepFontScale(scale, 1, max))} title="Larger (10%)" disabled={scale >= max - 1e-6}>A+</button>
    </div>
  );
}
