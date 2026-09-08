const log = document.getElementById('log');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const closeBtn = document.getElementById('closeBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const keyRow = document.getElementById('keyRow');
const showKeyRowBtn = document.getElementById('showKeyRowBtn');
const providerList = document.getElementById('providerList');
const mHappiness = document.getElementById('mHappiness');
const mEnergy = document.getElementById('mEnergy');
const mAttention = document.getElementById('mAttention');
const picker = document.getElementById('picker');
const welcomeRow = document.getElementById('welcomeRow');
const userNameInput = document.getElementById('userNameInput');
const saveUserNameBtn = document.getElementById('saveUserNameBtn');
const petNameLabel = document.getElementById('petNameLabel');
const petNameInput = document.getElementById('petNameInput');
const savePetNameBtn = document.getElementById('savePetNameBtn');
const bondFill = document.getElementById('bondFill');
const bondTitle = document.getElementById('bondTitle');
const feedBtn = document.getElementById('feedBtn');
const voiceBtn = document.getElementById('voiceBtn');
const badgeRow = document.getElementById('badgeRow');
const showMemoryRowBtn = document.getElementById('showMemoryRowBtn');
const memoryRow = document.getElementById('memoryRow');
const memoryList = document.getElementById('memoryList');
const clearMemoryBtn = document.getElementById('clearMemoryBtn');
const usageSummary = document.getElementById('usageSummary');
const quitBtn = document.getElementById('quitBtn');

let hasApiKey = false;
let currentCharacter = 'robot';
let voiceEnabled = false;
let keysSet = { anthropic: false, openai: false, gemini: false, ollama: false };
let activeProvider = 'anthropic';

const PROVIDER_META = {
  anthropic: { label: 'Claude (Anthropic)', placeholder: 'Paste Anthropic API key' },
  openai: { label: 'GPT (OpenAI)', placeholder: 'Paste OpenAI API key' },
  gemini: { label: 'Gemini (Google)', placeholder: 'Paste Google AI Studio key' },
  ollama: { label: 'Local model (Ollama)', placeholder: 'Model name, e.g. llama3.1' }
};

function renderProviderList() {
  providerList.innerHTML = '';
  Object.keys(PROVIDER_META).forEach((id) => {
    const meta = PROVIDER_META[id];
    const row = document.createElement('div');
    row.className = 'providerRow';

    const top = document.createElement('div');
    top.className = 'providerRowTop';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'activeProvider';
    radio.checked = activeProvider === id;
    radio.disabled = !keysSet[id];
    radio.addEventListener('change', async () => {
      activeProvider = id;
      await window.buddy.setActiveProvider(id);
    });

    const label = document.createElement('span');
    label.className = 'providerLabel';
    label.textContent = `${keysSet[id] ? '🟢' : '⚪'} ${meta.label}`;

    top.appendChild(radio);
    top.appendChild(label);

    const inputRow = document.createElement('div');
    inputRow.className = 'providerInputRow';
    const input = document.createElement('input');
    input.type = id === 'ollama' ? 'text' : 'password';
    input.placeholder = meta.placeholder;
    const saveBtn = document.createElement('button');
    saveBtn.textContent = keysSet[id] ? 'Update' : 'Save';
    saveBtn.addEventListener('click', async () => {
      const key = input.value.trim();
      if (!key) return;
      const result = await window.buddy.setApiKey(id, key);
      keysSet[id] = true;
      hasApiKey = result.configuredProviders.length > 0;
      input.value = '';
      if (!Object.values(keysSet).some(Boolean)) return;
      // First key configured for any provider auto-becomes active if none was usable yet.
      if (!keysSet[activeProvider]) {
        activeProvider = id;
        await window.buddy.setActiveProvider(id);
      }
      renderProviderList();
      appendLog('assistant', `Got it — ${meta.label} is connected now.`);
    });
    inputRow.appendChild(input);
    inputRow.appendChild(saveBtn);

    row.appendChild(top);
    row.appendChild(inputRow);
    providerList.appendChild(row);
  });
}

function renderUsage(usage) {
  if (!usage || !usage.length) {
    usageSummary.innerHTML = '';
    return;
  }
  const spent = usage.filter((u) => u.inTok + u.outTok > 0);
  if (!spent.length) {
    usageSummary.textContent = 'No usage yet today.';
    return;
  }
  usageSummary.textContent =
    'Today (est.): ' +
    spent.map((u) => `${PROVIDER_META[u.provider]?.label.split(' ')[0] || u.provider} $${u.costUSD.toFixed(3)}`).join(' · ');
}

const BADGE_META = {
  photo: { label: 'Photo Fan', emoji: '🖼️' },
  document: { label: 'Bookworm', emoji: '📄' },
  pdf: { label: 'Paper Trail', emoji: '📑' },
  video: { label: 'Movie Buff', emoji: '🎬' },
  audio: { label: 'Music Lover', emoji: '🎵' },
  code: { label: 'Code Buddy', emoji: '💻' },
  archive: { label: 'Treasure Hunter', emoji: '🗜️' },
  other: { label: 'Curious Eater', emoji: '🍽️' }
};

function renderBadges(badges) {
  badgeRow.innerHTML = '';
  (badges || []).forEach((kind) => {
    const meta = BADGE_META[kind] || BADGE_META.other;
    const span = document.createElement('span');
    span.className = 'badgeChip';
    span.title = meta.label;
    span.textContent = `${meta.emoji} ${meta.label}`;
    badgeRow.appendChild(span);
  });
}

function renderMemories(memories) {
  memoryList.innerHTML = '';
  if (!memories || !memories.length) {
    memoryList.textContent = 'Nothing remembered yet — mention something worth keeping in mind and Buddy will save it.';
    return;
  }
  memories
    .slice()
    .reverse()
    .forEach((m) => {
      const div = document.createElement('div');
      div.className = 'memoryItem';
      div.textContent = m.text;
      memoryList.appendChild(div);
    });
}

function renderVoice(enabled) {
  voiceBtn.textContent = enabled ? '🔊 Voice' : '🔇 Voice';
  voiceBtn.title = enabled
    ? 'Buddy speaks replies out loud — click to silence it'
    : 'Buddy stays quiet — click to let it speak replies out loud';
}

function renderMood(mood) {
  mHappiness.style.width = `${mood.happiness}%`;
  mEnergy.style.width = `${mood.energy}%`;
  mAttention.style.width = `${mood.attention}%`;
}

const STAGE_BADGE = { baby: '🐣', adult: '🌿', elder: '✨' };

function renderBond(bond) {
  bondFill.style.width = `${bond.progress * 100}%`;
  const label = `${STAGE_BADGE[bond.stage] || ''} ${bond.title}`.trim();
  bondTitle.textContent =
    bond.readyToEvolve && bond.feedsNeeded > 0
      ? `${label} · 🍎 feed ${bond.feedsNeeded} more to evolve`
      : label;
}

function renderPicker() {
  picker.innerHTML = '';
  window.Characters.list.forEach(({ id, emoji, label }) => {
    const btn = document.createElement('button');
    btn.className = `pickerOption${id === currentCharacter ? ' active' : ''}`;
    btn.textContent = emoji;
    btn.title = label;
    btn.addEventListener('click', async () => {
      currentCharacter = id;
      await window.buddy.setCharacter(id);
      renderPicker();
    });
    picker.appendChild(btn);
  });
}

function appendLog(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

async function init() {
  const initState = await window.buddy.getInitState();
  hasApiKey = initState.hasApiKey;
  keysSet = initState.keysSet || keysSet;
  activeProvider = initState.activeProvider || 'anthropic';
  currentCharacter = initState.character || 'robot';
  renderMood(initState.mood);
  renderBond(initState.bond);
  voiceEnabled = !!initState.voiceEnabled;
  renderVoice(voiceEnabled);
  renderPicker();
  renderProviderList();
  renderUsage(initState.usage);
  renderBadges(initState.badges);
  renderMemories(initState.memories);
  petNameLabel.textContent = initState.petName;
  petNameInput.value = initState.petName;
  welcomeRow.classList.toggle('hidden', !!initState.userName);

  // Without a key nothing else works — open settings and surface it directly
  // rather than leaving a new user to go hunting for the gear icon.
  if (!hasApiKey) {
    settingsPanel.classList.remove('hidden');
    keyRow.classList.remove('hidden');
  }

  const history = initState.history || [];
  history.slice(-10).forEach((m) => appendLog(m.role, m.content));

  if (!hasApiKey) {
    appendLog('assistant', "Hi! I'm Buddy. Paste an API key below (Claude, GPT, or Gemini) so I can talk properly.");
  }
}

async function sendCurrentText() {
  const text = textInput.value.trim();
  if (!text) return;
  textInput.value = '';
  window.buddy.notifyUserActive();
  appendLog('user', text);

  if (!hasApiKey) {
    appendLog('assistant', 'I still need an API key first — paste one below!');
    return;
  }

  const result = await window.buddy.sendMessage(text);
  if (result.ok) {
    if (result.switched) {
      activeProvider = result.provider;
      renderProviderList();
      appendLog('assistant', `(out of tokens on the other one — switched to ${PROVIDER_META[result.provider]?.label || result.provider})`);
    }
    appendLog('assistant', result.reply);
    renderMood(result.mood);
    renderUsage(result.usage);
  } else if (result.error === 'NO_API_KEY') {
    hasApiKey = false;
    settingsPanel.classList.remove('hidden');
    keyRow.classList.remove('hidden');
    appendLog('assistant', 'I need a valid API key to reply — paste one below.');
  } else {
    appendLog('assistant', "Hmm, I couldn't reach Claude just now. Try again in a bit?");
  }
}

sendBtn.addEventListener('click', sendCurrentText);
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendCurrentText();
});

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

