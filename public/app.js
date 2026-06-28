'use strict';

// ── Preset defaults ────────────────────────────────────────────────────────
const PRESET_DEFAULTS = [
  { key: 'fwdLunge',   beats: 10, rounds: 1, bpm: 20 },
  { key: 'sideStep',   beats: 10, rounds: 1, bpm: 20 },
  { key: 'revLunge',   beats: 10, rounds: 1, bpm: 20 },
  { key: 'floorTap',   beats: 10, rounds: 1, bpm: 20 },
  { key: 'halfSquats', beats: 10, rounds: 1, bpm: 20 },
  { key: 'squatPause', beats: 10, rounds: 1, bpm: 20 },
];

const LS_KEY = 'beats-counter-presets';

// Mutable working copy — merged with any localStorage overrides at init
let presetData = PRESET_DEFAULTS.map(p => ({ ...p }));

function loadPresetsFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (!Array.isArray(saved)) return;
    saved.forEach((item, i) => {
      if (!item || i >= presetData.length) return;
      if (Number.isFinite(item.beats))  presetData[i].beats  = item.beats;
      if (Number.isFinite(item.rounds)) presetData[i].rounds = item.rounds;
      if (Number.isFinite(item.bpm))    presetData[i].bpm    = item.bpm;
    });
  } catch (_) {}
}

function savePresetsToStorage() {
  localStorage.setItem(LS_KEY, JSON.stringify(
    presetData.map(({ beats, rounds, bpm }) => ({ beats, rounds, bpm }))
  ));
}

// ── i18n ───────────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  en: {
    title:           'Beats Counter',
    sessionSettings: 'Session Settings',
    beatsPerRound:   'Beats per round',
    numberOfRounds:  'Number of rounds',
    speed:           'Speed',
    pauseSettings:   'Pause Settings',
    pauseDuration:   'Pause duration (seconds)',
    start:           'Start',
    stop:            'Stop',
    reset:           'Reset',
    running:         'Running…',
    stopped:         'Stopped',
    done:            'Done!',
    allDone:         'All done!',
    round:           'Round',
    pause:           'Pause',
    presetsTitle:    'Exercises',
    halfSquats:      'Half Squats',
    revLunge:        'Squat+Rev Lunge',
    floorTap:        'Floor Tap',
    sideStep:        'Side Step',
    fwdLunge:        'Squat+Fwd Lunge',
    squatPause:      'Squat Pause',
  },
  cs: {
    title:           'Počítadlo beatů',
    sessionSettings: 'Nastavení',
    beatsPerRound:   'Počet beatů',
    numberOfRounds:  'Počet kol',
    speed:           'Rychlost',
    pauseSettings:   'Nastavení pauzy',
    pauseDuration:   'Délka pauzy (sekundy)',
    start:           'Start',
    stop:            'Stop',
    reset:           'Reset',
    running:         'Probíhá…',
    stopped:         'Zastaveno',
    done:            'Hotovo!',
    allDone:         'Vše hotovo!',
    round:           'Kolo',
    pause:           'Pauza',
    presetsTitle:    'Cvičení',
    halfSquats:      'Půl dřep',
    revLunge:        'Výpad vzad',
    floorTap:        'Klepnutí',
    sideStep:        'Krok stranou',
    fwdLunge:        'Výpad vpřed',
    squatPause:      'Dřep s pauzou',
  },
};

let currentLang = 'en';

function t(key) {
  return TRANSLATIONS[currentLang][key] || TRANSLATIONS.en[key] || key;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.documentElement.lang = currentLang;
  renderPresetChips();
  if (!state.running) {
    btnStart.textContent = t('start');
    if (statusLabel.dataset.statusKey) {
      setStatus(statusLabel.dataset.statusKey, statusLabel.dataset.statusCls);
    }
    resetUI();
  }
}

// ── Audio ──────────────────────────────────────────────────────────────────
let audioCtx = null;
let pauseOscillators = [];  // tracked so we can stop early on session stop

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTick(isAccent = false) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(isAccent ? 1200 : 800, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(isAccent ? 600 : 400, ctx.currentTime + 0.04);
  gain.gain.setValueAtTime(0.7, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.07);
}

