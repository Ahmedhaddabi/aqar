"use client";

import { useEffect, useRef, useState } from "react";

/** Draw with a finger or mouse; the drawing goes into the form as a PNG (hidden "signature" field). */
export function SignaturePad({ clearLabel, hint }: { clearLabel: string; hint: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#102f4c";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(...point(e));
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    ctx.lineTo(...point(e));
    ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    field.current!.value = canvas.current!.toDataURL("image/png");
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    field.current!.value = "";
    setEmpty(true);
  };
  return (
    <div className="sig">
      <canvas ref={canvas} className="sig-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        aria-label={hint} role="img" />
      <input ref={field} type="hidden" name="signature" />
      <div className="a-inline"><span className="a-muted">{empty ? hint : "✓"}</span>
        <button type="button" className="a-btn small" onClick={clear}>{clearLabel}</button></div>
    </div>
  );
}
