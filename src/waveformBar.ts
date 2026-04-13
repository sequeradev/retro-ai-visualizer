// src/waveformBar.ts
// Barra de ondas retro verde que muestra las frecuencias del audio en tiempo real.

export function createWaveformBar(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode
) {
  const ctx = canvas.getContext('2d')!;
  const barCount = 64;

  // Buffer para datos de frecuencia
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  // Valores suavizados para cada barra
  const smoothed = new Float32Array(barCount);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);

  function render() {
    analyser.getByteFrequencyData(freqData);

    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;

    ctx.clearRect(0, 0, w, h);

    // Map frequency bins to bars (logarithmic-ish distribution for bass emphasis)
    const binCount = analyser.frequencyBinCount;
    const gap = 2;
    const barW = (w - gap * (barCount - 1)) / barCount;

    for (let i = 0; i < barCount; i++) {
      // Logarithmic mapping: more bins for low frequencies
      const t = i / barCount;
      const binStart = Math.floor(Math.pow(t, 1.8) * binCount * 0.6);
      const binEnd = Math.floor(Math.pow((i + 1) / barCount, 1.8) * binCount * 0.6);
      const count = Math.max(1, binEnd - binStart);

      let sum = 0;
      for (let b = binStart; b < binStart + count && b < binCount; b++) {
        sum += freqData[b] / 255;
      }
      const raw = sum / count;

      // Smooth with fast attack, slow decay
      if (raw > smoothed[i]) {
        smoothed[i] += (raw - smoothed[i]) * 0.6;
      } else {
        smoothed[i] += (raw - smoothed[i]) * 0.15;
      }

      const val = smoothed[i];
      const barH = val * h * 0.9;
      const x = i * (barW + gap);
      const y = (h - barH) / 2; // centered vertically

      // Gradient from dark green to bright green based on intensity
      const brightness = Math.floor(80 + val * 175);
      const glow = Math.floor(val * 255);
      ctx.fillStyle = `rgb(0, ${brightness}, ${Math.floor(val * 60)})`;
      ctx.shadowColor = `rgba(0, ${glow}, ${Math.floor(glow * 0.4)}, ${0.3 + val * 0.7})`;
      ctx.shadowBlur = 4 + val * 10;

      // Draw symmetric bar (mirrored top/bottom from center)
      ctx.fillRect(x, y, barW, barH);
    }

    // Reset shadow for next frame
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Scanline overlay for retro feel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let sy = 0; sy < h; sy += 3) {
      ctx.fillRect(0, sy, w, 1);
    }
  }

  function destroy() {
    window.removeEventListener('resize', resize);
  }

  return { render, resize, destroy };
}
