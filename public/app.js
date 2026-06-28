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
    letsStart:       "Let's start",
    getReady:        'Get ready',
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
    letsStart:       'Začínáme',
    getReady:        'Připrav se',
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

const bgMusic = new Audio('pirates.mp3');
bgMusic.loop   = true;
bgMusic.volume = 0.35;

function startMusic() { bgMusic.currentTime = 0; bgMusic.play().catch(() => {}); }
function stopMusic()  { bgMusic.pause(); bgMusic.currentTime = 0; }

let pauseCountdownIds = [];

function stopPauseAudio() {
  pauseCountdownIds.forEach(id => clearTimeout(id));
  pauseCountdownIds = [];
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

let cachedFemaleVoice = null;

function getFemaleVoice() {
  if (cachedFemaleVoice) return cachedFemaleVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred = [
    'Microsoft Susan',
    'Microsoft Zira',
    'Google US English',
    'Tessa',
    'Moira',
    'Karen',
    'Samantha',
    'Google UK English Female',
  ];
  for (const name of preferred) {
    const v = voices.find(v => v.name.includes(name));
    if (v) { cachedFemaleVoice = v; return v; }
  }
  const fallback = voices.find(v => v.name.toLowerCase().includes('female')) || null;
  cachedFemaleVoice = fallback;
  return fallback;
}

// Pre-load voices as soon as they're available
if (window.speechSynthesis) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    cachedFemaleVoice = null; // reset so next call re-picks from full list
    getFemaleVoice();         // warm the cache
  });
}

function speak(text) {
  if (!window.speechSynthesis) return;
  const utt = new SpeechSynthesisUtterance(String(text));
  utt.voice = getFemaleVoice();
  utt.rate = 1.2;
  utt.pitch = 1.1;
  utt.volume = 1.0;
  window.speechSynthesis.speak(utt);
}

function playPauseAudio(durationSec) {
  stopPauseAudio();
  // Speak each second: durationSec, durationSec-1, ..., 1, 0
  for (let i = 0; i <= durationSec; i++) {
    const number = durationSec - i;
    const id = setTimeout(() => speak(number), i * 1000);
    pauseCountdownIds.push(id);
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
  window.speechSynthesis && window.speechSynthesis.cancel();
  speak(state.currentBeat + 1);
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

        const isLastPreset = nextIdx === presetData.length - 1;
        if (s.pauseOn && !isLastPreset) {
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

const PRE_COUNTDOWN_MS = 2700; // 700ms last-beat + 2000ms gap before "Pause" word
const POST_WORD_MS     = 2000; // gap after "Pause" word before countdown starts

function startPause(durationSec, totalBeats, onComplete) {
  state.paused = true;
  // Total wall-clock: pre-gap + "Pause" word gap + countdown + post-gap
  const totalMs = PRE_COUNTDOWN_MS + POST_WORD_MS + durationSec * 1000 + 800;
  state.pauseStart = performance.now();

  renderDots(totalBeats, -1, totalBeats);
  // 700ms for last beat to finish, +2s gap, say "Pause", +2s gap, then countdown
  setTimeout(() => {
    speak(t('pause'));
    setTimeout(() => playPauseAudio(durationSec), 2000);
  }, 2700);

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
function prepareAndStart() {
  if (!state.running) return;
  setStatus('getReady', 'pause');
  // 2s silence → say "Let's start" → 2s silence → first beat
  state.timeoutId = setTimeout(() => {
    if (!state.running) return;
    speak(t('letsStart'));
    state.timeoutId = setTimeout(() => {
      if (!state.running) return;
      statusLabel.textContent = '';
      scheduleNextBeat();
    }, 1500);
  }, 1500);
}

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
  prepareAndStart();
}

// ── Controls ───────────────────────────────────────────────────────────────
function startSession() {
  state.running = true;
  state.paused = false;
  state.chainMode = state.presetIndex >= 0;
  startMusic();
  runSession();
}

function stopSession() {
  state.running = false;
  state.paused = false;
  state.chainMode = false;
  clearTimeout(state.timeoutId);
  clearTimeout(state.pauseTimeoutId);
  stopPauseAudio();
  stopMusic();
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
