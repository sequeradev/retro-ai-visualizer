import { createIcons, icons } from 'lucide';
import { createVisualizer } from './visualizer';
import { getSystemAudioStream } from './captureAudio';
import { createBeatDetector, type BeatCallbacks } from './beatDetector';
import { createOverlay } from './overlay';
import './styles/retro.css';

// Inicializar iconos Lucide
createIcons({ icons });

// ── DOM ───────────────────────────────────────────────────────────────────────
const loadBtn       = document.getElementById('loadBtn')       as HTMLButtonElement;
const fileInput     = document.getElementById('fileInput')     as HTMLInputElement;
const queueBtn      = document.getElementById('queueBtn')      as HTMLButtonElement;
const prevBtn       = document.getElementById('prevBtn')       as HTMLButtonElement;
const playBtn       = document.getElementById('playBtn')       as HTMLButtonElement;
const nextBtn       = document.getElementById('nextBtn')       as HTMLButtonElement;
const micBtn        = document.getElementById('micBtn')        as HTMLButtonElement;
const pageFSBtn     = document.getElementById('pageFSBtn')     as HTMLButtonElement;
const canvas        = document.getElementById('visualizer')    as HTMLCanvasElement;
const overlayCanvas = document.getElementById('overlay')       as HTMLCanvasElement;
const volumeSlider  = document.getElementById('volumeSlider')  as HTMLInputElement;
const trackNameEl   = document.getElementById('trackName')     as HTMLDivElement;
const presetToastEl = document.getElementById('presetToast')   as HTMLDivElement;

// Modal cola
const queueModal    = document.getElementById('queueModal')    as HTMLDivElement;
const queueList     = document.getElementById('queueList')     as HTMLUListElement;
const closeQueueBtn = document.getElementById('closeQueueBtn') as HTMLButtonElement;

// ── Audio setup ───────────────────────────────────────────────────────────────
const audioEl = new Audio();
audioEl.crossOrigin = 'anonymous';
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
let srcNode:  MediaElementAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let viz:  ReturnType<typeof createVisualizer>  | null = null;
let beat: ReturnType<typeof createBeatDetector> | null = null;
let overlay: ReturnType<typeof createOverlay>   | null = null;
let mainRaf = 0;

// ── Cola de archivos ──────────────────────────────────────────────────────────
let audioQueue: File[] = [];
let currentTrackIdx = 0;

// ── Preset toast ──────────────────────────────────────────────────────────────
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showPresetToast(name: string) {
  presetToastEl.textContent = name;
  presetToastEl.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => presetToastEl.classList.remove('visible'), 2500);
}

// ── Nombre de pista ───────────────────────────────────────────────────────────
function updateTrackName() {
  if (!audioQueue.length) { trackNameEl.textContent = ''; trackNameEl.classList.remove('scrolling'); return; }
  const name = audioQueue[currentTrackIdx].name.replace(/\.[^.]+$/, '');
  trackNameEl.textContent = name;
  trackNameEl.classList.toggle('scrolling', name.length > 30);
}

// ── Icono play/pausa ──────────────────────────────────────────────────────────
function setPlayPauseIcon(isPlaying: boolean) {
  playBtn.innerHTML = `<i data-lucide="${isPlaying ? 'pause' : 'play'}"></i>`;
  createIcons({ icons });
}
setPlayPauseIcon(false);

// ── Callbacks de beat — referencia nombrada para reutilizar en modo mic ───────
function makeBeatCallbacks(): BeatCallbacks {
  return {
    onKickBeat: (energy) => {
      overlay?.triggerParticles(20 + Math.round(energy * 50));
      overlay?.triggerFlash('#ffffff', 180);
    },
    onBassBeat: () => {
      overlay?.triggerRipple();
      overlay?.triggerBorderStrobe('#00ff99');
    },
    onMidBeat: () => {
      overlay?.triggerBorderStrobe('#ff00cc');
    },
    onTrebleBeat: () => {
      if (Math.random() < 0.3) overlay?.triggerGlitch();
    },
    onEnergyPeak: () => {
      viz?.loadRandomPresetInstant();
      overlay?.triggerFlash('#ff00cc', 320);
    },
  };
}

