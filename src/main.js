const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, session } = require('electron');
const path = require('path');
const state = require('./state');
const claude = require('./claude');
const { getSpecies, randomLine } = require('./reactions');

let petWin;
let chatWin;
let tray;
let lastUserInteraction = Date.now();
let proactiveInterval;
let moodPushInterval;
let hungerInterval;

const PET_W = 220;
const PET_H = 200;
const PET_MIN_W = 100;
const PET_MIN_H = 90;
const PET_MAX_W = 440;
const PET_MAX_H = 400;
const CHAT_W = 260;
const CHAT_H = 340;
const CHAT_MIN_W = 220;
const CHAT_MIN_H = 260;
const CHAT_MAX_W = 420;
const CHAT_MAX_H = 560;

// Tracks the pet window's *current* size, which can differ from PET_W/PET_H
// once the user drags a resize handle — everything below reads these instead
// of the constants so movement/bounds stay correct after a resize.
const petSize = { w: PET_W, h: PET_H };

const CHARACTERS = [
  { id: 'elf', label: 'Elf' },
  { id: 'robot', label: 'Robot' },
  { id: 'ghost', label: 'Ghost' },
  { id: 'dog', label: 'Dog' },
  { id: 'cat', label: 'Cat' },
  { id: 'owl', label: 'Owl' }
];

const TICK_MS = 50;
const JUMP_DURATION = 550; // ms
const JUMP_HEIGHT = 45; // px
const SLEEP_ENERGY_IN = 22;
const SLEEP_ENERGY_OUT = 55;

// Each character moves differently: most amble with organic ease-in/out,
// the robot steps in rigid mechanical ticks, the owl advances in hops, and
// the ghost glides smoothly with no footsteps at all.
const GAITS = {
  elf: { speed: 78, jitter: 15, style: 'bounce' },
  cat: { speed: 85, jitter: 20, style: 'bounce' },
  dog: { speed: 92, jitter: 22, style: 'bounce' },
  robot: { speed: 55, jitter: 0, style: 'mech' },
  owl: { speed: 55, jitter: 10, style: 'hop' },
  ghost: { speed: 60, jitter: 10, style: 'float' }
};

function currentGait() {
  return GAITS[state.getCharacter()] || GAITS.robot;
}

// --- Pet state machine (drives petWin position + animation) ---
const pet = {
  x: 0,
  y: 0,
  groundY: 0,
  dir: 1,
  mode: 'idle', // idle | walk | jump | sleep | dragging
  modeUntil: 0,
  jumpStart: 0,
  jumpFromMode: 'idle',
  chatOpen: false,
  sentMode: null,
  sentDir: null
};

function screenBounds() {
  return screen.getPrimaryDisplay().workAreaSize;
}

function clampX(x) {
  const { width: sw } = screenBounds();
  return Math.min(Math.max(x, 0), sw - petSize.w);
}

function sendPetUpdate(force = false) {
  if (!petWin) return;
  if (force || pet.mode !== pet.sentMode || pet.dir !== pet.sentDir) {
    petWin.webContents.send('pet-update', { mode: pet.mode, direction: pet.dir });
    pet.sentMode = pet.mode;
    pet.sentDir = pet.dir;
  }
}

