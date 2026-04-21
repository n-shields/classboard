import { Component } from "react";

const CLASSBOARD_KEYS = [
  "classboard_schedules", "classboard_schedule_type", "classboard_schedule_days",
  "classboard_period_data", "classboard_global_theme", "classboard_period_layout",
  "classboard_layout", "classboard_layout_v2", "classboard_date_format",
  "classboard_date_widget", "classboard_camera_settings", "classboard_wheel_settings",
];

function clearAll() {
  // Clear known keys plus any dynamic ones (seating, etc.)
  CLASSBOARD_KEYS.forEach(k => localStorage.removeItem(k));
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith("classboard_")) localStorage.removeItem(k);
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  handleReset = () => {
    clearAll();
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#0f172a", color: "#e2e8f0", gap: 16, padding: 32,
        fontFamily: "Segoe UI, sans-serif", textAlign: "center",
      }}>
        <div style={{ fontSize: "2rem" }}>⚠</div>
        <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>Something went wrong</div>
        <div style={{ fontSize: "0.85rem", color: "#94a3b8", maxWidth: 420 }}>
          {this.state.error?.message || "An unexpected error occurred."}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            onClick={() => window.location.reload()}
            style={btnStyle("#334155", "#e2e8f0")}
          >
            Reload
          </button>
          <button
            onClick={this.handleReset}
            style={btnStyle("#dc2626", "#fff")}
            title="Clears all saved data and reloads with defaults"
          >
            Reset to defaults
          </button>
        </div>
        <div style={{ fontSize: "0.72rem", color: "#475569", marginTop: 4 }}>
          "Reset to defaults" clears all saved settings and data.
        </div>
      </div>
    );
  }
}

function btnStyle(bg, color) {
  return {
    padding: "8px 20px", borderRadius: 8, border: "none",
    background: bg, color, cursor: "pointer", fontSize: "0.9rem", fontWeight: 600,
  };
}
