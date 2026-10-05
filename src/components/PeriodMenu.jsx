import { useState, useRef, useEffect } from "react";
import { periodsNotInSchedule } from "../data/schedules";
import { PERIOD_MENU_EDGES } from "../data/periodMenu";
import "./PeriodBar.css";

// The period buttons (today's schedule, then grayed-out periods from other
// schedules) plus the ⚙ dock-position picker. With `inline`, renders just
// the buttons for a host to place (the main board's under-toolbar row);
// otherwise renders its own hover zone along `edge` and slides out from it.
export default function PeriodMenu({
  schedules, scheduleType,
  currentPeriodIndex, nextPeriodIndex, autoMode,
  onPeriodSelect,
  offSchedulePeriodLabel, onOffSchedulePeriodSelect,
  edge, onEdgeChange,
  inline = false,
}) {
  const [visible, setVisible] = useState(false);
  const [edgePickerOpen, setEdgePickerOpen] = useState(false);
  const hideTimer = useRef(null);
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const periods = schedules[scheduleType] || [];

  const show = () => { clearTimeout(hideTimer.current); setVisible(true); };
  const scheduleHide = () => {
    hideTimer.current = setTimeout(() => { setVisible(false); setEdgePickerOpen(false); }, 300);
  };

  const items = (
    <>
      {periods.map((p, i) => {
        const isActive = i === currentPeriodIndex;
        const isNext   = !isActive && autoMode && currentPeriodIndex === -1 && i === nextPeriodIndex;
        return (
          <button
            key={p.id ?? `${p.label}-${i}`}
            className={`btn btn-sm period-btn ${isActive ? "period-btn-active" : isNext ? "period-btn-next" : "btn-ghost"}`}
            onClick={() => onPeriodSelect(i)}
            title={`${p.start}–${p.end}`}
          >
            {p.label}
          </button>
        );
      })}
      {/* Periods from other schedules that aren't on today's — still
          selectable (to reach their boards), grayed out at the end. */}
      {periodsNotInSchedule(schedules, scheduleType).map(p => (
        <button
          key={`off-${p.label}`}
          className={`btn btn-sm period-btn period-btn-off ${p.label === offSchedulePeriodLabel ? "period-btn-active" : "btn-ghost"}`}
          onClick={() => onOffSchedulePeriodSelect?.(p)}
          title="Not in today's schedule"
        >
          {p.label}
        </button>
      ))}
      <button
        className={`btn btn-sm btn-ghost period-btn period-menu-settings ${edgePickerOpen ? "period-btn-next" : ""}`}
        onClick={() => setEdgePickerOpen(o => !o)}
        title="Period menu position"
      >⚙</button>
      {edgePickerOpen && (
        <div className="period-edge-picker">
          {PERIOD_MENU_EDGES.map(({ edge: e, icon, label }) => (
            <button
              key={e}
              className={`btn btn-sm period-btn ${edge === e ? "period-btn-active" : "btn-ghost"}`}
              onClick={() => { setEdgePickerOpen(false); onEdgeChange(e); }}
              title={`Dock to ${label}`}
            >{icon}</button>
          ))}
        </div>
      )}
    </>
  );

  if (inline) return items;

  return (
    <>
      <div
        className={`period-sidebar-trigger period-sidebar-trigger--${edge}`}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      />
      <div
        className={`period-sidebar period-sidebar--${edge}${visible ? " period-sidebar--visible" : ""}`}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      >
        {items}
      </div>
    </>
  );
}
