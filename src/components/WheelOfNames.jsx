import { useState, useRef, useEffect, useCallback } from "react";
import "./WheelOfNames.css";

const COLORS = [
  "#e94560", "#0f3460", "#533483", "#1a7431",
  "#b5451b", "#1a5276", "#76448a", "#1e8bc3",
  "#27ae60", "#e67e22", "#c0392b", "#2980b9",
];

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function WheelOfNames({ names, onNamesChange, periodLabel, collapsed, onToggle }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const rotationRef = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");

  // Reset winner when period (names list identity) changes
  useEffect(() => {
    setWinner(null);
  }, [names]);

  const drawWheel = useCallback((rotation) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(cx, cy) - 8;
    const n = names.length;

    ctx.clearRect(0, 0, W, H);

    if (n === 0) {
      ctx.fillStyle = "#777";
      ctx.font = "14px Segoe UI";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(periodLabel ? `No students for ${periodLabel}` : "Add names to spin", cx, cy);
      return;
    }

    const segAngle = (2 * Math.PI) / n;

    for (let i = 0; i < n; i++) {
      const startAngle = rotation + i * segAngle - Math.PI / 2;
      const endAngle = startAngle + segAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const textAngle = startAngle + segAngle / 2;
      // Radial text: rotate along the spoke.
      // Flip segments in the left half so text never appears upside-down.
      const flipped = Math.cos(textAngle) < 0;
      const textRotation = flipped ? textAngle + Math.PI : textAngle;
      // Center text halfway along the usable radius
      const textRadius = radius * (flipped ? 0.55 : 0.55);

      ctx.save();
      ctx.translate(cx + textRadius * Math.cos(textAngle), cy + textRadius * Math.sin(textAngle));
      ctx.rotate(textRotation);

      const name = names[i];
      // Max width = most of the radial extent (center hub to near rim)
      const maxWidth = radius * 0.72;
      const fontSize = Math.min(15, Math.max(8, maxWidth / (name.length * 0.62)));
      ctx.font = `bold ${fontSize}px Segoe UI`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 3;
      ctx.fillText(name, 0, 0, maxWidth);
      ctx.restore();
    }

    // Center hub
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pointer triangle at top
    const py = cy - radius - 4;
    ctx.beginPath();
    ctx.moveTo(cx, py + 2);
    ctx.lineTo(cx - 12, py - 18);
    ctx.lineTo(cx + 12, py - 18);
    ctx.closePath();
    ctx.fillStyle = "#facc15";
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [names, periodLabel]);

  useEffect(() => {
    drawWheel(rotationRef.current);
  }, [drawWheel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      const size = Math.min(parent.clientWidth, parent.clientHeight);
      canvas.width = size;
      canvas.height = size;
      drawWheel(rotationRef.current);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [drawWheel]);

  const spin = useCallback(() => {
    if (spinning || names.length < 2) return;
    setSpinning(true);
    setWinner(null);

    const startRotation = rotationRef.current;
    const extraTurns = 3 + Math.random() * 2;
    const extraAngle = Math.random() * 2 * Math.PI;
    const totalSpin = extraTurns * 2 * Math.PI + extraAngle;
    const endRotation = startRotation + totalSpin;
    const duration = 1000;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const currentRotation = startRotation + totalSpin * easeOut(progress);
      rotationRef.current = currentRotation;
      drawWheel(currentRotation);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        rotationRef.current = endRotation;
        setSpinning(false);
        const n = names.length;
        const segAngle = (2 * Math.PI) / n;
        const normalized = ((-(endRotation % (2 * Math.PI))) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        setWinner(names[Math.floor(normalized / segAngle) % n]);
      }
    };

    animRef.current = requestAnimationFrame(animate);
  }, [spinning, names, drawWheel]);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const openEditor = () => {
    setEditText(names.join("\n"));
    setEditOpen(true);
  };

  const handleEditChange = (text) => {
    setEditText(text);
    // Auto-save: parse and persist on every keystroke (empty lines ignored)
    const newNames = text.split("\n").map(s => s.trim()).filter(Boolean);
    onNamesChange(newNames);
  };

  const canSpin = !spinning && names.length >= 2;

  return (
    <div className={`card wheel-card ${collapsed ? "card--collapsed" : ""}`}>
      <div className="card-header">
        <span className="header-toggle" onClick={onToggle}>
          <span className="header-chevron">{collapsed ? "▶" : "▼"}</span>
          {periodLabel ? `Names — ${periodLabel}` : "Wheel of Names"}
        </span>
        {!collapsed && <button className="btn btn-ghost btn-sm" onClick={openEditor}>Edit Names</button>}
      </div>
      <div className="card-body wheel-body">
        <div className="canvas-container">
          <canvas
            ref={canvasRef}
            className={`wheel-canvas ${canSpin ? "wheel-clickable" : ""}`}
            onClick={spin}
            title={names.length < 2 ? "Add at least 2 names" : "Click to spin!"}
          />
        </div>
        {winner && (
          <div className="wheel-winner">
            🎉 <strong>{winner}</strong>
          </div>
        )}
      </div>

      {editOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditOpen(false)}>
          <div className="modal">
            <h2>Students{periodLabel ? ` — ${periodLabel}` : ""}</h2>
            <p style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: 10 }}>
              One name per line
            </p>
            <textarea
              style={{ width: "100%", height: 260, resize: "vertical", fontSize: "0.9rem" }}
              value={editText}
              onChange={e => handleEditChange(e.target.value)}
              autoFocus
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn btn-primary" onClick={() => setEditOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