// ── Bucle principal de overlay + beat detector ────────────────────────────────
function startMainLoop() {
  if (mainRaf) cancelAnimationFrame(mainRaf);
  function loop() {
    beat?.tick();
    overlay?.render();
    mainRaf = requestAnimationFrame(loop);
  }
  mainRaf = requestAnimationFrame(loop);
}

// ── Inicializar pipeline de audio y visual (solo la primera vez con archivo) ──
function initAudioAndVisualizer() {
  if (!analyser) {
    analyser = audioCtx.createAnalyser();
    analyser.smoothingTimeConstant = 0.75;

    srcNode = audioCtx.createMediaElementSource(audioEl);
    srcNode.connect(audioCtx.destination);
    srcNode.connect(analyser);

    overlay = createOverlay(overlayCanvas);
    overlay.syncSize(canvas);

    beat = createBeatDetector(analyser, makeBeatCallbacks());

    viz = createVisualizer(canvas, analyser, { onPresetChange: showPresetToast });
    viz.start();

    startMainLoop();
  }
}

// ── Carga de archivos ─────────────────────────────────────────────────────────
loadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  if (!fileInput.files?.length) return;
  audioQueue = Array.from(fileInput.files);
  currentTrackIdx = 0;
  await playCurrentTrack();
  updateQueueModal();
});

async function playCurrentTrack(loadNewPreset = true) {
  if (!audioQueue.length) return;
  const file = audioQueue[currentTrackIdx];
  audioEl.src = URL.createObjectURL(file);

  const vizYaExistia = !!viz;
  if (!viz) {
    await audioCtx.resume();
    initAudioAndVisualizer(); // ya carga preset instantáneo en start()
  }
  await audioEl.play();

  // Solo cambiar preset si el visualizador ya existía (evita doble carga en primer track)
  if (viz && loadNewPreset && vizYaExistia) viz.loadRandomPreset();
  updateTrackName();
  updateQueueModal();
}

// ── Captura de micro / audio sistema ─────────────────────────────────────────
micBtn.addEventListener('click', async () => {
  try {
    // Limpiar pipeline anterior
    if (mainRaf) { cancelAnimationFrame(mainRaf); mainRaf = 0; }
    if (viz)     { viz.destroy(); viz = null; }
    if (srcNode) { try { srcNode.disconnect(); } catch {} srcNode = null; }
    if (analyser){ try { analyser.disconnect(); } catch {} analyser = null; }

    const stream = await getSystemAudioStream();
    analyser = audioCtx.createAnalyser();
    analyser.smoothingTimeConstant = 0.75;

    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);

    overlay = createOverlay(overlayCanvas);
    overlay.syncSize(canvas);

    beat = createBeatDetector(analyser, makeBeatCallbacks());

    viz = createVisualizer(canvas, analyser, { onPresetChange: showPresetToast });
    viz.start();

    startMainLoop();

    micBtn.classList.add('active');
    audioQueue = [];
    currentTrackIdx = 0;
    updateQueueModal();
    updateTrackName();
  } catch (err: any) {
    if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return; // usuario canceló
    alert('⚠️ Para capturar el audio del sistema:\n1. Se abrirá un diálogo del navegador\n2. Selecciona una ventana o pantalla\n3. Activa la casilla "Compartir audio del sistema"\n\nSi no ves esa casilla, prueba con Chrome o Edge.');
  }
});

// ── Eventos de estado play/pause ──────────────────────────────────────────────
audioEl.addEventListener('play',  () => {
  playBtn.classList.add('active');
  setPlayPauseIcon(true);
});
audioEl.addEventListener('pause', () => {
  playBtn.classList.remove('active');
  micBtn.classList.remove('active');
  setPlayPauseIcon(false);
});