showKeyRowBtn.addEventListener('click', () => {
  keyRow.classList.toggle('hidden');
});

showMemoryRowBtn.addEventListener('click', () => {
  memoryRow.classList.toggle('hidden');
});

clearMemoryBtn.addEventListener('click', async () => {
  await window.buddy.clearMemories();
  renderMemories([]);
  appendLog('assistant', "Okay, I've cleared everything I remembered about you.");
});

saveUserNameBtn.addEventListener('click', async () => {
  const name = userNameInput.value.trim();
  if (!name) return;
  await window.buddy.setUserName(name);
  welcomeRow.classList.add('hidden');
  appendLog('assistant', `${name}! Good to properly meet you.`);
});
userNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveUserNameBtn.click();
});

savePetNameBtn.addEventListener('click', async () => {
  const name = petNameInput.value.trim();
  if (!name) return;
  await window.buddy.setPetName(name);
  petNameLabel.textContent = name;
});
petNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') savePetNameBtn.click();
});

feedBtn.addEventListener('click', async () => {
  window.buddy.notifyUserActive();
  const result = await window.buddy.feedPet();
  if (result.ok) {
    appendLog('assistant', result.line);
    renderMood(result.mood);
    renderBond(result.bond);
  } else {
    const mins = Math.ceil((result.remainingMs || 0) / 60000);
    appendLog('assistant', `Not hungry yet — try again in about ${mins} min.`);
  }
});

