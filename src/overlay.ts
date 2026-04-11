// src/overlay.ts
// Canvas 2D overlay posicionado encima del canvas WebGL de Butterchurn.
// Dibuja efectos visuales reactivos a los beats: flashes, partículas, ondas, glitch, bordes.

type EffectType = 'flash' | 'particles' | 'ripple' | 'glitch' | 'border';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  color: string;
  size: number;
}

interface OverlayEffect {
  type: EffectType;
  startTime: number;
  duration: number;
  data: {
    color?: string;
    particles?: Particle[];
    cx?: number; cy?: number; maxRadius?: number;
    strips?: Array<{ y: number; h: number; shift: number; color: string }>;
  };
}

const NEON_COLORS = ['#00ff99', '#ff00cc', '#00ffff', '#ffff00', '#ff6600'];

export function createOverlay(overlayCanvas: HTMLCanvasElement) {
  const ctx = overlayCanvas.getContext('2d')!;
  const effects: OverlayEffect[] = [];

  // ── Sincronizar el buffer del canvas con el visualizador ──────────────────
  function syncSize(vizCanvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    overlayCanvas.width  = Math.round(vizCanvas.clientWidth  * dpr);
    overlayCanvas.height = Math.round(vizCanvas.clientHeight * dpr);
  }

  // ── Disparadores de efectos ───────────────────────────────────────────────

  function triggerFlash(color = '#ffffff', durationMs = 200) {
    effects.push({
      type: 'flash',
      startTime: performance.now(),
      duration: durationMs,
      data: { color }
    });
  }

  function triggerParticles(count = 30) {
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x:  Math.random() * overlayCanvas.width,
      y:  Math.random() * overlayCanvas.height,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.5) * 14,
      color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)],
      size: 2 + Math.random() * 5,
    }));
    effects.push({
      type: 'particles',
      startTime: performance.now(),
      duration: 850,
      data: { particles }
    });
  }

  function triggerRipple() {
    const maxR = Math.max(overlayCanvas.width, overlayCanvas.height) * 0.65;
    effects.push({
      type: 'ripple',
      startTime: performance.now(),
      duration: 650,
      data: {
        cx: overlayCanvas.width  / 2,
        cy: overlayCanvas.height / 2,
        maxRadius: maxR
      }
    });
  }

  function triggerGlitch(strips = 8) {
    const stripData = Array.from({ length: strips }, () => ({
      y:     Math.random() * overlayCanvas.height,
      h:     4 + Math.random() * 22,
      shift: (Math.random() - 0.5) * 50,
      color: NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)]
    }));
    effects.push({
      type: 'glitch',
      startTime: performance.now(),
      duration: 130,
      data: { strips: stripData }
    });
  }

  function triggerBorderStrobe(color = '#00ff99') {
    effects.push({
      type: 'border',
      startTime: performance.now(),
      duration: 90,
      data: { color }
    });
  }

  // ── Render — llamar cada requestAnimationFrame ────────────────────────────
  function render() {
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;
    const now = performance.now();

    ctx.clearRect(0, 0, w, h);

    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i];
      const elapsed = now - fx.startTime;
      const t = Math.min(elapsed / fx.duration, 1); // 0..1

      if (t >= 1) {
        effects.splice(i, 1);
        continue;
      }

      ctx.save();

      switch (fx.type) {

        case 'flash': {
          ctx.globalCompositeOperation = 'screen';
          ctx.globalAlpha = (1 - t) * 0.55;
          ctx.fillStyle = fx.data.color!;
          ctx.fillRect(0, 0, w, h);
          break;
        }

        case 'particles': {
          ctx.globalCompositeOperation = 'screen';
          for (const p of fx.data.particles!) {
            // Avanzar posición (se llama ~60fps, delta ≈ 16ms)
            p.x  += p.vx;
            p.y  += p.vy;
            p.vy += 0.35; // gravedad leve
            ctx.globalAlpha = (1 - t) * 0.85;
            ctx.fillStyle   = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }

        case 'ripple': {
          const { cx, cy, maxRadius } = fx.data as { cx: number; cy: number; maxRadius: number };
          ctx.globalAlpha = (1 - t) * 0.85;
          ctx.strokeStyle = '#00ff99';
          ctx.lineWidth   = 3 * (1 - t) + 1;

          // Onda principal
          ctx.beginPath();
          ctx.arc(cx, cy, maxRadius * t, 0, Math.PI * 2);
          ctx.stroke();

          // Segunda onda (ligeramente detrás)
          if (t > 0.12) {
            ctx.globalAlpha = (1 - t) * 0.35;
            ctx.beginPath();
            ctx.arc(cx, cy, maxRadius * (t - 0.12), 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
        }

        case 'glitch': {
          ctx.globalCompositeOperation = 'screen';
          for (const strip of fx.data.strips!) {
            ctx.globalAlpha = (1 - t) * 0.45;
            ctx.fillStyle   = strip.color;
            ctx.fillRect(strip.shift, strip.y, w + Math.abs(strip.shift), strip.h);
          }
          break;
        }

        case 'border': {
          ctx.globalAlpha  = (1 - t) * 0.9;
          ctx.strokeStyle  = fx.data.color!;
          ctx.lineWidth    = 8;
          ctx.shadowColor  = fx.data.color!;
          ctx.shadowBlur   = 20;
          ctx.strokeRect(4, 4, w - 8, h - 8);
          break;
        }
      }

      ctx.restore();
    }
  }

  return {
    render,
    syncSize,
    triggerFlash,
    triggerParticles,
    triggerRipple,
    triggerGlitch,
    triggerBorderStrobe,
  };
}