function pickNextBehavior() {
  const now = Date.now();
  const mood = state.getMood();

  if (pet.mode !== 'sleep' && mood.energy < SLEEP_ENERGY_IN) {
    pet.mode = 'sleep';
    pet.modeUntil = now + 20000; // re-check periodically
    return;
  }
  if (pet.mode === 'sleep') {
    if (mood.energy >= SLEEP_ENERGY_OUT) {
      pet.mode = 'idle';
      pet.modeUntil = now + 1500;
    } else {
      state.boostMood({ energy: 1 });
      pet.modeUntil = now + 20000;
    }
    return;
  }

  // Mostly idle, occasionally a short walk, rarely a jump — a calm desktop
  // companion rather than one that's constantly hopping around.
  const r = Math.random();
  if (r < 0.04) {
    pet.jumpFromMode = pet.mode === 'walk' ? 'walk' : 'idle';
    pet.mode = 'jump';
    pet.jumpStart = now;
    if (petWin) petWin.webContents.send('pet-action', { type: 'jump' });
  } else if (r < 0.32) {
    const gait = currentGait();
    pet.mode = 'walk';
    pet.dir = Math.random() < 0.5 ? -1 : 1;
    pet.walkSpeed = gait.speed + (Math.random() * 2 - 1) * gait.jitter;
    pet.walkStart = now;
    pet.mechLastStep = now;
    pet.modeUntil = now + 1800 + Math.random() * 2500;
  } else {
    pet.mode = 'idle';
    pet.modeUntil = now + 3000 + Math.random() * 5000;
  }
}

function petTick() {
  if (!petWin || pet.mode === 'dragging' || pet.chatOpen) return;
  const now = Date.now();

  if (pet.mode === 'jump') {
    const progress = Math.min((now - pet.jumpStart) / JUMP_DURATION, 1);
    const yOffset = Math.sin(progress * Math.PI) * JUMP_HEIGHT;
    if (pet.jumpFromMode === 'walk') {
      const gait = currentGait();
      pet.x = clampX(pet.x + (pet.dir * gait.speed * TICK_MS) / 1000);
      if (pet.x <= 0 || pet.x >= screenBounds().width - petSize.w) pet.dir *= -1;
    }
    petWin.setPosition(Math.round(pet.x), Math.round(pet.groundY - yOffset));
    if (progress >= 1) {
      pet.mode = pet.jumpFromMode;
      pet.walkStart = now;
      pet.modeUntil = now + 800 + Math.random() * 2000;
    }
  } else if (pet.mode === 'walk') {
    const gait = currentGait();
    const elapsed = now - pet.walkStart;
    const remaining = pet.modeUntil - now;
    // Ease in/out over the first and last 300ms of the walk so it doesn't
    // snap to a constant speed like a slide.
    const ease = Math.min(elapsed / 300, 1) * Math.min(Math.max(remaining, 0) / 300, 1);
    let dx = 0;

    if (gait.style === 'mech') {
      // Rigid servo-like steps: move in fixed ticks with a brief pause between.
      if (now - pet.mechLastStep >= 160) {
        dx = pet.dir * (gait.speed * 0.16);
        pet.mechLastStep = now;
      }
    } else if (gait.style === 'hop') {
      // Advance only during the "up" half of each hop cycle, pause on landing.
      const cyclePos = (elapsed % 500) / 500;
      if (cyclePos < 0.5) dx = (pet.dir * pet.walkSpeed * TICK_MS * ease) / 1000;
    } else {
      dx = (pet.dir * pet.walkSpeed * TICK_MS * ease) / 1000;
    }

    pet.x = clampX(pet.x + dx);
    const { width: sw } = screenBounds();
    if (pet.x <= 0 || pet.x >= sw - petSize.w) pet.dir *= -1;
    petWin.setPosition(Math.round(pet.x), Math.round(pet.groundY));
  }

  if (now >= pet.modeUntil && pet.mode !== 'jump') {
    pickNextBehavior();
  }

  sendPetUpdate();
}

function resetPetPosition() {
  const { width: sw, height: sh } = screenBounds();
  pet.x = sw - petSize.w - 40;
  pet.groundY = sh - petSize.h;
  pet.y = pet.groundY;
  pet.mode = 'idle';
  pet.modeUntil = Date.now() + 2000;
  if (petWin) petWin.setPosition(Math.round(pet.x), Math.round(pet.groundY));
  sendPetUpdate(true);
}