voiceBtn.addEventListener('click', async () => {
  voiceEnabled = !voiceEnabled;
  renderVoice(voiceEnabled);
  await window.buddy.setVoiceEnabled(voiceEnabled);
});

closeBtn.addEventListener('click', () => {
  window.buddy.closeChat();
});

quitBtn.addEventListener('click', () => {
  window.buddy.quitApp();
});

// --- Voice input (Web Speech API, built into Chromium) ---
let recognition = null;
let listening = false;

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = 'Voice input not supported';
    return;
  }
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    textInput.value = transcript;
    sendCurrentText();
  };
  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove('listening');
  };
  recognition.onerror = () => {
    listening = false;
    micBtn.classList.remove('listening');
  };
}

micBtn.addEventListener('click', () => {
  window.buddy.notifyUserActive();
  if (!recognition) return;
  if (listening) {
    recognition.stop();
    return;
  }
  listening = true;
  micBtn.classList.add('listening');
  recognition.start();
});

window.buddy.onMoodChanged(({ mood }) => {
  renderMood(mood);
});

window.buddy.onBondChanged((bond) => {
  renderBond(bond);
});

window.buddy.onVoiceChanged((enabled) => {
  voiceEnabled = !!enabled;
  renderVoice(voiceEnabled);
});

window.buddy.onCharacterChanged((id) => {
  currentCharacter = id;
  renderPicker();
});

setupSpeechRecognition();
init();
