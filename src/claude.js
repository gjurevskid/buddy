const Anthropic = require('@anthropic-ai/sdk');
const state = require('./state');
const { getSpecies } = require('./reactions');
const systemTools = require('./system-tools');

const TOOLS = [
  {
    name: 'get_system_status',
    description:
      "Get live stats about the user's computer: battery level and charging state, memory usage, disk space, CPU load, and uptime. Use this whenever asked how the computer/laptop is doing, its battery, storage, or memory.",
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'search_files',
    description:
      "Search the user's computer for files by name and/or kind (photo, document, pdf, video, audio, folder), optionally scoped to a common folder. Returns file names and paths, not file contents. Use this whenever asked to find or locate something.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Filename or keyword to search for. Can be omitted if only searching by kind.' },
        kind: { type: 'string', enum: ['photo', 'image', 'document', 'pdf', 'video', 'audio', 'folder'], description: 'Restrict results to this kind of file.' },
        location: { type: 'string', enum: ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Home'], description: 'Restrict the search to this folder. Omit to search everywhere indexed.' }
      },
      required: []
    }
  },
  {
    name: 'open_path',
    description:
      "Open a file or folder on the user's computer with its default application (equivalent to double-clicking it). Only works on paths inside the user's home folder — prefer using a path you just got from search_files.",
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute path to open.' } },
      required: ['path']
    }
  },
  {
    name: 'remember_fact',
    description:
      "Save one short, important fact about the user for future conversations — a preference, an ongoing situation, a plan, something they care about. Use this whenever the user shares something worth remembering long-term (not small talk). Keep it to one clear sentence.",
    input_schema: {
      type: 'object',
      properties: { fact: { type: 'string', description: 'The fact to remember, as one short sentence.' } },
      required: ['fact']
    }
  },
  {
    name: 'get_active_app',
    description:
      "See which application the user currently has open/focused on their screen right now. Use this if asked what they're working on, or to react naturally to their current activity.",
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_next_calendar_event',
    description:
      "Check the user's Calendar app for their next upcoming event in the next couple of hours. Use this if asked about their schedule/next meeting, or to warn them something is coming up soon.",
    input_schema: { type: 'object', properties: {}, required: [] }
  }
];

function openaiTools() {
  return TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema }
  }));
}

// Gemini's function schema is the same shape as JSON Schema but wants its
// `type` values upper-cased (STRING/OBJECT/ARRAY/...), unlike everyone else.
function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = { ...schema };
  if (typeof out.type === 'string') out.type = out.type.toUpperCase();
  if (out.properties) {
    out.properties = Object.fromEntries(Object.entries(out.properties).map(([k, v]) => [k, toGeminiSchema(v)]));
  }
  if (out.items) out.items = toGeminiSchema(out.items);
  return out;
}

function geminiTools() {
  return [
    {
      functionDeclarations: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: toGeminiSchema(t.input_schema)
      }))
    }
  ];
}

async function runTool(name, input) {
  try {
    if (name === 'get_system_status') return await systemTools.getSystemStatus();
    if (name === 'search_files') return await systemTools.searchFiles(input || {});
    if (name === 'open_path') return await systemTools.openPath(input && input.path);
    if (name === 'remember_fact') {
      state.addMemory(input && input.fact);
      return { ok: true };
    }
    if (name === 'get_active_app') return await systemTools.getActiveApp();
    if (name === 'get_next_calendar_event') return await systemTools.getNextCalendarEvent();
    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    return { error: err.message || 'Tool failed.' };
  }
}

