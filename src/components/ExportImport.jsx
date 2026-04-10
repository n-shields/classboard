import { useRef } from "react";
import "./ExportImport.css";

const KEYS = [
  "classboard_schedules",
  "classboard_schedule_type",
  "classboard_period_data",
  "classboard_global_theme",
];

export default function ExportImport({ onImport }) {
  const fileRef = useRef(null);

  const handleExport = () => {
    const data = {};
    KEYS.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = JSON.parse(v);
    });
    // Also store raw string for schedule_type
    data.classboard_schedule_type = localStorage.getItem("classboard_schedule_type") || "Normal";

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `classboard-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.classboard_schedules)
          localStorage.setItem("classboard_schedules", JSON.stringify(data.classboard_schedules));
        if (data.classboard_schedule_type)
          localStorage.setItem("classboard_schedule_type", data.classboard_schedule_type);
        if (data.classboard_period_data)
          localStorage.setItem("classboard_period_data", JSON.stringify(data.classboard_period_data));
        if (data.classboard_global_theme)
          localStorage.setItem("classboard_global_theme", data.classboard_global_theme);
        onImport?.();
      } catch (err) {
        alert("Could not read file: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <div className="export-import">
      <button
        className="ei-btn"
        onClick={handleExport}
        title="Export all data to JSON file"
      >
        <span>↑</span>
        <span className="ei-label">Export</span>
      </button>
      <button
        className="ei-btn"
        onClick={() => fileRef.current.click()}
        title="Import data from JSON file"
      >
        <span>↓</span>
        <span className="ei-label">Import</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleImport}
      />
    </div>
  );
}
