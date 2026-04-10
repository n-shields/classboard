import { useState } from "react";
import "./WarningMeter.css";

const MAX = 4;

export default function WarningMeter() {
  const [count, setCount] = useState(0);

  const add = () => setCount(c => Math.min(c + 1, MAX));
  const clear = () => setCount(0);
  // Click a segment to set level to that segment (or one below if already at it)
  const clickSeg = (i) => setCount(count === i + 1 ? i : i + 1);

  return (
    <div className="warning-meter">
      <button
        className="warning-icon"
        onClick={add}
        title="Add warning"
        disabled={count >= MAX}
      >⚠</button>
      <div className="warning-segs">
        {Array.from({ length: MAX }, (_, i) => (
          <div
            key={i}
            className={`warning-seg ${i < count ? "w-filled" : ""} ${count === MAX ? "w-max" : ""}`}
            onClick={() => clickSeg(i)}
            title={`${i < count ? "Remove" : "Set"} warning ${i + 1}`}
          />
        ))}
      </div>
      {count > 0 && (
        <button className="warning-clear" onClick={clear} title="Clear all warnings">✕</button>
      )}
    </div>
  );
}
