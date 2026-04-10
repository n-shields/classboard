import { useState, useRef, useEffect } from "react";
import "./CameraFeed.css";

export default function CameraFeed() {
  const videoRef = useRef(null);
  const freezeCanvasRef = useRef(null);
  const streamRef = useRef(null);
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
