import { createIcons, icons } from 'lucide';
import { createVisualizer } from './visualizer';
import { getSystemAudioStream } from './captureAudio';
import './styles/retro.css';

// Inicializar iconos Lucide con una clase consistente para estilado
const lucideAttrs = { class: 'lucide-icon' } as const;
const refreshIcons = () => createIcons({ icons, attrs: lucideAttrs });
refreshIcons();

// DOM
const loadBtn     = document.getElementById('loadBtn')      as HTMLButtonElement;
const fileInput   = document.getElementById('fileInput')    as HTMLInputElement;
const queueBtn    = document.getElementById('queueBtn')     as HTMLButtonElement;
const prevBtn     = document.getElementById('prevBtn')      as HTMLButtonElement;
const playBtn     = document.getElementById('playBtn')      as HTMLButtonElement;
const nextBtn     = document.getElementById('nextBtn')      as HTMLButtonElement;
const micBtn      = document.getElementById('micBtn')       as HTMLButtonElement;
const pageFSBtn   = document.getElementById('pageFSBtn')    as HTMLButtonElement;
const canvas      = document.getElementById('visualizer')   as HTMLCanvasElement;

// Modal cola
const queueModal  = document.getElementById('queueModal')   as HTMLDivElement;
const queueList   = document.getElementById('queueList')    as HTMLUListElement;
const closeQueueBtn = document.getElementById('closeQueueBtn') as HTMLButtonElement;

// Audio setup
const audioEl = new Audio();
audioEl.crossOrigin = 'anonymous';
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
let srcNode: MediaElementAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let viz: { loadRandomPreset(): void; start(): void; destroy(): void } | null = null;

// === GESTIÓN DE COLA DE ARCHIVOS ===
let audioQueue: File[] = [];
let currentTrackIdx = 0;

// === UTILIDAD PARA CAMBIO DE ICONO PLAY/PAUSE ===
function setPlayPauseIcon(isPlaying: boolean) {
  // Lucide icon names: "play", "pause"
  playBtn.innerHTML = `<i data-lucide="${isPlaying ? "pause" : "play"}"></i>`;
  refreshIcons(); // re-render icon
}

// Inicializa el pipeline de audio y visual solo UNA VEZ
function initAudioAndVisualizer() {
  if (!analyser) {
    analyser = audioCtx.createAnalyser();
    srcNode = audioCtx.createMediaElementSource(audioEl);
    srcNode.connect(audioCtx.destination);
    srcNode.connect(analyser);
    viz = createVisualizer(canvas, analyser);
    viz.start();
  }
}

// --- Carga de archivos ---
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

  // Solo inicializa el pipeline la PRIMERA VEZ
  if (!viz) {
    await audioCtx.resume();
    initAudioAndVisualizer();
  }
  await audioEl.play();

  // Carga preset nuevo si corresponde
  if (viz && loadNewPreset) {
    viz.loadRandomPreset();
  }
  updateQueueModal();
}

// --- Captura de micro/audio sistema ---
micBtn.addEventListener('click', async () => {
  try {
    if (viz) { viz.destroy(); viz = null; }
    if (srcNode) { try { srcNode.disconnect(); } catch {} srcNode = null; }
    if (analyser) { try { analyser.disconnect(); } catch {} analyser = null; }
    const stream = await getSystemAudioStream();
    analyser = audioCtx.createAnalyser();
    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);
    viz = createVisualizer(canvas, analyser);
    viz.start();
    micBtn.classList.add('active');
    audioQueue = [];
    currentTrackIdx = 0;
    updateQueueModal();
  } catch {
    alert('No se pudo acceder al audio del sistema. Verifica los permisos de la Matrix.');
  }
});

// --- Estados de play/mic + icono dinámico ---
audioEl.addEventListener('play',  () => {
  playBtn.classList.add('active');
  setPlayPauseIcon(true);
});
audioEl.addEventListener('pause', () => {
  playBtn.classList.remove('active');
  micBtn.classList.remove('active');
  setPlayPauseIcon(false);
});

// --- Arranque inicial icono ---
setPlayPauseIcon(false);

// --- Controles Prev / Play / Next ---
playBtn.addEventListener('click', () => audioEl.paused ? audioEl.play() : audioEl.pause());

prevBtn.addEventListener('click', async () => {
  if (audioQueue.length > 0) {
    if (currentTrackIdx > 0) currentTrackIdx--;
    else currentTrackIdx = audioQueue.length - 1;
    await playCurrentTrack(true); // Nuevo preset
  }
});

nextBtn.addEventListener('click', async () => {
  if (audioQueue.length > 0) {
    if (currentTrackIdx < audioQueue.length - 1) currentTrackIdx++;
    else currentTrackIdx = 0;
    await playCurrentTrack(true); // Nuevo preset
  }
});

// --- Paso automático al terminar una canción ---
audioEl.addEventListener('ended', async () => {
  if (audioQueue.length > 0) {
    if (currentTrackIdx < audioQueue.length - 1) currentTrackIdx++;
    else currentTrackIdx = 0;
    await playCurrentTrack(true); // Nuevo preset
  }
});

// --- Modal Cola ---
queueBtn.addEventListener('click', () => {
  if (audioQueue.length === 0) {
    alert('La cola de señales está vacía en este momento.');
    return;
  }
  updateQueueModal();
  queueModal.hidden = false;
});

closeQueueBtn.addEventListener('click', () => {
  queueModal.hidden = true;
});

function updateQueueModal() {
  if (!queueList) return;
  queueList.innerHTML = '';
  audioQueue.forEach((file, idx) => {
    const li = document.createElement('li');
    const indexSpan = document.createElement('span');
    indexSpan.className = 'queue-index';
    indexSpan.textContent = String(idx + 1).padStart(2, '0');
    li.append(indexSpan, document.createTextNode(` ${file.name}`));
    if (idx === currentTrackIdx) li.className = 'current';
    queueList.appendChild(li);
  });
}

// --- Pantalla completa CANVAS ---
canvas.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen();
  } else if (document.fullscreenElement === canvas) {
    document.exitFullscreen();
  }
});

// --- Pantalla completa PÁGINA WEB ---
pageFSBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

// --- Fullscreen & Resize helpers ---
const origCanvasStyle = {
  width: canvas.style.width,
  height: canvas.style.height,
  position: canvas.style.position,
  top: canvas.style.top,
  left: canvas.style.left,
  border: canvas.style.border,
  zIndex: canvas.style.zIndex
};

function resizeCanvasToFullscreen() {
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.border = 'none';
  canvas.style.zIndex = '9999';
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
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
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
});
