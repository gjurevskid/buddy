const Store = require('electron-store');

const store = new Store({
  defaults: {
    apiKeys: { anthropic: '', openai: '', gemini: '', ollama: '' },
    activeProvider: 'anthropic',
    mood: {
      happiness: 80,
      energy: 80,
      attention: 80
    },
    lastInteraction: Date.now(),
    history: [],
    character: 'robot',
    petName: '',
    userName: '',
    bond: { xp: 0 },
    lastStage: 'baby',
    lastPet: 0,
    lastFeed: 0,
    timesFed: 0,
    lastHungerNag: 0,
    voiceEnabled: false,
    memories: [],
    badges: [],
    lastBatteryNag: 0,
    lastDiskNag: 0,
    lastFocusNag: 0,
    usage: { day: '', anthropic: { inTok: 0, outTok: 0 }, openai: { inTok: 0, outTok: 0 }, gemini: { inTok: 0, outTok: 0 }, ollama: { inTok: 0, outTok: 0 } }
  }
});

const DECAY_PER_HOUR = { happiness: 3, energy: 10, attention: 6 };
const MAX_HISTORY = 40;

const PROVIDER_IDS = ['anthropic', 'openai', 'gemini', 'ollama'];

// Older versions stored a single Anthropic-only key under `apiKey`. Fold it
// into the new per-provider map once, then drop the legacy field.
(function migrateLegacyApiKey() {
  const legacy = store.get('apiKey');
  if (legacy) {
    const keys = store.get('apiKeys');
    if (!keys.anthropic) store.set('apiKeys', { ...keys, anthropic: legacy });
    store.delete('apiKey');
  }
})();

function clamp(n) {
  return Math.max(0, Math.min(100, n));
}

function applyDecay() {
  const now = Date.now();
  const last = store.get('lastInteraction');
  const hours = (now - last) / (1000 * 60 * 60);
  if (hours <= 0) return store.get('mood');

  const mood = store.get('mood');
  const decayed = {
    happiness: clamp(mood.happiness - DECAY_PER_HOUR.happiness * hours),
    energy: clamp(mood.energy - DECAY_PER_HOUR.energy * hours),
    attention: clamp(mood.attention - DECAY_PER_HOUR.attention * hours)
  };
  store.set('mood', decayed);
  store.set('lastInteraction', now);
  return decayed;
}

function getMood() {
  return applyDecay();
}

function boostMood(delta) {
  const mood = applyDecay();
  const updated = {
    happiness: clamp(mood.happiness + (delta.happiness || 0)),
    energy: clamp(mood.energy + (delta.energy || 0)),
    attention: clamp(mood.attention + (delta.attention || 0))
  };
  store.set('mood', updated);
  store.set('lastInteraction', Date.now());
  return updated;
}

function getMoodLabel(mood) {
  const avg = (mood.happiness + mood.energy + mood.attention) / 3;
  if (avg > 75) return 'delighted';
  if (avg > 55) return 'content';
  if (avg > 35) return 'bored';
  if (avg > 15) return 'lonely';
  return 'neglected';
}

function getHistory() {
  return store.get('history');
}

function appendHistory(role, content) {
  const history = store.get('history');
  history.push({ role, content, ts: Date.now() });
  while (history.length > MAX_HISTORY) history.shift();
  store.set('history', history);
}

const ENV_FALLBACK = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', ollama: 'OLLAMA_MODEL' };

function getApiKeys() {
  return store.get('apiKeys');
}

function getApiKey(provider) {
  const keys = store.get('apiKeys');
  if (keys[provider]) return keys[provider];
  const envVar = ENV_FALLBACK[provider];
  return (envVar && process.env[envVar]) || '';
}

function setApiKey(provider, key) {
  if (!PROVIDER_IDS.includes(provider)) return;
  const keys = store.get('apiKeys');
  store.set('apiKeys', { ...keys, [provider]: key });
}

function getActiveProvider() {
  return store.get('activeProvider');
}

function setActiveProvider(provider) {
  if (!PROVIDER_IDS.includes(provider)) return;
  store.set('activeProvider', provider);
}

function getConfiguredProviders() {
  return PROVIDER_IDS.filter((p) => !!getApiKey(p));
}

function getCharacter() {
  return store.get('character');
}

function setCharacter(id) {
  store.set('character', id);
}

function getPetName() {
  return store.get('petName');
}

function setPetName(name) {
  store.set('petName', name.slice(0, 24));
}

function getUserName() {
  return store.get('userName');
}

function setUserName(name) {
  store.set('userName', name.slice(0, 24));
}