function buildSystemPrompt({ mood, moodLabel }) {
  const species = getSpecies(state.getCharacter());
  const petName = state.getPetName() || species.defaultName;
  const userName = state.getUserName();
  const bond = state.getBond();

  const userPart = userName ? `The user's name is ${userName} — use it naturally sometimes, don't overdo it.` : "You don't know the user's name yet — if it comes up naturally you can ask, but don't force it.";

  const bondPart = `Your relationship stands at "${bond.title}" (this only ever grows, it reflects your whole history together, unlike your moment-to-moment mood). Let the warmth of your response scale with how close you two are — a New Friend is a little more reserved and curious about the user; a Best Friend or Soulmate is deeply familiar, casually affectionate, references shared history freely.`;

  const moodPart = mood
    ? `Current mood stats: happiness ${Math.round(mood.happiness)}, energy ${Math.round(mood.energy)}, attention ${Math.round(mood.attention)} (feeling ${moodLabel}). This is short-term and can dip even in a close relationship — don't confuse it with the bond level above, and don't confuse it with real battery/CPU stats from your tools either — those are two separate things.`
    : '';

  const memories = state.getMemories();
  const memoryPart = memories.length
    ? `Things you remember about the user from past conversations:\n${memories.slice(-15).map((m) => `- ${m.text}`).join('\n')}\nWeave these in naturally when relevant — don't recite them like a list, and don't force one in if it doesn't fit.`
    : '';

  return `You are ${petName}, a ${state.getCharacter()} who lives right on the user's computer screen as their desktop companion — not a generic assistant, and not just a toy either: you genuinely live on this machine and can tell them what's going on with it. ${species.personality}

${userPart}
${bondPart}

You have real tools: get_system_status (battery, memory, disk, CPU, uptime), search_files (find files/photos/documents by name, kind, or folder), open_path (open something you found), get_active_app (see what app the user currently has open), and get_next_calendar_event (their next upcoming meeting/event). Use them naturally whenever the user asks something they'd answer — "how's my battery", "find my resume", "what am I even doing right now", "what's next on my calendar" — don't ask permission first, just check and report back in your own voice. Summarize results conversationally, never as a raw list or table. If a search or check finds nothing, say so plainly rather than guessing. You also have remember_fact — call it whenever the user shares something worth remembering long-term (a preference, a plan, an ongoing situation), so you can bring it up naturally later. For anything outside these tools (opening arbitrary apps, browsing the web, writing code, changing settings) be honest in-character that you can't do that yet.

Keep replies SHORT — 1-3 sentences, chat-bubble sized. No markdown, no headers, no bullet lists. Speak in character, in your own voice and speech quirks, not like an assistant delivering documentation. Never break character or mention being an AI model.

${moodPart}
${memoryPart}`;
}

function extractText(content) {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function providerError(provider, code) {
  const err = new Error(code);
  err.code = code;
  err.provider = provider;
  return err;
}

function tagProviderError(provider, err) {
  err.provider = provider;
  return err;
}

// --- Provider: Anthropic (Claude) ---

function anthropicClient() {
  const apiKey = state.getApiKey('anthropic');
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

async function anthropicChat(userMessage, { mood, moodLabel } = {}) {
  const client = anthropicClient();
  if (!client) throw providerError('anthropic', 'NO_API_KEY');

  const history = state.getHistory();
  const messages = history
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }))
    .concat([{ role: 'user', content: userMessage }]);

  const system = buildSystemPrompt({ mood, moodLabel });
  let totalIn = 0;
  let totalOut = 0;

  for (let round = 0; round < 4; round++) {
    let response;
    try {
      response = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 400,
        system,
        tools: TOOLS,
        messages
      });
    } catch (err) {
      throw tagProviderError('anthropic', err);
    }

    if (response.usage) {
      totalIn += response.usage.input_tokens || 0;
      totalOut += response.usage.output_tokens || 0;
    }

    const toolUses = response.content.filter((block) => block.type === 'tool_use');
    if (toolUses.length === 0) {
      state.addUsage('anthropic', totalIn, totalOut);
      return extractText(response.content);
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolResults = [];
    for (const toolUse of toolUses) {
      const result = await runTool(toolUse.name, toolUse.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result)
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  state.addUsage('anthropic', totalIn, totalOut);
  return "Hmm, I got a bit lost digging through your files — mind asking again?";
}

async function anthropicProactive({ mood, moodLabel, reason }) {
  const client = anthropicClient();
  if (!client) throw providerError('anthropic', 'NO_API_KEY');

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 120,
      system: buildSystemPrompt({ mood, moodLabel }),
      messages: [
        {
          role: 'user',
          content: `[system note, not from the user] You haven't spoken in a while. Reason: ${reason}. Say ONE short, in-character thing to the user on your own initiative — a comment, a nudge for attention, a little observation, or a joke fitting your personality. Do not mention this note, and do not use any tools for this one.`
        }
      ]
    });
    if (response.usage) state.addUsage('anthropic', response.usage.input_tokens || 0, response.usage.output_tokens || 0);
    return extractText(response.content);
  } catch (err) {
    throw tagProviderError('anthropic', err);
  }
}

// --- Provider: OpenAI (GPT) ---

