import { useState, useRef, useEffect } from "react";
import "./CameraFeed.css";

const CAMERA_SETTINGS_KEY = "classboard_camera_settings";

function loadSettings(periodKey) {
  try {
    const all = JSON.parse(localStorage.getItem(CAMERA_SETTINGS_KEY) || "{}");
    return all[periodKey ?? "default"] ?? { mirrored: true, flippedV: false };
  } catch (_) { return { mirrored: true, flippedV: false }; }
}

function saveSettings(periodKey, settings) {
  try {
    const all = JSON.parse(localStorage.getItem(CAMERA_SETTINGS_KEY) || "{}");
    all[periodKey ?? "default"] = settings;
    localStorage.setItem(CAMERA_SETTINGS_KEY, JSON.stringify(all));
  } catch (_) {}
}


const OVERLAY_FONT_SIZES = {
  sm: { normal: "clamp(0.9rem, 2vw, 1.5rem)",   fullscreen: "clamp(1.2rem, 3vw, 2.5rem)"  },
  md: { normal: "clamp(1.2rem, 3vw, 2rem)",     fullscreen: "clamp(2rem, 6vw, 5rem)"      },
  lg: { normal: "clamp(1.6rem, 4vw, 2.8rem)",   fullscreen: "clamp(2.8rem, 8vw, 7rem)"    },
  xl: { normal: "clamp(2.2rem, 6vw, 4rem)",     fullscreen: "clamp(4rem, 11vw, 9rem)"     },
};

export default function CameraFeed({ periodKey, clockDisplay, clockFontSize = "md" }) {
  const videoRef         = useRef(null);
  const freezeCanvasRef  = useRef(null);
  const streamRef        = useRef(null);
  const cameraContentRef = useRef(null);

  const [active,       setActive]       = useState(false);
  const [frozen,       setFrozen]       = useState(false);
  const [error,        setError]        = useState(null);
  const [mirrored,     setMirrored]     = useState(() => loadSettings(periodKey).mirrored);
  const [flippedV,     setFlippedV]     = useState(() => loadSettings(periodKey).flippedV);
  const [isFullscreen,   setIsFullscreen]   = useState(false);
  const [showClock,      setShowClock]      = useState(false);
  const [showControls,   setShowControls]   = useState(false);

  // Track browser fullscreen state
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Reload settings when period changes
  useEffect(() => {
    const s = loadSettings(periodKey);
    setMirrored(s.mirrored);
    setFlippedV(s.flippedV);
  }, [periodKey]);

  // Persist settings whenever they change
  useEffect(() => {
    saveSettings(periodKey, { mirrored, flippedV });
  }, [periodKey, mirrored, flippedV]);

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
    const video  = videoRef.current;
    const canvas = freezeCanvasRef.current;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.translate(mirrored ? canvas.width : 0, flippedV ? canvas.height : 0);
    ctx.scale(mirrored ? -1 : 1, flippedV ? -1 : 1);
    ctx.drawImage(video, 0, 0);
    ctx.restore();
    setFrozen(true);
  };

  const captureImage = () => {
    if (!active && !frozen) return;
    let url;
    if (frozen) {
      url = freezeCanvasRef.current.toDataURL("image/png");
    } else {
      const video  = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.save();
      ctx.translate(mirrored ? canvas.width : 0, flippedV ? canvas.height : 0);
      ctx.scale(mirrored ? -1 : 1, flippedV ? -1 : 1);
      ctx.drawImage(video, 0, 0);
      ctx.restore();
      url = canvas.toDataURL("image/png");
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `classboard-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.png`;
    a.click();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      cameraContentRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => () => stopCamera(), []);

  const flipTransform = [mirrored && "scaleX(-1)", flippedV && "scaleY(-1)"]
    .filter(Boolean).join(" ") || "none";

  const overlayFontSize = (OVERLAY_FONT_SIZES[clockFontSize] ?? OVERLAY_FONT_SIZES.md)[isFullscreen ? "fullscreen" : "normal"];

  return (
    <div className="card camera-feed" tabIndex={-1}>
      <div className="camera-content" ref={cameraContentRef} onClick={() => setShowControls(v => !v)}>
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
            <span onClick={e => { e.stopPropagation(); startCamera(); }} title="Start camera">📷</span>
          </div>
        )}

        {frozen && <div className="freeze-badge">FROZEN</div>}

        {/* Fullscreen toggle — bottom-right overlay */}
        <button
          className="camera-fullscreen-btn"
          onClick={e => { e.stopPropagation(); toggleFullscreen(); }}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >{isFullscreen ? "⊡" : "⛶"}</button>

        {/* Clock overlay — top-right; clicking it hides it; ghost icon re-shows it */}
        {isFullscreen && showClock && clockDisplay && (
          <div
            className="camera-clock-overlay"
            style={{ fontSize: overlayFontSize }}
            onClick={e => { e.stopPropagation(); setShowClock(false); }}
            title="Click to hide"
          >{clockDisplay}</div>
        )}
        {isFullscreen && !showClock && (
          <button
            className="camera-clock-restore"
            onClick={e => { e.stopPropagation(); setShowClock(true); }}
            title="Show clock overlay"
          >🕒</button>
        )}
      </div>

      <div className={`camera-sidebar${showControls ? "" : " camera-sidebar--hidden"}`}>
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
          className="sidebar-btn"
          onClick={captureImage}
          disabled={!active && !frozen}
          title="Save image"
        >📸</button>

        {active && (
          <>
            <div className="sidebar-divider" />
            <button
              className="sidebar-btn sidebar-btn-danger"
              onClick={stopCamera}
              title="Stop camera"
            >■</button>
          </>
        )}
      </div>
    </div>
  );
}
