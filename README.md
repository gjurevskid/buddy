# Buddy — a desktop companion

A small character that actually lives and roams on your desktop, like a tamagotchi.
It walks around, jumps, falls asleep when tired, wakes up when you interact with it, and
opens a chat window when you click it — by text or voice. Its mood decays over time and
recovers when you pay attention to it, and it'll occasionally pipe up on its own if
you've ignored it for a while.

## Run it

```bash
npm install
npm start
```

On first launch, click the character to open chat and paste an Anthropic API key into
the field. The key is stored locally via `electron-store` and never leaves your machine
except to call the Anthropic API directly.

## It actually knows your computer

Buddy has real, read-only tools — via Claude's tool-use — so it can answer things about
the machine it lives on, not just chat in the abstract:

- **"How's my battery / storage / memory doing?"** → `get_system_status` reads real
  battery %, disk space, memory, CPU load, and uptime (macOS, via `pmset`/`df`/`vm_stat`).
- **"Find my resume" / "where are my vacation photos?"** → `search_files` uses Spotlight
  (`mdfind`) to search by name and/or kind (photo, document, pdf, video, audio, folder),
  optionally scoped to Desktop/Documents/Downloads/Pictures/Home. Returns paths and basic
  metadata only — it never reads file contents.
- **"Open it"** → `open_path` opens a file/folder with its default app (like a Finder
  double-click). It's restricted to paths inside your home folder and validates the path
  exists first — it won't touch system files or open anything outside `~/`.

All three run via `execFile` with fixed argument arrays (no shell string-building), so
there's no injection surface even from unusual search text. See `src/system-tools.js` for
the implementation and `src/claude.js` for the tool-use loop.

## Two windows