// --- Bond: a relationship level that only ever grows, unlike mood which
// decays. This is the long-term "we have history together" progress.
const BOND_LEVELS = [
  { min: 0, title: 'New Friend' },
  { min: 20, title: 'Acquaintance' },
  { min: 60, title: 'Friend' },
  { min: 150, title: 'Close Friend' },
  { min: 300, title: 'Best Friend' },
  { min: 600, title: 'Soulmate' }
];

// Evolution stage: a visual growth arc tied to bond level, but capped by how
// many times you've actually fed the character — a close relationship alone
// (lots of chatting/petting) isn't enough, it has to have been cared for.
const STAGE_RANK = { baby: 0, adult: 1, elder: 2 };
const FEED_GATE = { adult: 3, elder: 8 };

function naturalStageForLevel(level) {
  if (level <= 2) return 'baby';
  if (level <= 4) return 'adult';
  return 'elder';
}

function feedStageCap(timesFed) {
  if (timesFed < FEED_GATE.adult) return 'baby';
  if (timesFed < FEED_GATE.elder) return 'adult';
  return 'elder';
}

function stageForLevel(level, timesFed) {
  const natural = naturalStageForLevel(level);
  const cap = feedStageCap(timesFed);
  return STAGE_RANK[cap] < STAGE_RANK[natural] ? cap : natural;
}

function getBond() {
  const { xp } = store.get('bond');
  const timesFed = store.get('timesFed');
  let levelIndex = 0;
  for (let i = 0; i < BOND_LEVELS.length; i++) {
    if (xp >= BOND_LEVELS[i].min) levelIndex = i;
  }
  const current = BOND_LEVELS[levelIndex];
  const next = BOND_LEVELS[levelIndex + 1];
  const progress = next ? (xp - current.min) / (next.min - current.min) : 1;
  const level = levelIndex + 1;
  const stage = stageForLevel(level, timesFed);
  const naturalStage = naturalStageForLevel(level);
  const feedsNeeded =
    stage !== naturalStage ? (stage === 'baby' ? FEED_GATE.adult : FEED_GATE.elder) - timesFed : 0;

  return {
    xp,
    level,
    title: current.title,
    nextTitle: next ? next.title : null,
    progress: Math.max(0, Math.min(1, progress)),
    stage,
    timesFed,
    readyToEvolve: naturalStage !== stage,
    feedsNeeded: Math.max(0, feedsNeeded)
  };
}

function addBondXp(amount) {
  const bond = store.get('bond');
  store.set('bond', { xp: bond.xp + amount });
  const updated = getBond();

  const prevStage = store.get('lastStage');
  const evolved = updated.stage !== prevStage;
  if (evolved) store.set('lastStage', updated.stage);

  return { ...updated, evolved, prevStage };
}

function canPet() {
  return Date.now() - store.get('lastPet') > 2500;
}

function registerPet() {
  store.set('lastPet', Date.now());
}

const FEED_COOLDOWN_MS = 30 * 60 * 1000;

function canFeed() {
  return Date.now() - store.get('lastFeed') > FEED_COOLDOWN_MS;
}

function feedCooldownRemaining() {
  return Math.max(0, FEED_COOLDOWN_MS - (Date.now() - store.get('lastFeed')));
}

function registerFeed() {
  store.set('lastFeed', Date.now());
  store.set('timesFed', store.get('timesFed') + 1);
}

const HUNGRY_ENERGY = 40;
const HUNGER_NAG_COOLDOWN_MS = 6 * 60 * 1000;

function isHungry(mood) {
  return mood.energy < HUNGRY_ENERGY;
}

function canNagHunger() {
  return Date.now() - store.get('lastHungerNag') > HUNGER_NAG_COOLDOWN_MS;
}

function registerHungerNag() {
  store.set('lastHungerNag', Date.now());
}

function getVoiceEnabled() {
  return store.get('voiceEnabled');
}

function setVoiceEnabled(enabled) {
  store.set('voiceEnabled', !!enabled);
}

// --- Long-term memory: short facts the model chooses to save about the
// user, separate from the rolling chat history (which is capped and trimmed).
// This is what lets Buddy "remember" things weeks later.
const MAX_MEMORIES = 40;

function getMemories() {
  return store.get('memories');
}

function addMemory(text) {
  const trimmed = (text || '').trim().slice(0, 200);
  if (!trimmed) return getMemories();
  const memories = store.get('memories');
  if (memories.some((m) => m.text.toLowerCase() === trimmed.toLowerCase())) return memories;
  memories.push({ text: trimmed, ts: Date.now() });
  while (memories.length > MAX_MEMORIES) memories.shift();
  store.set('memories', memories);
  return memories;
}

function clearMemories() {
  store.set('memories', []);
}

