import { useState } from "react";

// Which screen edge the period menu docks to. On the main board "top" puts
// it in a row just under the toolbar (revealed along with it); everywhere
// else, and every other edge, it slides out from that edge on hover.
export const PERIOD_MENU_EDGES = [
  { edge: "left",   icon: "◀", label: "Left" },
  { edge: "top",    icon: "▲", label: "Top" },
  { edge: "right",  icon: "▶", label: "Right" },
  { edge: "bottom", icon: "▼", label: "Bottom" },
];

// Each window that shows the menu remembers its own edge (by storageKey), so
// docking it somewhere on the board doesn't also move it in the seating
// chart window, whose own toolbar and controls sit in different places.
export function usePeriodMenuEdge(storageKey) {
  const load = () => {
    try {
      const v = localStorage.getItem(storageKey);
      return PERIOD_MENU_EDGES.some(e => e.edge === v) ? v : "left";
    } catch (_) { return "left"; }
  };
  const [edge, setEdgeState] = useState(load);
  const setEdge = (next) => {
    setEdgeState(next);
    try { localStorage.setItem(storageKey, next); } catch (_) {}
  };
  return [edge, setEdge];
}
