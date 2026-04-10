import { useState, useRef, useEffect } from "react";
import "./CameraFeed.css";

const EXPORT_KEYS = [
  "classboard_schedules",
  "classboard_schedule_type",
  "classboard_period_data",
  "classboard_global_theme",
  "classboard_period_layout",
];

function doExport() {
  const data = {};
  EXPORT_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) try { data[k] = JSON.parse(v); } catch (_) { data[k] = v; }
  });
  // schedule_type is a plain string, re-read to be safe
  data.classboard_schedule_type = localStorage.getItem("classboard_schedule_type") || "Normal";
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `classboard-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CameraFeed({ onImport }) {
  const videoRef = useRef(null);
  const freezeCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const importRef = useRef(null);
  const [active, setActive] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [mirrored, setMirrored] = useState(true);
  const [flippedV, setFlippedV] = useState(false);
  const [error, setError] = useState(null);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setActive(true);
      setFrozen(false);
    } catch (err) {
      setError(err.message || "Camera access denied");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setFrozen(false);
  };

  const toggleFreeze = () => {
    if (!active) return;
    if (frozen) { setFrozen(false); return; }
    const video = videoRef.current;
    const canvas = freezeCanvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (mirrored || flippedV) {
      ctx.save();
      ctx.translate(mirrored ? canvas.width : 0, flippedV ? canvas.height : 0);
      ctx.scale(mirrored ? -1 : 1, flippedV ? -1 : 1);
      ctx.drawImage(video, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0);
    }
    setFrozen(true);
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const strKeys = ["classboard_schedule_type", "classboard_global_theme"];
        const jsonKeys = ["classboard_schedules", "classboard_period_data", "classboard_period_layout"];
        strKeys.forEach(k => { if (data[k] != null) localStorage.setItem(k, data[k]); });
        jsonKeys.forEach(k => { if (data[k] != null) localStorage.setItem(k, JSON.stringify(data[k])); });
        onImport?.();
      } catch (err) {
        alert("Could not read file: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  useEffect(() => () => stopCamera(), []);

  const flipTransform = [mirrored && "scaleX(-1)", flippedV && "scaleY(-1)"]
    .filter(Boolean).join(" ") || "none";

  return (
    <div className="card camera-feed">
      <div className="camera-sidebar">
        <div className="sidebar-label">Cam</div>

        <div className="sidebar-section">
          <button
            className={`sidebar-btn ${mirrored ? "sidebar-btn-active" : ""}`}
            onClick={() => setMirrored(m => !m)}
            title="Flip horizontal"
          >⟺</button>
          <button
            className={`sidebar-btn ${flippedV ? "sidebar-btn-active" : ""}`}
            onClick={() => setFlippedV(v => !v)}
            title="Flip vertical"
          >↕</button>
        </div>

        <div className="sidebar-divider" />

        <button
          className={`sidebar-btn ${frozen ? "sidebar-btn-active" : ""}`}
          onClick={toggleFreeze}
          disabled={!active}
          title={frozen ? "Unfreeze" : "Freeze frame"}
        >❄</button>

        <div className="sidebar-divider" />

        <button
          className={`sidebar-btn ${active ? "sidebar-btn-danger" : "sidebar-btn-active"}`}
          onClick={active ? stopCamera : startCamera}
          title={active ? "Stop camera" : "Start camera"}
        >{active ? "■" : "▶"}</button>

        {/* Spacer pushes export/import to bottom */}
        <div className="sidebar-spacer" />

        <div className="sidebar-divider" />

        <button
          className="sidebar-btn"
          onClick={doExport}
          title="Export all data to JSON"
        >↑</button>
        <button
          className="sidebar-btn"
          onClick={() => importRef.current.click()}
          title="Import data from JSON"
        >↓</button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />
      </div>

      <div className="camera-content">
        {error && <div className="camera-error">{error}</div>}

        <video
          ref={videoRef}
          className="camera-video"
          style={{ transform: flipTransform, display: active && !frozen ? "block" : "none" }}
          autoPlay
          playsInline
          muted
        />

        <canvas
          ref={freezeCanvasRef}
          className="camera-video freeze-canvas"
          style={{ display: frozen ? "block" : "none" }}
        />

        {!active && !error && (
          <div className="camera-placeholder">
            <span>📷</span>
            <p>Click ▶ to start</p>
          </div>
        )}

        {frozen && (
          <div className="freeze-badge">FROZEN</div>
        )}
      </div>
    </div>
  );
}