- **The pet** — a small transparent window with just the character. It roams freely
  around your screen: walks, jumps, idles, looks around, and sleeps when its energy runs
  low (regenerating while asleep). Drag it to move it manually; **single-click to pet it**
  (a heart pops, a quick in-character reaction, a small mood/bond bump — no API call, so
  it's instant); **double-click to open chat**.
- **Chat** — a separate panel that pops up near the pet when you click it. Identity (its
  name + your bond level), mood bars, character picker, a 🍎 feed button, text/voice
  input, and the API key field all live here. Close it with the ✕ and the pet resumes
  wandering.

## Making it feel like an actual pet, not a chatbot

- **It has a name, and so do you.** First time you open chat it asks your name and
  remembers it. Click its name in the chat header to rename it — Claude uses both in
  conversation.
- **Distinct personalities per species**, not one generic voice: the fox is playful and
  mischievous, the robot is earnest and literal ("Affection sensors: activated."), the
  dwarf is gruff-but-warm, the cat is aloof-but-secretly-attached, the owl is calm and
  a little proverbial. This shapes both its Claude conversations and its instant
  petting/feeding reaction lines.
- **A bond level that only ever grows.** Unlike mood (which decays and recovers hour to
  hour), the bond bar in chat — New Friend → Acquaintance → Friend → Close Friend → Best
  Friend → Soulmate — is permanent relationship progress from petting, feeding, and
  chatting. Claude is told your current bond level and adjusts warmth/familiarity
  accordingly, so a Soulmate-level pet talks to you differently than a New Friend does.
- **Feeding** (🍎 in chat, ~30 min cooldown) is a small caretaking ritual distinct from
  chatting — restores energy, nudges happiness, and grows the bond, with its own
  in-character reaction line.
- **It literally grows up — but only if you actually feed it.** The bond level makes a
  stage *eligible* (🐣 baby → 🌿 adult → ✨ elder), but the real gate is how many times
  you've fed it: 3 feedings to reach adult, 8 to reach elder. A pet you only chat with or
  pet — never feed — stays a baby forever, no matter how high the bond climbs; the bar in
  chat shows "🍎 feed N more to evolve" when that's what's blocking it. Crossing a real
  stage plays a one-time celebration (sparkle burst + an in-character line), which
  naturally happens right on the feeding that finally satisfies the gate.
- **It gets hungry and says so, in its own voice.** When energy drops low, it doesn't
  wait for you to notice — every ~45s while hungry it has a chance to ask for food itself
  (no API call, instant), phrased in-character: the fox begs ("My tummy's rumbling... got
  a snack?"), the robot reports it clinically ("Power reserves at low capacity."), the
  dwarf grumbles, the cat pretends not to care, the owl asks gently.

## Characters & gaits

Six characters — elf 🧝, robot 🤖, ghost 👻, dog 🐶, cat 🐱, owl 🦉 — each with its own
hand-built SVG art and its own **gait**, not just a shared walk cycle. The illustration
style is naturalistic rather than cartoon-sticker: no hard outlines around silhouettes
(edges come from the gradient's own falloff), muted natural colors instead of bright toy
tones, real-looking eyes (an actual iris color, dark pupil, one soft catchlight — not the
oversized double-glint "cute" convention), and a few short texture strokes suggesting fur
or feather direction on the organic characters.

- **Elf / dog / cat** — organic bounce with ease-in/ease-out acceleration
- **Robot** — rigid, quantized mechanical steps (CSS `steps()` easing, discrete position ticks)
- **Owl** — hops rather than slides — advances only on the "up" half of each bounce; its big
  round eyes are actually the realistic choice here, real owls have huge eyes for their size
- **Ghost** — floats continuously (no footsteps, no ground-impact bob, a much fainter
  contact shadow) — the one character that never touches the ground

Switch characters via the 🎭 button in chat, or the tray menu's Character submenu. Your
pick is remembered. Idle moments include occasional random head-turns so it doesn't look
frozen when standing still.

Run with `BUDDY_DEBUG=1 npm start` to pop open devtools for the pet window if you want to
tweak the SVGs or movement live.

## Features

- Free-roaming pet window: walk / jump / idle / sleep, each with distinct movement
- Click to chat, drag to reposition; chat pauses the pet's autonomy while open
- Text chat via Claude (Sonnet 5), plus unprompted proactive comments after ~8+ idle minutes
- Voice input (mic → speech-to-text) always available via the 🎤 button. Voice **output**
  (text-to-speech) is off by default — Buddy stays silent and only shows the chat bubble
  until you turn it on with the 🔇/🔊 button in the chat header. Both use the browser's
  built-in Web Speech APIs, no extra services needed
- Mood system (happiness / energy / attention) that decays over real time; low energy
  triggers sleep, which regenerates it — interacting with Buddy wakes it and boosts mood

## Notes on voice

Microphone access requires macOS TCC permission. In `npm start` (dev mode), Electron's
own binary doesn't carry a mic usage description, so the OS may silently block access
without ever prompting. For reliable voice, build the packaged app:

```bash
npm run dist
```

This bundles `NSMicrophoneUsageDescription` / `NSSpeechRecognitionUsageDescription` (see
`package.json` → `build.mac.extendInfo`), so macOS will properly prompt for mic access on
first use, and grant it via System Settings → Privacy & Security → Microphone.

## Structure

- `src/main.js` — pet/chat window lifecycle, movement & gait engine, mood decay,
  proactive-message timer, tray, IPC
- `src/state.js` — persisted mood, bond/relationship, names, chat history, character
- `src/reactions.js` — per-species personality text + instant petting/feeding reaction lines
- `src/claude.js` — Anthropic API calls, the personality-aware system prompt, and the
  tool-use loop that lets Buddy check system status / search files / open things
- `src/system-tools.js` — the actual read-only system/file access Buddy's tools call into
- `src/preload.js` — safe IPC bridge to both renderer windows
- `src/renderer/characters.js` — shared SVG character art (both windows load this)
- `src/renderer/pet.html` + `pet.js` — the on-screen character, movement, drag, speech
- `src/renderer/chat.html` + `chat.js` — the chat panel, mood bars, character picker
