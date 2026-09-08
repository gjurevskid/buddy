const bubble = document.getElementById('bubble');
const zzz = document.getElementById('zzz');
const dropHint = document.getElementById('dropHint');
const petFlip = document.getElementById('petFlip');
const stage = document.getElementById('stage');
const appEl = document.getElementById('app');

let currentCharacter = 'robot';
let currentMoodLabel = 'content';
let currentState = 'idle';
let currentStage = 'adult';
let currentEnergy = 80;
let voiceEnabled = false;
let bubbleTimer = null;

const MOOD_CLASSES = ['mood-delighted', 'mood-content', 'mood-bored', 'mood-lonely', 'mood-neglected'];
const STATE_CLASSES = ['state-idle', 'state-walk', 'state-jump', 'state-sleep'];
const STAGE_CLASSES = ['stage-baby', 'stage-adult', 'stage-elder'];
const GAIT_STYLE = { elf: 'bounce', cat: 'bounce', dog: 'bounce', robot: 'mech', owl: 'hop', ghost: 'float' };

function renderCharacter() {
  stage.innerHTML = window.Characters.render(currentCharacter, currentMoodLabel, currentStage);
  stage.classList.remove(...[...stage.classList].filter((c) => c.startsWith('char-') || c.startsWith('gait-')));
  stage.classList.remove(...STAGE_CLASSES);
  stage.classList.add(`char-${currentCharacter}`, `gait-${GAIT_STYLE[currentCharacter] || 'bounce'}`, `stage-${currentStage}`);
  applyState(currentState);
  scheduleIdleLook();
}

function applyState(mode) {
  currentState = mode;
  stage.classList.remove(...STATE_CLASSES);
  const cssState = mode === 'dragging' ? 'idle' : mode;
  stage.classList.add(`state-${cssState}`);
  stage.classList.toggle('sleeping', mode === 'sleep');
  zzz.classList.toggle('hidden', mode !== 'sleep');
}

function applyMood(mood, moodLabel) {
  currentMoodLabel = moodLabel;
  if (mood && typeof mood.energy === 'number') currentEnergy = mood.energy;
  stage.classList.remove(...MOOD_CLASSES);
  stage.classList.add(`mood-${moodLabel}`);
  renderCharacter();
}

function showBubble(text, ms = 8000, { voice = true } = {}) {
  bubble.textContent = text;
  bubble.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), ms);
  if (voice && voiceEnabled) speak(text);
}

function popHeart() {
  const heart = document.createElement('div');
  heart.className = 'heartPop';
  heart.textContent = '❤️';
  heart.style.left = `${90 + Math.random() * 40}px`;
  document.getElementById('app').appendChild(heart);
  setTimeout(() => heart.remove(), 1200);
}

function playEvolution() {
  const app = document.getElementById('app');
  app.classList.remove('evolving');
  void app.offsetWidth;
  app.classList.add('evolving');
  setTimeout(() => app.classList.remove('evolving'), 1700);

  const emojis = ['✨', '⭐', '🌟', '✨'];
  emojis.forEach((symbol, i) => {
    const el = document.createElement('div');
    el.className = 'evolveSparkle';
    el.textContent = symbol;
    el.style.setProperty('--dx', `${(i - 1.5) * 30}px`);
    el.style.animationDelay = `${i * 90}ms`;
    app.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  });
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.05;
  utter.pitch = 1.1;
  window.speechSynthesis.speak(utter);
}

let idleLookTimer = null;

// Small bits of life while standing still — alert head-turns when energy is
// good, more frequent yawns/stretches as energy runs low, like a real animal
// (or a person) getting sleepy rather than bouncing around nonstop.
function scheduleIdleLook() {
  clearTimeout(idleLookTimer);
  const next = () => {
    if (currentState === 'idle') {
      const sleepyChance = 0.12 + (1 - currentEnergy / 100) * 0.4;
      const roll = Math.random();
      if (roll < sleepyChance) {
        stage.classList.remove('yawning');
        void stage.offsetWidth;
        stage.classList.add('yawning');
        setTimeout(() => stage.classList.remove('yawning'), 1100);
      } else if (roll < sleepyChance + 0.35) {
        const dir = Math.random() < 0.5 ? 'look-left' : 'look-right';
        stage.classList.add(dir);
        setTimeout(() => stage.classList.remove(dir), 700);
      }
    }
    idleLookTimer = setTimeout(next, 2500 + Math.random() * 3000);
  };
  idleLookTimer = setTimeout(next, 2500 + Math.random() * 3000);
}

