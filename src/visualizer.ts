import Butterchurn from 'butterchurn';
import ButterchurnPresets from 'butterchurn-presets';

const PRESETS = ButterchurnPresets.getPresets();
const PRESET_NAMES = Object.keys(PRESETS);

export interface VisualizerOptions {
  onPresetChange?: (name: string) => void;
}

export function createVisualizer(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode,
  options?: VisualizerOptions
) {
  // Ajustar tamaño del canvas explícitamente
  canvas.width = canvas.clientWidth || 800;
  canvas.height = canvas.clientHeight || 600;

  const audioCtx = analyser.context as AudioContext;
  const viz = Butterchurn.createVisualizer(audioCtx, canvas, {
    width: canvas.width,
    height: canvas.height,
    pixelRatio: window.devicePixelRatio || 1
  });

  viz.connectAudio(analyser);

  function resize() {
    canvas.width = canvas.clientWidth || 800;
    canvas.height = canvas.clientHeight || 600;
    viz.setRendererSize(canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);

  let raf = 0;
  let paused = false;
  function loop() {
    if (!paused) viz.render();
    raf = requestAnimationFrame(loop);
  }

  let currentPresetName = '';
  let autoRotateTimer: ReturnType<typeof setTimeout> | null = null;
  const AUTO_ROTATE_MS = 45_000;

  function loadRandomPreset(blendTime = 2.5) {
    const name = PRESET_NAMES[Math.floor(Math.random() * PRESET_NAMES.length)];
    viz.loadPreset(PRESETS[name], blendTime);
    currentPresetName = name;
    options?.onPresetChange?.(name);
    console.log('🎛️ Preset cargado:', name);

    // Reiniciar temporizador de auto-rotación
    if (autoRotateTimer) clearTimeout(autoRotateTimer);
    autoRotateTimer = setTimeout(() => loadRandomPreset(), AUTO_ROTATE_MS);
  }

  function loadRandomPresetInstant() {
    loadRandomPreset(0.5);
  }

  return {
    start() {
      if (raf) cancelAnimationFrame(raf);
      loadRandomPreset(0); // Sin blend en la carga inicial — visual instantáneo
      loop();
    },
    setActive(active: boolean) { paused = !active; },
    loadRandomPreset,
    loadRandomPresetInstant,
    getCurrentPresetName() { return currentPresetName; },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      if (autoRotateTimer) clearTimeout(autoRotateTimer);
      viz.disconnectAudio();
      window.removeEventListener('resize', resize);
    }
  };
}