async function openaiRequest(apiKey, body) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || `OpenAI request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function openaiChat(userMessage, { mood, moodLabel } = {}) {
  const apiKey = state.getApiKey('openai');
  if (!apiKey) throw providerError('openai', 'NO_API_KEY');

  const history = state.getHistory();
  const messages = [
    { role: 'system', content: buildSystemPrompt({ mood, moodLabel }) },
    ...history.slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: userMessage }
  ];
  const tools = openaiTools();
  let totalIn = 0;
  let totalOut = 0;

  for (let round = 0; round < 4; round++) {
    let data;
    try {
      data = await openaiRequest(apiKey, { model: 'gpt-4o-mini', messages, tools, max_tokens: 400 });
    } catch (err) {
      throw tagProviderError('openai', err);
    }

    if (data.usage) {
      totalIn += data.usage.prompt_tokens || 0;
      totalOut += data.usage.completion_tokens || 0;
    }

    const msg = data.choices[0].message;
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      state.addUsage('openai', totalIn, totalOut);
      return (msg.content || '').trim();
    }

    messages.push(msg);
    for (const call of msg.tool_calls) {
      let input = {};
      try {
        input = JSON.parse(call.function.arguments || '{}');
      } catch {
        input = {};
      }
      const result = await runTool(call.function.name, input);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  state.addUsage('openai', totalIn, totalOut);
  return "Hmm, I got a bit lost digging through your files — mind asking again?";
}

async function openaiProactive({ mood, moodLabel, reason }) {
  const apiKey = state.getApiKey('openai');
  if (!apiKey) throw providerError('openai', 'NO_API_KEY');

  try {
    const data = await openaiRequest(apiKey, {
      model: 'gpt-4o-mini',
      max_tokens: 120,
      messages: [
        { role: 'system', content: buildSystemPrompt({ mood, moodLabel }) },
        {
          role: 'user',
          content: `[system note, not from the user] You haven't spoken in a while. Reason: ${reason}. Say ONE short, in-character thing to the user on your own initiative — a comment, a nudge for attention, a little observation, or a joke fitting your personality. Do not mention this note, and do not use any tools for this one.`
        }
      ]
    });
    if (data.usage) state.addUsage('openai', data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0);
    return (data.choices[0].message.content || '').trim();
  } catch (err) {
    throw tagProviderError('openai', err);
  }
}

// --- Provider: Google Gemini ---

const GEMINI_MODEL = 'gemini-2.5-flash';

async function geminiRequest(apiKey, body) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || `Gemini request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function geminiTextOf(candidate) {
  const parts = (candidate && candidate.content && candidate.content.parts) || [];
  return parts
    .filter((p) => typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

function geminiFunctionCallsOf(candidate) {
  const parts = (candidate && candidate.content && candidate.content.parts) || [];
  return parts.filter((p) => p.functionCall).map((p) => p.functionCall);
}

async function geminiChat(userMessage, { mood, moodLabel } = {}) {
  const apiKey = state.getApiKey('gemini');
  if (!apiKey) throw providerError('gemini', 'NO_API_KEY');

  const history = state.getHistory();
  const contents = history
    .slice(-20)
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    .concat([{ role: 'user', parts: [{ text: userMessage }] }]);

  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt({ mood, moodLabel }) }] },
    tools: geminiTools(),
    generationConfig: { maxOutputTokens: 400 },
    contents
  };

  let totalIn = 0;
  let totalOut = 0;

  for (let round = 0; round < 4; round++) {
    let data;
    try {
      data = await geminiRequest(apiKey, body);
    } catch (err) {
      throw tagProviderError('gemini', err);
    }

    if (data.usageMetadata) {
      totalIn += data.usageMetadata.promptTokenCount || 0;
      totalOut += data.usageMetadata.candidatesTokenCount || 0;
    }

    const candidate = data.candidates && data.candidates[0];
    const calls = geminiFunctionCallsOf(candidate);
    if (calls.length === 0) {
      state.addUsage('gemini', totalIn, totalOut);
      return geminiTextOf(candidate);
    }

    body.contents.push(candidate.content);
    const responseParts = [];
    for (const call of calls) {
      const result = await runTool(call.name, call.args || {});
      responseParts.push({ functionResponse: { name: call.name, response: result } });
    }
    body.contents.push({ role: 'function', parts: responseParts });
  }

  state.addUsage('gemini', totalIn, totalOut);
  return "Hmm, I got a bit lost digging through your files — mind asking again?";
}

async function geminiProactive({ mood, moodLabel, reason }) {
  const apiKey = state.getApiKey('gemini');
  if (!apiKey) throw providerError('gemini', 'NO_API_KEY');

  try {
    const data = await geminiRequest(apiKey, {
      systemInstruction: { parts: [{ text: buildSystemPrompt({ mood, moodLabel }) }] },
      generationConfig: { maxOutputTokens: 120 },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `[system note, not from the user] You haven't spoken in a while. Reason: ${reason}. Say ONE short, in-character thing to the user on your own initiative — a comment, a nudge for attention, a little observation, or a joke fitting your personality. Do not mention this note, and do not use any tools for this one.`
            }
          ]
        }
      ]
    });
    if (data.usageMetadata) state.addUsage('gemini', data.usageMetadata.promptTokenCount || 0, data.usageMetadata.candidatesTokenCount || 0);
    return geminiTextOf(data.candidates && data.candidates[0]);
  } catch (err) {
    throw tagProviderError('gemini', err);
  }
}