function createPetWindow() {
  petWin = new BrowserWindow({
    width: PET_W,
    height: PET_H,
    minWidth: PET_MIN_W,
    minHeight: PET_MIN_H,
    maxWidth: PET_MAX_W,
    maxHeight: PET_MAX_H,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWin.setAlwaysOnTop(true, 'floating', 1);
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWin.setAspectRatio(PET_W / PET_H);
  petWin.loadFile(path.join(__dirname, 'renderer', 'pet.html'));
  if (process.env.BUDDY_DEBUG) petWin.webContents.openDevTools({ mode: 'detach' });

  resetPetPosition();

  // The user can drag a resize handle to make the character more compact (or
  // bigger). Keep our own tracking of the current size in sync so movement
  // bounds/positioning stay correct afterward — the character itself scales
  // via CSS, no re-render needed here.
  petWin.on('resize', () => {
    const [w, h] = petWin.getSize();
    const [x, y] = petWin.getPosition();
    petSize.w = w;
    petSize.h = h;
    pet.x = x;
    pet.y = y;
    pet.groundY = y;
  });

  petWin.on('closed', () => {
    petWin = null;
  });
}

function createChatWindow() {
  chatWin = new BrowserWindow({
    width: CHAT_W,
    height: CHAT_H,
    minWidth: CHAT_MIN_W,
    minHeight: CHAT_MIN_H,
    maxWidth: CHAT_MAX_W,
    maxHeight: CHAT_MAX_H,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  chatWin.loadFile(path.join(__dirname, 'renderer', 'chat.html'));
  chatWin.on('closed', () => {
    chatWin = null;
  });
}

function positionChatNearPet() {
  if (!petWin || !chatWin) return;
  const { width: sw, height: sh } = screenBounds();
  const [px, py] = petWin.getPosition();
  const [cw, ch] = chatWin.getSize();

  let x = px + petSize.w / 2 - cw / 2;
  let y = py - ch - 10;
  if (y < 0) y = py + petSize.h + 10;
  if (y + ch > sh) y = sh - ch;
  x = Math.min(Math.max(x, 0), sw - cw);

  chatWin.setPosition(Math.round(x), Math.round(y));
}

function openChat() {
  if (petWin && (pet.mode === 'jump' || pet.mode === 'walk')) {
    pet.mode = 'idle';
    petWin.setPosition(Math.round(pet.x), Math.round(pet.groundY));
    sendPetUpdate(true);
  }
  if (!chatWin) createChatWindow();
  positionChatNearPet();
  chatWin.show();
  pet.chatOpen = true;
  lastUserInteraction = Date.now();
  const mood = state.boostMood({ attention: 5 });
  broadcastMood(mood);
}

function closeChat() {
  if (chatWin) chatWin.hide();
  pet.chatOpen = false;
  pet.modeUntil = 0;
}

function toggleChat() {
  if (chatWin && chatWin.isVisible()) closeChat();
  else openChat();
}

function broadcastMood(mood) {
  const moodLabel = state.getMoodLabel(mood);
  const payload = { mood, moodLabel };
  if (petWin) petWin.webContents.send('mood-changed', payload);
  if (chatWin) chatWin.webContents.send('mood-changed', payload);
}

function broadcastCharacter(id) {
  if (petWin) petWin.webContents.send('character-changed', id);
  if (chatWin) chatWin.webContents.send('character-changed', id);
}

function broadcastBond(bond) {
  if (chatWin) chatWin.webContents.send('bond-changed', bond);
  if (petWin) petWin.webContents.send('bond-changed', bond);
}

function broadcastVoiceEnabled(enabled) {
  if (petWin) petWin.webContents.send('voice-changed', enabled);
  if (chatWin) chatWin.webContents.send('voice-changed', enabled);
}

function handleEvolution(bond) {
  if (!bond.evolved) return;
  const species = getSpecies(state.getCharacter());
  const line = (species.evolveLines && species.evolveLines[bond.stage]) || null;
  if (petWin) petWin.webContents.send('buddy-evolved', { stage: bond.stage, line });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Show / Hide Buddy',
      click: () => {
        if (!petWin) return;
        petWin.isVisible() ? petWin.hide() : petWin.show();
      }
    },
    {
      label: 'Reset Position',
      click: () => resetPetPosition()
    },
    { type: 'separator' },
    {
      label: 'Character',
      submenu: CHARACTERS.map((c) => ({
        label: c.label,
        type: 'radio',
        checked: state.getCharacter() === c.id,
        click: () => {
          state.setCharacter(c.id);
          broadcastCharacter(c.id);
          refreshTrayMenu();
        }
      }))
    },
    { type: 'separator' },
    { label: 'Quit Buddy', click: () => app.quit() }
  ]);
}

function refreshTrayMenu() {
  tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('🤖');
  tray.setToolTip('Buddy');
  refreshTrayMenu();
}

function startProactiveLoop() {
  proactiveInterval = setInterval(async () => {
    if (!petWin || !petWin.isVisible() || pet.chatOpen) return;
    const idleMinutes = (Date.now() - lastUserInteraction) / 60000;
    if (idleMinutes < 8 || Math.random() > 0.4) return;

    const mood = state.getMood();
    const moodLabel = state.getMoodLabel(mood);
    try {
      const line = await claude.proactiveLine({
        mood,
        moodLabel,
        reason: `idle for ${Math.round(idleMinutes)} minutes`
      });
      if (line) petWin.webContents.send('buddy-says', { text: line });
    } catch (err) {
      // Silent fail (e.g. no API key yet).
    }
  }, 60000);
}

function startMoodPushLoop() {
  moodPushInterval = setInterval(() => {
    broadcastMood(state.getMood());
  }, 30000);
}

// Distinct from the Claude-powered proactive chatter: this is an instant,
// no-API-call, in-character request for food whenever energy runs low —
// every species asks in its own voice.
function startHungerLoop() {
  hungerInterval = setInterval(() => {
    if (!petWin || !petWin.isVisible() || pet.chatOpen) return;
    const mood = state.getMood();
    if (!state.isHungry(mood) || !state.canNagHunger()) return;

    state.registerHungerNag();
    const species = getSpecies(state.getCharacter());
    const line = randomLine(species.hungryLines);
    petWin.webContents.send('buddy-says', { text: line, short: true });
  }, 45000);
}

ipcMain.handle('get-init-state', () => {
  const mood = state.getMood();
  const character = state.getCharacter();
  const species = getSpecies(character);
  return {
    mood,
    moodLabel: state.getMoodLabel(mood),
    hasApiKey: state.getConfiguredProviders().length > 0,
    keysSet: Object.fromEntries(state.PROVIDER_IDS.map((p) => [p, !!state.getApiKey(p)])),
    activeProvider: state.getActiveProvider(),
    configuredProviders: state.getConfiguredProviders(),
    history: state.getHistory(),
    character,
    petName: state.getPetName() || species.defaultName,
    userName: state.getUserName(),
    bond: state.getBond(),
    voiceEnabled: state.getVoiceEnabled()
  };
});

ipcMain.handle('set-pet-name', (_evt, name) => {
  state.setPetName(name.trim());
  return true;
});

ipcMain.handle('set-voice-enabled', (_evt, enabled) => {
  state.setVoiceEnabled(enabled);
  broadcastVoiceEnabled(!!enabled);
  return true;
});

ipcMain.handle('set-user-name', (_evt, name) => {
  state.setUserName(name.trim());
  return true;
});

ipcMain.handle('pet-pet', () => {
  if (!state.canPet()) return { ok: false };
  state.registerPet();
  lastUserInteraction = Date.now();
  const mood = state.boostMood({ happiness: 3, attention: 2 });
  const bond = state.addBondXp(1);
  broadcastMood(mood);
  broadcastBond(bond);
  const species = getSpecies(state.getCharacter());
  const line = randomLine(species.petLines);
  if (bond.evolved) {
    handleEvolution(bond);
  } else if (petWin) {
    petWin.webContents.send('buddy-says', { text: line, short: true });
  }
  return { ok: true, line };
});

ipcMain.handle('feed-pet', () => {
  if (!state.canFeed()) {
    return { ok: false, remainingMs: state.feedCooldownRemaining() };
  }
  state.registerFeed();
  lastUserInteraction = Date.now();
  const mood = state.boostMood({ energy: 25, happiness: 8 });
  const bond = state.addBondXp(5);
  broadcastMood(mood);
  broadcastBond(bond);
  if (pet.mode === 'sleep' && mood.energy > SLEEP_ENERGY_IN) {
    pet.mode = 'idle';
    pet.modeUntil = Date.now() + 1500;
  }
  const species = getSpecies(state.getCharacter());
  const line = randomLine(species.feedLines);
  if (bond.evolved) {
    handleEvolution(bond);
  } else if (petWin) {
    petWin.webContents.send('buddy-says', { text: line, short: true });
  }
  return { ok: true, line, mood, bond };
});

ipcMain.handle('set-api-key', (_evt, { provider, key }) => {
  state.setApiKey(provider, key.trim());
  return { ok: true, configuredProviders: state.getConfiguredProviders() };
});

ipcMain.handle('set-active-provider', (_evt, provider) => {
  state.setActiveProvider(provider);
  return true;
});

ipcMain.handle('set-character', (_evt, id) => {
  state.setCharacter(id);
  broadcastCharacter(id);
  if (tray) refreshTrayMenu();
  return true;
});

ipcMain.handle('send-message', async (_evt, text) => {
  lastUserInteraction = Date.now();
  state.appendHistory('user', text);
  const mood = state.boostMood({ happiness: 4, attention: 15, energy: 1 });
  const moodLabel = state.getMoodLabel(mood);
  const bond = state.addBondXp(3);
  broadcastMood(mood);
  broadcastBond(bond);
  handleEvolution(bond);
  if (mood.energy > SLEEP_ENERGY_IN && pet.mode === 'sleep') {
    pet.mode = 'idle';
    pet.modeUntil = Date.now() + 1500;
  }

  try {
    const result = await claude.chat(text, { mood, moodLabel });
    state.appendHistory('assistant', result.text);
    if (petWin) petWin.webContents.send('buddy-says', { text: result.text });
    return {
      ok: true,
      reply: result.text,
      mood,
      moodLabel,
      provider: result.provider,
      switched: result.switched
    };
  } catch (err) {
    if (err.code === 'NO_API_KEY') {
      return { ok: false, error: 'NO_API_KEY' };
    }
    return { ok: false, error: err.message || 'unknown error', provider: err.provider };
  }
});

ipcMain.on('user-active', () => {
  lastUserInteraction = Date.now();
});

ipcMain.on('toggle-chat', () => {
  toggleChat();
  if (pet.mode === 'sleep') {
    pet.mode = 'idle';
    pet.modeUntil = Date.now() + 1500;
  }
});

ipcMain.on('close-chat', () => closeChat());

ipcMain.on('pet-drag-start', () => {
  pet.mode = 'dragging';
});

ipcMain.on('pet-drag-move', (_evt, { dx, dy }) => {
  if (!petWin) return;
  const [x, y] = petWin.getPosition();
  const { width: sw, height: sh } = screenBounds();
  const nx = Math.min(Math.max(x + dx, 0), sw - petSize.w);
  const ny = Math.min(Math.max(y + dy, 0), sh - petSize.h);
  petWin.setPosition(nx, ny);
  pet.x = nx;
  pet.y = ny;
});

ipcMain.on('pet-drag-end', () => {
  pet.groundY = pet.y;
  pet.mode = 'idle';
  pet.modeUntil = Date.now() + 1000;
  lastUserInteraction = Date.now();
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  createPetWindow();
  createTray();
  setInterval(petTick, TICK_MS);
  startProactiveLoop();
  startMoodPushLoop();
  startHungerLoop();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

app.on('window-all-closed', () => {
  clearInterval(proactiveInterval);
  clearInterval(moodPushInterval);
  clearInterval(hungerInterval);
  app.quit();
});