// --- Badges: cosmetic unlocks from feeding Buddy different kinds of files,
// on top of the always-on feed-gated evolution mechanic.
const BADGES = {
  photo: { label: 'Photo Fan', emoji: '🖼️' },
  document: { label: 'Bookworm', emoji: '📄' },
  pdf: { label: 'Paper Trail', emoji: '📑' },
  video: { label: 'Movie Buff', emoji: '🎬' },
  audio: { label: 'Music Lover', emoji: '🎵' },
  code: { label: 'Code Buddy', emoji: '💻' },
  archive: { label: 'Treasure Hunter', emoji: '🗜️' },
  other: { label: 'Curious Eater', emoji: '🍽️' }
};

function getBadges() {
  return store.get('badges');
}

function unlockBadge(kind) {
  const def = BADGES[kind] || BADGES.other;
  const badges = store.get('badges');
  if (badges.includes(kind)) return { isNew: false, badge: def };
  badges.push(kind);
  store.set('badges', badges);
  return { isNew: true, badge: def };
}

// --- Proactive-alert cooldowns: same pattern as the hunger nag, one per
// nag type so battery/disk/focus nudges don't spam on top of each other.
const BATTERY_NAG_COOLDOWN_MS = 20 * 60 * 1000;
const DISK_NAG_COOLDOWN_MS = 60 * 60 * 1000;
const FOCUS_NAG_COOLDOWN_MS = 45 * 60 * 1000;

function canNagBattery() {
  return Date.now() - store.get('lastBatteryNag') > BATTERY_NAG_COOLDOWN_MS;
}
function registerBatteryNag() {
  store.set('lastBatteryNag', Date.now());
}
function canNagDisk() {
  return Date.now() - store.get('lastDiskNag') > DISK_NAG_COOLDOWN_MS;
}
function registerDiskNag() {
  store.set('lastDiskNag', Date.now());
}
function canNagFocus() {
  return Date.now() - store.get('lastFocusNag') > FOCUS_NAG_COOLDOWN_MS;
}
function registerFocusNag() {
  store.set('lastFocusNag', Date.now());
}

// --- Rough per-provider token usage, reset daily. Pricing is approximate
// (blended, order-of-magnitude) — this is meant as a "which vendor am I
// burning through" indicator, not an invoice.
const USD_PER_1K_TOKENS = {
  anthropic: { in: 0.003, out: 0.015 },
  openai: { in: 0.00015, out: 0.0006 },
  gemini: { in: 0.0, out: 0.0 }, // free tier by default
  ollama: { in: 0, out: 0 } // local, always free
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getUsage() {
  const usage = store.get('usage');
  if (usage.day !== todayKey()) {
    const reset = { day: todayKey(), anthropic: { inTok: 0, outTok: 0 }, openai: { inTok: 0, outTok: 0 }, gemini: { inTok: 0, outTok: 0 }, ollama: { inTok: 0, outTok: 0 } };
    store.set('usage', reset);
    return reset;
  }
  return usage;
}

function addUsage(provider, inTok, outTok) {
  if (!PROVIDER_IDS.includes(provider)) return;
  const usage = getUsage();
  const current = usage[provider] || { inTok: 0, outTok: 0 };
  usage[provider] = { inTok: current.inTok + (inTok || 0), outTok: current.outTok + (outTok || 0) };
  store.set('usage', usage);
}

function getUsageSummary() {
  const usage = getUsage();
  return PROVIDER_IDS.map((p) => {
    const { inTok, outTok } = usage[p] || { inTok: 0, outTok: 0 };
    const rate = USD_PER_1K_TOKENS[p] || { in: 0, out: 0 };
    const costUSD = (inTok / 1000) * rate.in + (outTok / 1000) * rate.out;
    return { provider: p, inTok, outTok, costUSD: Math.round(costUSD * 10000) / 10000 };
  });
}

module.exports = {
  getMood,
  boostMood,
  getMoodLabel,
  getHistory,
  appendHistory,
  getApiKeys,
  getApiKey,
  setApiKey,
  getActiveProvider,
  setActiveProvider,
  getConfiguredProviders,
  PROVIDER_IDS,
  getCharacter,
  setCharacter,
  getPetName,
  setPetName,
  getUserName,
  setUserName,
  getBond,
  addBondXp,
  canPet,
  registerPet,
  canFeed,
  feedCooldownRemaining,
  registerFeed,
  isHungry,
  canNagHunger,
  registerHungerNag,
  getVoiceEnabled,
  setVoiceEnabled,
  getMemories,
  addMemory,
  clearMemories,
  getBadges,
  unlockBadge,
  canNagBattery,
  registerBatteryNag,
  canNagDisk,
  registerDiskNag,
  canNagFocus,
  registerFocusNag,
  getUsage,
  addUsage,
  getUsageSummary
};