function stopPauseAudio() {
  const ctx = audioCtx;
  pauseOscillators.forEach(osc => {
    try { osc.stop(ctx ? ctx.currentTime : 0); } catch (_) {}
  });
  pauseOscillators = [];
}

function playPauseAudio(durationSec) {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  pauseOscillators = [];

  // Master gain with fade-in and fade-out
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.18, now + 1.8);
  master.gain.setValueAtTime(0.18, now + Math.max(1.8, durationSec - 1.5));
  master.gain.linearRampToValueAtTime(0.001, now + durationSec - 0.15);
  master.connect(ctx.destination);

  // Soft A-minor pad: A3 C4 E4 A4, triangle waves with slight detune
  const chordFreqs = [220, 261.63, 329.63, 440];
  const detunes    = [+8, -6, +4, -8];
  chordFreqs.forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.detune.setValueAtTime(detunes[i], now);
    gain.gain.setValueAtTime(0.22, now);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + durationSec);
    pauseOscillators.push(osc);
  });

  // LFO breathing — very slow, ±0.04 gain swell
  const lfo     = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.12, now);
  lfoGain.gain.setValueAtTime(0.04, now);
  lfo.connect(lfoGain);
  lfoGain.connect(master.gain);
  lfo.start(now);
  lfo.stop(now + durationSec);
  pauseOscillators.push(lfo);

  // 3-2-1 countdown bell tones (only if pause is long enough)
  if (durationSec >= 4) {
    [
      { offset: durationSec - 3, freq: 523.25 },  // C5
      { offset: durationSec - 2, freq: 659.25 },  // E5
      { offset: durationSec - 1, freq: 783.99 },  // G5
    ].forEach(({ offset, freq }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.55, now + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.9);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 1.0);
      pauseOscillators.push(osc);
    });
  }
}

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  running: false,
  paused: false,
  currentRound: 0,
  currentBeat: 0,
  timeoutId: null,
  pauseTimeoutId: null,
  pauseStart: 0,
  presetIndex: -1,
  chainMode: false,
  completedPresets: new Set(),
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const inputBeats      = $('input-beats');
const inputRounds     = $('input-rounds');
const inputBpm        = $('input-bpm');
const pauseSettingsEl = $('pause-settings');
const inputPauseDur   = $('input-pause-dur');

const presetList      = $('preset-list');
const presetListPause = $('preset-list-pause');
const presetNameEl    = $('preset-name');
const roundInfo    = $('round-info');
const beatDisplay  = $('beat-display');
const statusLabel  = $('status-label');
const progressFill = $('progress-fill');

const btnStart = $('btn-start');
const btnStop  = $('btn-stop');
const btnReset = $('btn-reset');

// ── Settings helpers ───────────────────────────────────────────────────────
function getSettings() {
  return {
    beats:      Math.max(1, parseInt(inputBeats.value)      || 4),
    rounds:     Math.max(1, parseInt(inputRounds.value)     || 4),
    bpm:        Math.max(20, Math.min(300, parseInt(inputBpm.value) || 120)),
    pauseOn:    true,
    pauseEvery: 1,
    pauseDur:   Math.max(1, parseInt(inputPauseDur.value)   || 5),
  };
}

function beatInterval(bpm) {
  return Math.round(60000 / bpm);
}

// ── Persist current settings into selected preset ──────────────────────────
function syncSettingsToPreset() {
  const i = state.presetIndex;
  if (i < 0 || state.running) return;
  const s = getSettings();
  presetData[i].beats  = s.beats;
  presetData[i].rounds = s.rounds;
  presetData[i].bpm    = s.bpm;
  savePresetsToStorage();
  // Update only the beat count badge on the chip, without re-rendering all
  const containers = [presetList, presetListPause];
  containers.forEach(container => {
    const chip = container.querySelector(`.preset-chip[data-index="${i}"]`);
    if (chip) {
      const badge = chip.querySelector('.preset-chip-beats');
      if (badge) badge.textContent = `${s.beats}b`;
    }
  });
}

// ── Preset management ──────────────────────────────────────────────────────
function loadPreset(index) {
  const p = presetData[index];
  state.presetIndex = index;
  inputBeats.value = p.beats;
  inputRounds.value = p.rounds;
  inputBpm.value = p.bpm;
  renderPresetChips();
  if (!state.running) resetUI();
}

