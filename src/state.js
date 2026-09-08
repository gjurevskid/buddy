const Store = require('electron-store');

const store = new Store({
  defaults: {
    apiKeys: { anthropic: '', openai: '', gemini: '' },
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
    voiceEnabled: false
  }
});

const DECAY_PER_HOUR = { happiness: 3, energy: 10, attention: 6 };
const MAX_HISTORY = 40;

const PROVIDER_IDS = ['anthropic', 'openai', 'gemini'];

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

const ENV_FALLBACK = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };

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
  setVoiceEnabled
};
