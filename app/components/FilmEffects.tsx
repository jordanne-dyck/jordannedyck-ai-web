'use client';

import { useEffect, useRef } from 'react';

// The home page's film look: lens blur at the edges, vignette, crawling grain,
// and dust and scratches. All decorative; styles live in app/home.css.
export function FilmEffects({ paused }: { paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
    const c = canvasRef.current;
    if (paused && c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
  }, [paused]);

  // Dust and scratches, redrawn about 11 times a second like projected film.
  // Nothing is drawn for visitors who ask for reduced motion.
  useEffect(() => {
    const canvas = canvasRef.current;
    const dc = canvas?.getContext('2d');
    if (!canvas || !dc || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const size = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    size();
    addEventListener('resize', size);

    let frame = 0, last = 0, scratchX = Math.random() * innerWidth, scratchLife = 0;
    const draw = (t: number) => {
      frame = requestAnimationFrame(draw);
      if (pausedRef.current || t - last < 90) return;
      last = t;
      const W = canvas.width, H = canvas.height;
      dc.clearRect(0, 0, W, H);
      const specks = 4 + Math.random() * 9;
      for (let i = 0; i < specks; i++) {
        const r = Math.random() * 1.7 + .3;
        dc.fillStyle = Math.random() < .55 ? 'rgba(255,246,230,.55)' : 'rgba(10,8,6,.5)';
        dc.beginPath();
        dc.ellipse(Math.random() * W, Math.random() * H, r, r * (.4 + Math.random()), Math.random() * 3, 0, 7);
        dc.fill();
      }
      if (Math.random() < .05) { // a stray hair
        const x = Math.random() * W, y = Math.random() * H;
        dc.strokeStyle = 'rgba(10,8,6,.35)';
        dc.lineWidth = .8;
        dc.beginPath();
        dc.moveTo(x, y);
        dc.quadraticCurveTo(x + 30 * (Math.random() - .5), y + 25, x + 40 * (Math.random() - .5), y + 50 * Math.random() + 10);
        dc.stroke();
      }
      if (scratchLife <= 0 && Math.random() < .02) { scratchX = Math.random() * W; scratchLife = 8 + Math.random() * 20; }
      if (scratchLife > 0) { // a vertical scratch that lingers and drifts
        scratchLife--;
        scratchX += (Math.random() - .5) * 3;
        dc.fillStyle = 'rgba(255,246,230,.13)';
        dc.fillRect(scratchX, 0, 1, H);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); removeEventListener('resize', size); };
  }, []);

  return (
    <>
      <div className="fx lens" aria-hidden="true" />
      <div className="fx vignette" aria-hidden="true" />
      <div className="fx grain" aria-hidden="true" />
      <canvas className="fx dust" ref={canvasRef} aria-hidden="true" />
    </>
  );
}
