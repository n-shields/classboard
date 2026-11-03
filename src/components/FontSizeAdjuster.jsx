import { FONT_SCALE_MIN, FONT_SCALE_MAX, stepFontScale } from "../data/fontScale";
import "./FontSizeAdjuster.css";

// The A− / A+ font size control in each widget's settings. `scale` is a
// multiplier of the widget's original size (1 = 100%).
export default function FontSizeAdjuster({ scale, onChange }) {
  return (
    <div className="font-size-adjuster">
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(stepFontScale(scale, -1))} title="Smaller (5%)" disabled={scale <= FONT_SCALE_MIN + 1e-6}>A−</button>
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(stepFontScale(scale, 1))} title="Larger (5%)" disabled={scale >= FONT_SCALE_MAX - 1e-6}>A+</button>
    </div>
  );
}