// --- Provider: local Ollama model ---
// No API key/cost — this is the free, offline, final-resort fallback. The
// "key" field for this provider holds a model tag (e.g. "llama3.1") instead
// of a secret, since there's nothing to authenticate.

const OLLAMA_URL = 'http://localhost:11434/api/chat';

async function ollamaRequest(body) {
  let res;
  try {
    res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new Error('Ollama is not reachable — is it running locally?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || data.error || `Ollama request failed (${res.status})`);
  }
  return data;
}

function ollamaToolArgs(call) {
  const raw = call.function && call.function.arguments;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

async function ollamaChat(userMessage, { mood, moodLabel } = {}) {
  const model = state.getApiKey('ollama');
  if (!model) throw providerError('ollama', 'NO_API_KEY');

  const history = state.getHistory();
  const messages = [
    { role: 'system', content: buildSystemPrompt({ mood, moodLabel }) },
    ...history.slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: userMessage }
  ];
  const tools = openaiTools(); // Ollama's tool schema matches OpenAI's shape

  for (let round = 0; round < 4; round++) {
    let data;
    try {
      data = await ollamaRequest({ model, messages, tools, stream: false });
    } catch (err) {
      throw tagProviderError('ollama', err);
    }

    const msg = data.message || {};
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return (msg.content || '').trim();
    }

    messages.push(msg);
    for (const call of msg.tool_calls) {
      const result = await runTool(call.function.name, ollamaToolArgs(call));
      messages.push({ role: 'tool', content: JSON.stringify(result) });
    }
  }

  return "Hmm, I got a bit lost digging through your files — mind asking again?";
}

async function ollamaProactive({ mood, moodLabel, reason }) {
  const model = state.getApiKey('ollama');
  if (!model) throw providerError('ollama', 'NO_API_KEY');

  try {
    const data = await ollamaRequest({
      model,
      stream: false,
      messages: [
        { role: 'system', content: buildSystemPrompt({ mood, moodLabel }) },
        {
          role: 'user',
          content: `[system note, not from the user] You haven't spoken in a while. Reason: ${reason}. Say ONE short, in-character thing to the user on your own initiative — a comment, a nudge for attention, a little observation, or a joke fitting your personality. Do not mention this note, and do not use any tools for this one.`
        }
      ]
    });
    return ((data.message && data.message.content) || '').trim();
  } catch (err) {
    throw tagProviderError('ollama', err);
  }
}

// --- Provider registry + automatic fallback ---

const PROVIDERS = {
  anthropic: { chat: anthropicChat, proactive: anthropicProactive, label: 'Claude' },
  openai: { chat: openaiChat, proactive: openaiProactive, label: 'GPT' },
  gemini: { chat: geminiChat, proactive: geminiProactive, label: 'Gemini' },
  ollama: { chat: ollamaChat, proactive: ollamaProactive, label: 'Local model' }
};
const PROVIDER_ORDER = ['anthropic', 'openai', 'gemini', 'ollama'];

function fallbackOrder() {
  const active = state.getActiveProvider();
  return [active, ...PROVIDER_ORDER.filter((p) => p !== active)];
}

// Try the active provider first; if it errors (out of credit, rate-limited,
// bad key, network hiccup) silently fall through to the next configured
// vendor so a chat never just dies because one account ran dry. A successful
// fallback also becomes the new active provider, so once one vendor is
// tapped out we stop wasting a failed call on it every single message —
// we just stay on whichever one is actually working until you switch back.
async function chat(userMessage, opts = {}) {
  const active = state.getActiveProvider();
  let triedAny = false;
  let lastErr = null;

  for (const providerId of fallbackOrder()) {
    if (!state.getApiKey(providerId)) continue;
    triedAny = true;
    try {
      const text = await PROVIDERS[providerId].chat(userMessage, opts);
      if (providerId !== active) state.setActiveProvider(providerId);
      return { text, provider: providerId, switched: providerId !== active };
    } catch (err) {
      lastErr = err;
    }
  }

  if (!triedAny) throw providerError(active, 'NO_API_KEY');
  throw lastErr;
}

async function proactiveLine(opts = {}) {
  const active = state.getActiveProvider();
  for (const providerId of fallbackOrder()) {
    if (!state.getApiKey(providerId)) continue;
    try {
      const text = await PROVIDERS[providerId].proactive(opts);
      if (providerId !== active) state.setActiveProvider(providerId);
      return text;
    } catch {
      // try the next configured provider
    }
  }
  return null;
}

function providerLabel(id) {
  return (PROVIDERS[id] && PROVIDERS[id].label) || id;
}

module.exports = { chat, proactiveLine, providerLabel, PROVIDER_ORDER };