function makePresetChip(p, i) {
  const chip = document.createElement('button');
  chip.className = 'preset-chip';
  chip.dataset.index = i;

  if (state.completedPresets.has(i))                 chip.classList.add('done');
  else if (state.running && state.presetIndex === i) chip.classList.add('active');
  else if (state.presetIndex === i)                  chip.classList.add('selected');

  const nameSpan = document.createElement('span');
  nameSpan.className = 'preset-chip-name';
  nameSpan.textContent = t(p.key);

  const beatsSpan = document.createElement('span');
  beatsSpan.className = 'preset-chip-beats';
  beatsSpan.textContent = p.key === 'squatPause'
    ? `${Math.max(1, parseInt(inputPauseDur.value) || 5)}s`
    : `${p.beats}b`;

  chip.appendChild(nameSpan);
  chip.appendChild(beatsSpan);
  return chip;
}

function renderPresetChips() {
  presetList.innerHTML = '';
  presetListPause.innerHTML = '';
  presetData.forEach((p, i) => {
    const chip = makePresetChip(p, i);
    if (p.key === 'squatPause') {
      presetListPause.appendChild(chip);
    } else {
      presetList.appendChild(chip);
    }
  });
}

// ── UI rendering ───────────────────────────────────────────────────────────
function renderDots(total, current, done) {
  beatDisplay.innerHTML = '';
  const max = Math.min(total, 32);
  for (let i = 0; i < max; i++) {
    const dot = document.createElement('div');
    dot.className = 'beat-dot';
    if (i < done) dot.classList.add('done');
    else if (i === current) dot.classList.add('active');
    beatDisplay.appendChild(dot);
  }
}

function updateProgress(currentRound, totalRounds) {
  progressFill.style.width = `${(currentRound / totalRounds) * 100}%`;
}

function setStatus(key, cls = '') {
  const text = TRANSLATIONS[currentLang][key] !== undefined ? t(key) : key;
  statusLabel.textContent = text;
  statusLabel.className = 'status-label' + (cls ? ' ' + cls : '');
  statusLabel.dataset.statusKey = key;
  statusLabel.dataset.statusCls = cls;
}

function updatePresetName() {
  if (state.presetIndex >= 0) {
    presetNameEl.textContent = t(presetData[state.presetIndex].key);
    presetNameEl.hidden = false;
  } else {
    presetNameEl.textContent = '';
    presetNameEl.hidden = true;
  }
}

function resetUI() {
  const s = getSettings();
  roundInfo.textContent = `${t('round')} 1 / ${s.rounds}`;
  renderDots(s.beats, -1, 0);
  statusLabel.textContent = '';
  statusLabel.dataset.statusKey = '';
  progressFill.style.width = '0%';
  updatePresetName();
}

// ── Core sequencer ─────────────────────────────────────────────────────────
function scheduleNextBeat() {
  if (!state.running) return;

  const s = getSettings();
  const interval = beatInterval(s.bpm);
  const isFirstBeat = state.currentBeat === 0;

  playTick(isFirstBeat);
  renderDots(s.beats, state.currentBeat, 0);
  roundInfo.textContent = `${t('round')} ${state.currentRound} / ${s.rounds}`;
  statusLabel.textContent = '';

  state.currentBeat++;

  if (state.currentBeat >= s.beats) {
    state.currentBeat = 0;
    updateProgress(state.currentRound, s.rounds);

    if (state.currentRound >= s.rounds) {
      renderDots(s.beats, -1, s.beats);

      const nextIdx = state.presetIndex + 1;
      const hasNext = state.chainMode && state.presetIndex >= 0 && nextIdx < presetData.length;

      if (hasNext) {
        state.completedPresets.add(state.presetIndex);
        renderPresetChips();

        if (s.pauseOn) {
          startPause(s.pauseDur, s.beats, () => {
            loadPreset(nextIdx);
            runSession();
          });
        } else {
          state.timeoutId = setTimeout(() => {
            if (!state.running) return;
            loadPreset(nextIdx);
            runSession();
          }, 600);
        }
        return;
      }

      state.running = false;
      if (state.chainMode && state.presetIndex >= 0) {
        state.completedPresets.add(state.presetIndex);
      }
      renderPresetChips();
      setStatus(state.chainMode ? 'allDone' : 'done', 'done');
      progressFill.style.width = '100%';
      btnStart.textContent = t('start');
      btnStart.disabled = false;
      btnStop.disabled = true;
      return;
    }

    const shouldPause = s.pauseOn && (state.currentRound % s.pauseEvery === 0);
    if (shouldPause) {
      startPause(s.pauseDur, s.beats, () => {
        state.currentRound++;
        scheduleNextBeat();
      });
    } else {
      state.currentRound++;
      state.timeoutId = setTimeout(scheduleNextBeat, interval);
    }
  } else {
    state.timeoutId = setTimeout(scheduleNextBeat, interval);
  }
}

