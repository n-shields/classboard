import { useState, useRef, useEffect } from "react";
import "./CameraFeed.css";

const CAMERA_SETTINGS_KEY = "classboard_camera_settings";

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(CAMERA_SETTINGS_KEY) || "{}");
    return { mirrored: true, flippedV: false, ...s };
  } catch (_) { return { mirrored: true, flippedV: false }; }
}

function saveSettings(settings) {
  try { localStorage.setItem(CAMERA_SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
}

const OVERLAY_FONT_SIZES = {
  sm: { normal: "clamp(0.9rem, 2vw, 1.5rem)",   fullscreen: "clamp(1.2rem, 3vw, 2.5rem)"  },
  md: { normal: "clamp(1.2rem, 3vw, 2rem)",     fullscreen: "clamp(2rem, 6vw, 5rem)"      },
  lg: { normal: "clamp(1.6rem, 4vw, 2.8rem)",   fullscreen: "clamp(2.8rem, 8vw, 7rem)"    },
  xl: { normal: "clamp(2.2rem, 6vw, 4rem)",     fullscreen: "clamp(4rem, 11vw, 9rem)"     },
};

const DEFAULT_LEVELS = { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 };

function computeLevelsTable(inBlack, inWhite, gamma, outBlack, outWhite) {
  return Array.from({ length: 17 }, (_, i) => {
    const v = (i / 16) * 255;
    let t = v <= inBlack ? 0 : v >= inWhite ? 1 : (v - inBlack) / (inWhite - inBlack);
    if (gamma !== 1) t = Math.pow(t, 1 / gamma);
    return Math.max(0, Math.min(1, outBlack / 255 + t * (outWhite - outBlack) / 255)).toFixed(4);
  }).join(" ");
}

export default function CameraFeed({ periodKey, clockDisplay, clockFontSize = "md" }) {
  const videoRef         = useRef(null);
  const freezeCanvasRef  = useRef(null);
  const histSampleRef    = useRef(null);
  const histDisplayRef   = useRef(null);
  const levelsPanelRef   = useRef(null);
  const levelsBtnRef     = useRef(null);
  const streamRef        = useRef(null);
  const cameraContentRef = useRef(null);

  const [active,       setActive]       = useState(false);
  const [frozen,       setFrozen]       = useState(false);
  const [error,        setError]        = useState(null);
  const [mirrored,     setMirrored]     = useState(() => loadSettings().mirrored);
  const [flippedV,     setFlippedV]     = useState(() => loadSettings().flippedV);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showClock,    setShowClock]    = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [ignoreCh,     setIgnoreCh]     = useState({ r: false, g: false, b: false });
  const [grayMode,     setGrayMode]     = useState(null); // null | "gray" | "bw"
  const [negative,     setNegative]     = useState(false);
  const [levels,       setLevels]       = useState(DEFAULT_LEVELS);
  const [showLevels,   setShowLevels]   = useState(false);
  const [histogram,    setHistogram]    = useState(null);

  const toggleCh   = (ch)   => setIgnoreCh(prev => ({ ...prev, [ch]: !prev[ch] }));
  const toggleGray = (mode) => setGrayMode(m => m === mode ? null : mode);

  const channelMatrix = [
    ignoreCh.r ? 0 : 1, 0, 0, 0, 0,
    0, ignoreCh.g ? 0 : 1, 0, 0, 0,
    0, 0, ignoreCh.b ? 0 : 1, 0, 0,
    0, 0, 0, 1, 0,
  ].join(" ");
  const hasChannelFilter = ignoreCh.r || ignoreCh.g || ignoreCh.b;
  const hasLevels = levels.inBlack !== 0 || levels.inWhite !== 255 || levels.gamma !== 1
    || levels.outBlack !== 0 || levels.outWhite !== 255;
  const hasSvgFilter = hasChannelFilter || hasLevels;
  const levelsTable = hasLevels
    ? computeLevelsTable(levels.inBlack, levels.inWhite, levels.gamma, levels.outBlack, levels.outWhite)
    : null;

  const videoFilter = [
    hasSvgFilter ? "url(#cam-main-filter)" : "",
    grayMode ? "grayscale(1)" : "",
    grayMode === "bw" ? "contrast(1000%)" : "",
    negative ? "invert(1)" : "",
  ].filter(Boolean).join(" ") || undefined;

  // Fullscreen tracking
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Persist flip settings globally
  useEffect(() => {
    saveSettings({ mirrored, flippedV });
  }, [mirrored, flippedV]);

  // Auto-start camera on mount
  useEffect(() => { startCamera(); }, []); // eslint-disable-line

  // Close levels panel on outside click
  useEffect(() => {
    if (!showLevels) return;
    const handler = (e) => {
      if (levelsPanelRef.current?.contains(e.target) || levelsBtnRef.current?.contains(e.target)) return;
      setShowLevels(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showLevels]);

  // Histogram sampling — runs while levels panel is open
  useEffect(() => {
    if (!showLevels) return;
    const sample = () => {
      const canvas = histSampleRef.current;
      const video  = videoRef.current;
      if (!canvas || !video || video.readyState < 2) return;
      const w = Math.min(video.videoWidth  || 320, 320);
      const h = Math.min(video.videoHeight || 180, 180);
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const hist = new Array(256).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        hist[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++;
      }
      setHistogram(hist);
    };
    sample();
    const id = setInterval(sample, 500);
    return () => clearInterval(id);
  }, [showLevels, active, frozen]);

  // Draw histogram on display canvas
  useEffect(() => {
    const canvas = histDisplayRef.current;
    if (!canvas || !histogram) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const peak = Math.max(...histogram.slice(1, 255));
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 256; i++) {
      const barH = peak > 0 ? (Math.log1p(histogram[i]) / Math.log1p(peak)) * h : 0;
      const x = Math.round((i / 255) * w);
      ctx.fillRect(x, h - barH, Math.max(1, Math.ceil(w / 256)), barH);
    }
    // Input range markers
    ctx.strokeStyle = "rgba(255,200,0,0.8)";
    ctx.lineWidth = 1;
    const bx = Math.round((levels.inBlack / 255) * w);
    const wx = Math.round((levels.inWhite / 255) * w);
    ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx, 0); ctx.lineTo(wx, h); ctx.stroke();
  }, [histogram, levels.inBlack, levels.inWhite]);

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

        {hasSvgFilter && (
          <svg style={{ display: "none" }}>
            <defs>
              <filter id="cam-main-filter" colorInterpolationFilters="sRGB">
                {hasLevels && (
                  <feComponentTransfer>
                    <feFuncR type="table" tableValues={levelsTable} />
                    <feFuncG type="table" tableValues={levelsTable} />
                    <feFuncB type="table" tableValues={levelsTable} />
                  </feComponentTransfer>
                )}
                {hasChannelFilter && (
                  <feColorMatrix type="matrix" values={channelMatrix} />
                )}
              </filter>
            </defs>
          </svg>
        )}

        <canvas ref={histSampleRef} style={{ display: "none" }} />

        <video
          ref={videoRef}
          className="camera-video"
          style={{ transform: flipTransform, filter: videoFilter, display: active && !frozen ? "block" : "none" }}
          autoPlay playsInline muted
        />

        <canvas
          ref={freezeCanvasRef}
          className="camera-video freeze-canvas"
          style={{ filter: videoFilter, display: frozen ? "block" : "none" }}
        />

        {!active && !error && (
          <div className="camera-placeholder">
            <span onClick={e => { e.stopPropagation(); startCamera(); }} title="Start camera">📷</span>
          </div>
        )}

        {frozen && <div className="freeze-badge">FROZEN</div>}

        <button
          className="camera-fullscreen-btn"
          onClick={e => { e.stopPropagation(); toggleFullscreen(); }}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >{isFullscreen ? "⊡" : "⛶"}</button>

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

      {/* Levels panel — flex sibling, slides in between video and sidebar */}
      {showLevels && (
        <div className="levels-panel" ref={levelsPanelRef} onClick={e => e.stopPropagation()}>
          <div className="levels-header">
            <span className="levels-title">Levels</span>
            <button className="levels-reset" onClick={() => setLevels(DEFAULT_LEVELS)} title="Reset">↺</button>
          </div>
          <canvas ref={histDisplayRef} className="levels-histogram" width={180} height={60} />
          <div className="levels-section">
            <div className="levels-label">Input</div>
            <div className="levels-row">
              <span className="levels-val">{levels.inBlack}</span>
              <input type="range" min={0} max={254} value={levels.inBlack}
                onChange={e => setLevels(l => ({ ...l, inBlack: Math.min(+e.target.value, l.inWhite - 1) }))} />
            </div>
            <div className="levels-row">
              <span className="levels-val">{levels.gamma.toFixed(2)}</span>
              <input type="range" min={25} max={400} value={Math.round(levels.gamma * 100)}
                onChange={e => setLevels(l => ({ ...l, gamma: +e.target.value / 100 }))} />
            </div>
            <div className="levels-row">
              <span className="levels-val">{levels.inWhite}</span>
              <input type="range" min={1} max={255} value={levels.inWhite}
                onChange={e => setLevels(l => ({ ...l, inWhite: Math.max(+e.target.value, l.inBlack + 1) }))} />
            </div>
          </div>
          <div className="levels-section">
            <div className="levels-label">Output</div>
            <div className="levels-row">
              <span className="levels-val">{levels.outBlack}</span>
              <input type="range" min={0} max={254} value={levels.outBlack}
                onChange={e => setLevels(l => ({ ...l, outBlack: Math.min(+e.target.value, l.outWhite - 1) }))} />
            </div>
            <div className="levels-row">
              <span className="levels-val">{levels.outWhite}</span>
              <input type="range" min={1} max={255} value={levels.outWhite}
                onChange={e => setLevels(l => ({ ...l, outWhite: Math.max(+e.target.value, l.outBlack + 1) }))} />
            </div>
          </div>
        </div>
      )}

      <div className={`camera-sidebar${showControls ? "" : " camera-sidebar--hidden"}`}>
        <div className="sidebar-label">Cam</div>

        <button
          className="sidebar-btn"
          onClick={() => {
            setIgnoreCh({ r: false, g: false, b: false });
            setGrayMode(null);
            setLevels(DEFAULT_LEVELS);
            setShowLevels(false);
          }}
          title="Reset all filters"
        >↺</button>

        <div className="sidebar-divider" />

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

        <div className="sidebar-divider" />

        <button
          ref={levelsBtnRef}
          className={`sidebar-btn ${showLevels ? "sidebar-btn-active" : ""} ${hasLevels ? "sidebar-btn-levels-on" : ""}`}
          onClick={e => { e.stopPropagation(); setShowLevels(v => !v); }}
          title="Levels editor"
        >▤</button>

        <div className="camera-channel-btns">
          {/* Negative — half-inverted circle */}
          <button
            className={`camera-ch-btn camera-ch-btn--neg ${negative ? "camera-ch-btn--neg-on" : ""}`}
            onClick={() => setNegative(v => !v)}
            title="Negative"
          />
          {/* B&W — half-black/half-white circle */}
          <button
            className={`camera-ch-btn camera-ch-btn--bw ${grayMode === "bw" ? "camera-ch-btn--bw-on" : ""}`}
            onClick={() => toggleGray("bw")}
            title="Black & white"
          />
          {/* Grayscale — light gray circle */}
          <button
            className={`camera-ch-btn ${grayMode !== "gray" ? "camera-ch-btn--off" : ""}`}
            style={{ "--ch-color": "#d4d4d4" }}
            onClick={() => toggleGray("gray")}
            title="Grayscale"
          />
          {[
            { ch: "r", color: "#f87171", label: "R" },
            { ch: "g", color: "#4ade80", label: "G" },
            { ch: "b", color: "#60a5fa", label: "B" },
          ].map(({ ch, color, label }) => (
            <button
              key={ch}
              className={`camera-ch-btn ${ignoreCh[ch] ? "camera-ch-btn--off" : ""}`}
              style={{ "--ch-color": color }}
              onClick={() => toggleCh(ch)}
              title={`${ignoreCh[ch] ? "Restore" : "Ignore"} ${label} channel`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
