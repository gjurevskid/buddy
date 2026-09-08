# Buddy — a desktop companion

A small character that actually lives and roams on your desktop, like a tamagotchi with a
brain. It walks around, jumps, falls asleep when tired, wakes up when you interact with
it, and opens a chat window when you click it — by text or voice. It has real, read-only
access to your Mac (battery, files, the app you're using, your calendar), a persistent
relationship and evolution system, and it remembers things about you across sessions.

## Run it

```bash
npm install
npm start
```

On first launch, click the character to open chat, open **API keys** in settings, and
paste a key for at least one provider (Claude / GPT / Gemini — see [Multi-provider
chat](#multi-provider-chat-with-automatic-fallback) below). Keys are stored locally via
`electron-store` and only ever leave your machine to call that provider's API directly.

## Two windows, both resizable

- **The pet** — a small transparent window with just the character. It roams freely
  around your screen: walks, jumps, idles, looks around, sleeps when its energy runs low
  (regenerating while asleep), and occasionally ambles over to stand near whatever window
  you currently have in front. Drag it to move it manually, drag its edge to resize it;
  **single-click to pet it** (instant, no API call); **double-click to open chat**; **drag
  a file onto it to feed it**.
- **Chat** — a panel that pops up near the pet when you click it. Its name and your bond
  level, mood bars, character picker, earned badges, a 🍎 feed button, text/voice input,
  and a settings drawer (⚙️) for API keys, memory, and voice all live here. Close it with
  the ✕ and the pet resumes wandering.

## Multi-provider chat, with automatic fallback

Buddy isn't tied to one AI vendor. Configure any combination of:

- **Claude (Anthropic)**
- **GPT (OpenAI)**
- **Gemini (Google)**
- **A local model via [Ollama](https://ollama.com)** — free, private, works offline. Pull
  a model (`ollama pull llama3.1`) and enter the model name instead of a key.

Pick one as active. If it ever fails mid-conversation — out of credit, rate-limited, a bad
key, Ollama not running — Buddy automatically retries with the next configured provider
and **stays there**, so it doesn't keep wasting calls on a vendor that's tapped out. You
can always switch back manually in settings.

Buddy also tracks a rough per-provider token/cost estimate for the day, shown in settings.

## It actually knows your computer

Buddy has real tools — via native tool-use — so it can answer things about the machine it
lives on and the moment you're in, not just chat in the abstract:

- **"How's my battery / storage / memory doing?"** → `get_system_status` reads real
  battery %, disk space, memory, CPU load, and uptime (macOS, via `pmset`/`df`/`vm_stat`).
- **"Find my resume" / "where are my vacation photos?"** → `search_files` uses Spotlight
  (`mdfind`) to search by name and/or kind (photo, document, pdf, video, audio, folder),
  optionally scoped to Desktop/Documents/Downloads/Pictures/Home. Returns paths and basic
  metadata only — it never reads file contents.
- **"Open it"** → `open_path` opens a file/folder with its default app. Restricted to
  paths inside your home folder, and validates the path exists first.
- **"What am I even doing right now?"** → `get_active_app` reads which application is
  currently frontmost (via AppleScript/System Events).
- **"What's next on my calendar?"** → `get_next_calendar_event` checks Calendar.app for
  anything starting in the next couple of hours.
- **`remember_fact`** — Buddy decides on its own when something you say is worth
  remembering long-term (a preference, a plan, an ongoing situation) and saves it, so it
  can bring it up naturally weeks later. See what it's saved (or clear it) under **What I
  remember** in settings.

All system access runs via `execFile`/`osascript` with fixed argument arrays (no shell
string-building), so there's no injection surface, and every AppleScript-backed check
fails silently and safely if permission isn't granted or nothing is found. See
`src/system-tools.js` for the implementation and `src/claude.js` for the tool-use loop.

## Proactive, not just reactive

Buddy speaks up on its own sometimes, each with its own cooldown so it never spams:

- **Hungry** — asks for food in-character when its energy runs low.
- **Low battery / low disk** — an unprompted heads-up if your Mac is at ≤10% battery
  (and unplugged) or has less than 5GB free.
- **Long focus stretch** — a gentle check-in if you've been in the same app for over an
  hour.
- **Idle chatter** — an occasional in-character comment via the LLM if you've ignored it
  for ~8+ minutes.

## Making it feel like an actual pet, not a chatbot

- **It has a name, and so do you.** First time you open chat it asks your name and
  remembers it. Rename it any time from settings.
- **Distinct personalities per species** — not one generic voice: the elf is whimsical
  and melodic, the robot is earnest and literal ("Affection sensors: activated."), the
  ghost is shy and sweet, the dog is loyal and food-motivated, the cat is aloof-but-
  secretly-attached, the owl is calm and a little proverbial.
- **A bond level that only ever grows.** Unlike mood (which decays and recovers hour to
  hour), the bond bar — New Friend → Acquaintance → Friend → Close Friend → Best Friend →
  Soulmate — is permanent relationship progress from petting, feeding, chatting, and even
  feeding it files. The system prompt tells the model your current bond level, so a
  Soulmate-level pet talks to you differently than a New Friend does.
- **Feeding** (🍎 in chat, ~30 min cooldown, or drag any file onto it any time) restores
  energy, nudges happiness, and grows the bond.
- **It literally grows up — but only if you actually feed it.** The bond level makes a
  stage *eligible* (🐣 baby → 🌿 adult → ✨ elder), but the real gate is how many times
  you've fed it: 3 feedings to reach adult, 8 to reach elder. Crossing a stage plays a
  one-time celebration.
- **Badges** — the *kind* of file you drag onto it also matters: feeding it a photo, a
  PDF, code, music, video, or an archive for the first time unlocks a collectible badge,
  shown in settings.
- **It gets hungry and says so, in its own voice**, without waiting for you to notice.

## Characters & gaits

Six characters — elf 🧝, robot 🤖, ghost 👻, dog 🐶, cat 🐱, owl 🦉 — each with its own
hand-built SVG art and its own **gait**, not just a shared walk cycle. The illustration
style is naturalistic rather than cartoon-sticker: no hard outlines around silhouettes,
muted natural colors, real-looking eyes (an actual iris color, dark pupil, one soft
catchlight), and short texture strokes suggesting fur or feather direction.

- **Elf / dog / cat** — organic bounce with ease-in/ease-out acceleration
- **Robot** — rigid, quantized mechanical steps
- **Owl** — hops rather than slides — advances only on the "up" half of each bounce
- **Ghost** — floats continuously, no footsteps, no ground-impact bob — never touches the ground

Switch characters via the picker in chat settings, or the tray menu's Character submenu.

Run with `BUDDY_DEBUG=1 npm start` to pop open devtools for the pet window if you want to
tweak the SVGs or movement live.

## Notes on voice

Voice **input** (mic → speech-to-text) is available via the 🎤 button. Voice **output**
(text-to-speech) is off by default — turn it on with the 🔇/🔊 button. Both use the
browser's built-in Web Speech APIs.

Microphone access requires macOS TCC permission. In `npm start` (dev mode), Electron's
own binary doesn't carry a mic usage description, so the OS may silently block access
without ever prompting. For reliable voice, build the packaged app instead:

```bash
npm run dist
```

This bundles `NSMicrophoneUsageDescription` / `NSSpeechRecognitionUsageDescription` (see
`package.json` → `build.mac.extendInfo`), so macOS will properly prompt for mic access.

## Platform

Built and tested on macOS. The system tools (`pmset`, `df`, `vm_stat`, `mdfind`,
`osascript`) are macOS-specific; the rest of the app (Electron windows, chat, mood/bond,
characters) has no inherent macOS dependency, but Windows/Linux support hasn't been
tried.

## Structure

- `src/main.js` — pet/chat window lifecycle, movement & gait engine, mood decay,
  proactive-message/alert timers, tray, IPC
- `src/state.js` — persisted mood, bond/relationship, memories, badges, usage, API keys
- `src/reactions.js` — per-species personality text + instant petting/feeding reaction lines
- `src/claude.js` — the multi-provider chat client (Anthropic/OpenAI/Gemini/Ollama),
  fallback logic, the personality-aware system prompt, and the tool-use loop
- `src/system-tools.js` — the actual read-only system/file/calendar access Buddy's tools call into
- `src/preload.js` — safe IPC bridge to both renderer windows
- `src/renderer/characters.js` — shared SVG character art (both windows load this)
- `src/renderer/pet.html` + `pet.js` — the on-screen character, movement, drag, drop-to-feed, speech
- `src/renderer/chat.html` + `chat.js` — the chat panel, settings, providers, memory, badges

## Contributing

Issues and PRs welcome. This started as a personal project, so expect some rough edges —
Windows/Linux support and additional providers are probably the most useful contributions.

## License

MIT — see [LICENSE](LICENSE).