function startPause(durationSec, totalBeats, onComplete) {
  state.paused = true;
  const totalMs = durationSec * 1000;
  state.pauseStart = performance.now();

  renderDots(totalBeats, -1, totalBeats);
  playPauseAudio(durationSec);

  function updatePauseLabel() {
    if (!state.running) return;
    const elapsed = performance.now() - state.pauseStart;
    const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
    statusLabel.textContent = `${t('pause')} — ${remaining}s`;
    statusLabel.className = 'status-label pause';
    statusLabel.dataset.statusKey = '';
  }

  updatePauseLabel();
  const labelInterval = setInterval(updatePauseLabel, 200);

  state.pauseTimeoutId = setTimeout(() => {
    clearInterval(labelInterval);
    if (!state.running) return;
    state.paused = false;
    onComplete();
  }, totalMs);
}

// ── Session runner ─────────────────────────────────────────────────────────
function runSession() {
  const s = getSettings();
  state.currentRound = 1;
  state.currentBeat = 0;
  btnStart.textContent = t('running');
  btnStart.disabled = true;
  btnStop.disabled = false;
  roundInfo.textContent = `${t('round')} 1 / ${s.rounds}`;
  progressFill.style.width = '0%';
  renderDots(s.beats, -1, 0);
  statusLabel.textContent = '';
  updatePresetName();
  renderPresetChips();
  scheduleNextBeat();
}

// ── Controls ───────────────────────────────────────────────────────────────
function startSession() {
  getAudioCtx();
  state.running = true;
  state.paused = false;
  state.chainMode = state.presetIndex >= 0;
  runSession();
}

function stopSession() {
  state.running = false;
  state.paused = false;
  state.chainMode = false;
  clearTimeout(state.timeoutId);
  clearTimeout(state.pauseTimeoutId);
  stopPauseAudio();
  btnStart.textContent = t('start');
  btnStart.disabled = false;
  btnStop.disabled = true;
  setStatus('stopped');
  renderPresetChips();
}

function resetSession() {
  stopSession();
  state.completedPresets.clear();
  statusLabel.textContent = '';
  statusLabel.dataset.statusKey = '';
  renderPresetChips();
  resetUI();
}

// ── Event listeners ────────────────────────────────────────────────────────
btnStart.addEventListener('click', startSession);
btnStop.addEventListener('click', stopSession);
btnReset.addEventListener('click', resetSession);

inputBpm.addEventListener('input', () => {
  syncSettingsToPreset();
});

inputPauseDur.addEventListener('input', () => {
  const chip = presetListPause.querySelector('.preset-chip-beats');
  if (chip) chip.textContent = `${Math.max(1, parseInt(inputPauseDur.value) || 5)}s`;
});

// Save preset changes when beats/rounds fields change
inputBeats.addEventListener('input', () => {
  if (!state.running) { resetUI(); syncSettingsToPreset(); }
});

inputRounds.addEventListener('input', () => {
  if (!state.running) { resetUI(); syncSettingsToPreset(); }
});

[presetList, presetListPause].forEach(container => {
  container.addEventListener('click', e => {
    const chip = e.target.closest('.preset-chip');
    if (!chip || state.running) return;
    loadPreset(parseInt(chip.dataset.index));
  });
});

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentLang = btn.dataset.lang;
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyTranslations();
  });
});

// ── Init ───────────────────────────────────────────────────────────────────
loadPresetsFromStorage();
renderPresetChips();
resetUI();
btnStop.disabled = true;