// ── Controles Prev / Play / Next ──────────────────────────────────────────────
playBtn.addEventListener('click', () => audioEl.paused ? audioEl.play() : audioEl.pause());

prevBtn.addEventListener('click', async () => {
  if (audioQueue.length > 0) {
    if (currentTrackIdx > 0) currentTrackIdx--;
    else currentTrackIdx = audioQueue.length - 1;
    await playCurrentTrack(true);
  }
});

nextBtn.addEventListener('click', async () => {
  if (audioQueue.length > 0) {
    if (currentTrackIdx < audioQueue.length - 1) currentTrackIdx++;
    else currentTrackIdx = 0;
    await playCurrentTrack(true);
  }
});

audioEl.addEventListener('ended', async () => {
  if (audioQueue.length > 0) {
    if (currentTrackIdx < audioQueue.length - 1) currentTrackIdx++;
    else currentTrackIdx = 0;
    await playCurrentTrack(true);
  }
});

// ── Volumen ───────────────────────────────────────────────────────────────────
volumeSlider.addEventListener('input', () => {
  audioEl.volume = parseFloat(volumeSlider.value);
});

// ── Atajos de teclado ─────────────────────────────────────────────────────────
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement) return;
  switch (e.code) {
    case 'Space':      e.preventDefault(); audioEl.paused ? audioEl.play() : audioEl.pause(); break;
    case 'ArrowLeft':  prevBtn.click(); break;
    case 'ArrowRight': nextBtn.click(); break;
    case 'KeyF':       pageFSBtn.click(); break;
    case 'KeyM':       micBtn.click(); break;
  }
});

// ── Modal Cola ────────────────────────────────────────────────────────────────
queueBtn.addEventListener('click', () => {
  if (audioQueue.length === 0) { alert('No hay canciones en la cola.'); return; }
  updateQueueModal();
  queueModal.hidden = false;
});

closeQueueBtn.addEventListener('click', () => { queueModal.hidden = true; });

function updateQueueModal() {
  if (!queueList) return;
  queueList.innerHTML = '';
  audioQueue.forEach((file, idx) => {
    const li = document.createElement('li');
    li.textContent = file.name;
    if (idx === currentTrackIdx) li.className = 'current';
    queueList.appendChild(li);
  });
}

// ── Pantalla completa CANVAS ──────────────────────────────────────────────────
canvas.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen();
  } else if (document.fullscreenElement === canvas) {
    document.exitFullscreen();
  }
});

// ── Pantalla completa PÁGINA WEB ──────────────────────────────────────────────
pageFSBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

// ── Helpers de resize para fullscreen ────────────────────────────────────────
const origCanvasStyle = {
  width:    canvas.style.width,
  height:   canvas.style.height,
  position: canvas.style.position,
  top:      canvas.style.top,
  left:     canvas.style.left,
  border:   canvas.style.border,
  zIndex:   canvas.style.zIndex
};

function resizeCanvasToFullscreen() {
  canvas.style.position = 'fixed';
  canvas.style.top      = '0';
  canvas.style.left     = '0';
  canvas.style.width    = '100vw';
  canvas.style.height   = '100vh';
  canvas.style.border   = 'none';
  canvas.style.zIndex   = '9999';
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(window.innerWidth  * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  overlay?.syncSize(canvas);
}

function restoreCanvasSize() {
  canvas.style.width    = origCanvasStyle.width;
  canvas.style.height   = origCanvasStyle.height;
  canvas.style.position = origCanvasStyle.position;
  canvas.style.top      = origCanvasStyle.top;
  canvas.style.left     = origCanvasStyle.left;
  canvas.style.border   = origCanvasStyle.border;
  canvas.style.zIndex   = origCanvasStyle.zIndex;
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  overlay?.syncSize(canvas);
}

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement === canvas) {
    resizeCanvasToFullscreen();
  } else {
    restoreCanvasSize();
  }
});

window.addEventListener('resize', () => {
  if (document.fullscreenElement === canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(window.innerWidth  * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }
  overlay?.syncSize(canvas);
});