async function init() {
  const initState = await window.buddy.getInitState();
  currentCharacter = initState.character || 'robot';
  currentStage = (initState.bond && initState.bond.stage) || 'adult';
  voiceEnabled = !!initState.voiceEnabled;
  applyMood(initState.mood, initState.moodLabel);
}

window.buddy.onPetUpdate(({ mode, direction }) => {
  if (mode) applyState(mode);
  if (direction === -1) petFlip.classList.add('face-left');
  else if (direction === 1) petFlip.classList.remove('face-left');
});

window.buddy.onPetAction(({ type }) => {
  if (type === 'jump') {
    stage.classList.remove('jump-squash');
    void stage.offsetWidth;
    stage.classList.add('jump-squash');
  }
});

window.buddy.onMoodChanged(({ mood, moodLabel }) => {
  applyMood(mood, moodLabel);
});

window.buddy.onVoiceChanged((enabled) => {
  voiceEnabled = !!enabled;
  if (!voiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
});

window.buddy.onBondChanged((bond) => {
  if (bond.stage && bond.stage !== currentStage) {
    currentStage = bond.stage;
    renderCharacter();
  }
});

window.buddy.onCharacterChanged((id) => {
  currentCharacter = id;
  renderCharacter();
});

window.buddy.onBuddySays(({ text, short }) => {
  showBubble(text, short ? 2600 : 9000, { voice: !short });
});

window.buddy.onBuddyEvolved(({ line }) => {
  renderCharacter();
  playEvolution();
  if (line) showBubble(line, 9000);
});

async function doPet() {
  popHeart();
  const result = await window.buddy.petThePet();
  if (!result.ok) return; // on cooldown — the heart alone is still a nice ack
}

// --- Click (pet) vs. double-click (chat) vs. drag ---
let dragState = null;
let pendingClickTimer = null;

stage.addEventListener('mousedown', (e) => {
  dragState = { startX: e.screenX, startY: e.screenY, lastX: e.screenX, lastY: e.screenY, moved: false };
});

window.addEventListener('mousemove', (e) => {
  if (!dragState) return;
  const totalDx = e.screenX - dragState.startX;
  const totalDy = e.screenY - dragState.startY;
  if (!dragState.moved && Math.hypot(totalDx, totalDy) > 4) {
    dragState.moved = true;
    window.buddy.petDragStart();
  }
  if (dragState.moved) {
    window.buddy.petDragMove(e.screenX - dragState.lastX, e.screenY - dragState.lastY);
    dragState.lastX = e.screenX;
    dragState.lastY = e.screenY;
  }
});

window.addEventListener('mouseup', () => {
  if (!dragState) return;
  if (dragState.moved) {
    window.buddy.petDragEnd();
  } else {
    window.buddy.notifyUserActive();
    if (pendingClickTimer) {
      // Second click within the window: it's a double-click, open chat.
      clearTimeout(pendingClickTimer);
      pendingClickTimer = null;
      window.buddy.toggleChat();
    } else {
      pendingClickTimer = setTimeout(() => {
        pendingClickTimer = null;
        doPet();
      }, 280);
    }
  }
  dragState = null;
});

// --- Drag a file onto Buddy to feed it ---
appEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropHint.classList.remove('hidden');
});
appEl.addEventListener('dragleave', () => {
  dropHint.classList.add('hidden');
});
appEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropHint.classList.add('hidden');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const filePath = window.buddy.getPathForFile(file);
  if (!filePath) return;
  window.buddy.notifyUserActive();
  popHeart();
  const result = await window.buddy.feedFile(filePath);
  if (!result.ok && result.error) showBubble(result.error, 4000, { voice: false });
});

init();
