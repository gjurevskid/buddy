// Read-only access to real information about the user's machine, plus one
// narrow, validated way to open something it found. No shell strings are
// built from user/model input — every external command runs via execFile
// with a fixed argument array, so there is no injection surface even if a
// query contains quotes or special characters.

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { shell } = require('electron');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

function bytesToGB(bytes) {
  return Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;
}

async function getBattery() {
  try {
    const out = await run('pmset', ['-g', 'batt']);
    const pctMatch = out.match(/(\d+)%/);
    const stateMatch = out.match(/;\s*(charging|discharging|charged|finishing charge)/i);
    if (!pctMatch) return null;
    return {
      percent: Number(pctMatch[1]),
      state: stateMatch ? stateMatch[1].toLowerCase() : 'unknown'
    };
  } catch {
    return null; // desktop Macs / no battery
  }
}

// os.freemem() alone is misleading on macOS: it doesn't count cached pages
// that the OS would happily reclaim under pressure, so it usually reads as
// "almost full" even on a healthy machine. vm_stat's free+inactive+
// speculative pages is a much closer match to what Activity Monitor calls
// available memory.
async function getMemory() {
  const totalGB = bytesToGB(os.totalmem());
  try {
    const out = await run('vm_stat', []);
    const pageSizeMatch = out.match(/page size of (\d+) bytes/);
    const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096;
    const pagesOf = (label) => {
      const m = out.match(new RegExp(`${label}:\\s+(\\d+)\\.`));
      return m ? Number(m[1]) : 0;
    };
    const availablePages = pagesOf('Pages free') + pagesOf('Pages inactive') + pagesOf('Pages speculative');
    const availableGB = bytesToGB(availablePages * pageSize);
    return { totalGB, freeGB: availableGB, usedGB: Math.round((totalGB - availableGB) * 10) / 10 };
  } catch {
    const freeGB = bytesToGB(os.freemem());
    return { totalGB, freeGB, usedGB: Math.round((totalGB - freeGB) * 10) / 10 };
  }
}

async function getDisk() {
  try {
    const out = await run('df', ['-k', os.homedir()]);
    const line = out.trim().split('\n').pop();
    const cols = line.trim().split(/\s+/);
    const totalKB = Number(cols[1]);
    const usedKB = Number(cols[2]);
    const availKB = Number(cols[3]);
    return {
      totalGB: bytesToGB(totalKB * 1024),
      usedGB: bytesToGB(usedKB * 1024),
      freeGB: bytesToGB(availKB * 1024),
      percentUsed: Math.round((usedKB / totalKB) * 100)
    };
  } catch {
    return null;
  }
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins || parts.length === 0) parts.push(`${mins}m`);
  return parts.join(' ');
}

async function getSystemStatus() {
  const [battery, disk, memory] = await Promise.all([getBattery(), getDisk(), getMemory()]);
  const load = os.loadavg()[0];
  const cores = os.cpus().length;

  return {
    battery,
    memory,
    disk,
    cpu: { cores, load1min: Math.round(load * 100) / 100, busyPercent: Math.min(100, Math.round((load / cores) * 100)) },
    uptime: formatUptime(os.uptime()),
    platform: `${os.platform()} ${os.release()}`
  };
}

const LOCATION_PATHS = {
  Desktop: () => path.join(os.homedir(), 'Desktop'),
  Documents: () => path.join(os.homedir(), 'Documents'),
  Downloads: () => path.join(os.homedir(), 'Downloads'),
  Pictures: () => path.join(os.homedir(), 'Pictures'),
  Home: () => os.homedir()
};

const KIND_QUERY = {
  photo: 'kind:image',
  image: 'kind:image',
  document: 'kind:document',
  pdf: 'kind:pdf',
  video: 'kind:movie',
  audio: 'kind:audio',
  folder: 'kind:folder'
};

async function searchFiles({ query, kind, location, limit = 15 } = {}) {
  const args = [];
  const scopePath = location && LOCATION_PATHS[location] ? LOCATION_PATHS[location]() : null;
  if (scopePath) args.push('-onlyin', scopePath);

  if (kind && KIND_QUERY[kind]) {
    const q = query ? `${KIND_QUERY[kind]} ${query}` : KIND_QUERY[kind];
    args.push(q);
  } else if (query) {
    args.push('-name', query);
  } else {
    return { error: 'Need at least a query or a kind to search for.' };
  }

  let out;
  try {
    out = await run('mdfind', args);
  } catch (err) {
    return { error: `Search failed: ${err.message}` };
  }

  const paths = out.split('\n').filter(Boolean).slice(0, limit);
  const results = paths.map((p) => {
    let stat = null;
    try {
      stat = fs.statSync(p);
    } catch {
      // file may have moved/been deleted between mdfind indexing and now
    }
    return {
      name: path.basename(p),
      path: p,
      isFolder: stat ? stat.isDirectory() : null,
      sizeKB: stat && !stat.isDirectory() ? Math.round(stat.size / 1024) : null,
      modified: stat ? stat.mtime.toISOString().slice(0, 10) : null
    };
  });

  return { count: results.length, results };
}

function isWithinHome(targetPath) {
  const resolved = path.resolve(targetPath);
  const home = path.resolve(os.homedir());
  return resolved === home || resolved.startsWith(home + path.sep);
}

// AppleScript-backed context tools. Each is wrapped defensively: Calendar/
// System Events scripting can be slow, denied by the user (TCC prompt), or
// simply return nothing — none of that should ever crash the caller.
function runOsascript(script, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

async function getActiveApp() {
  try {
    const name = await runOsascript(
      'tell application "System Events" to get name of first application process whose frontmost is true'
    );
    return { app: name || null };
  } catch (err) {
    return { error: 'Could not read the frontmost app (accessibility permission may be needed).' };
  }
}

async function getFrontWindowBounds() {
  try {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set frontWin to front window of frontApp
        set {winX, winY} to position of frontWin
        set {winW, winH} to size of frontWin
        return (name of frontApp) & "," & winX & "," & winY & "," & winW & "," & winH
      end tell
    `;
    const out = await runOsascript(script, 4000);
    const [appName, x, y, w, h] = out.split(',').map((s) => s.trim());
    if (!x) return { window: null };
    return { window: { app: appName, x: Number(x), y: Number(y), width: Number(w), height: Number(h) } };
  } catch {
    return { window: null };
  }
}

async function getDockBounds() {
  try {
    // The final string-building has to happen OUTSIDE the nested "tell
    // process" block — "&" concatenation inside it gets misdirected as an
    // Apple Event to the Dock process instead of plain AppleScript string
    // concat, silently producing garbage like "170, ,, 915, ...".
    const script = `
      tell application "System Events"
        tell process "Dock"
          set dockList to list 1
          set {dx, dy} to position of dockList
          set {dw, dh} to size of dockList
        end tell
      end tell
      return (dx as string) & "," & (dy as string) & "," & (dw as string) & "," & (dh as string)
    `;
    const out = await runOsascript(script, 4000);
    const [x, y, w, h] = out.split(',').map((s) => Number(s.trim()));
    if (!w || !h) return { dock: null };
    return { dock: { x, y, width: w, height: h } };
  } catch {
    return { dock: null };
  }
}

async function getNextCalendarEvent() {
  try {
    // Scoped to a 2-hour lookahead and a hard timeout: Calendar.app's
    // scripting bridge can be very slow across many calendars, and this is
    // meant to be a quick ambient check, not a full agenda dump.
    const script = `
      set nowDate to current date
      set laterDate to nowDate + (2 * hours)
      tell application "Calendar"
        set upcoming to {}
        repeat with cal in calendars
          try
            set evts to (every event of cal whose start date ≥ nowDate and start date ≤ laterDate)
            repeat with e in evts
              set end of upcoming to {summary of e, start date of e}
            end repeat
          end try
        end repeat
      end tell
      if (count of upcoming) is 0 then return "NONE"
      set soonest to item 1 of upcoming
      repeat with u in upcoming
        if (item 2 of u) < (item 2 of soonest) then set soonest to u
      end repeat
      return (item 1 of soonest) & "||" & ((item 2 of soonest) as string)
    `;
    const out = await runOsascript(script, 6000);
    if (!out || out === 'NONE') return { event: null };
    const [title, when] = out.split('||');
    return { event: { title: title.trim(), start: (when || '').trim() } };
  } catch {
    return { event: null, error: 'Could not read Calendar (permission may be needed).' };
  }
}

const KIND_BY_EXT = {
  photo: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.bmp', '.tiff'],
  video: ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
  audio: ['.mp3', '.wav', '.aac', '.flac', '.m4a', '.ogg'],
  pdf: ['.pdf'],
  document: ['.doc', '.docx', '.txt', '.pages', '.rtf', '.md', '.odt'],
  code: ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.go', '.rs', '.swift', '.html', '.css', '.json', '.jsx', '.tsx'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz']
};

function classifyFileKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  for (const [kind, exts] of Object.entries(KIND_BY_EXT)) {
    if (exts.includes(ext)) return kind;
  }
  return 'other';
}

async function openPath(targetPath) {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    return { error: 'No path given.' };
  }
  const resolved = path.resolve(targetPath);
  if (!isWithinHome(resolved)) {
    return { error: 'For safety, I can only open files inside your home folder.' };
  }
  if (!fs.existsSync(resolved)) {
    return { error: 'That path no longer exists.' };
  }
  const errorMsg = await shell.openPath(resolved);
  if (errorMsg) return { error: errorMsg };
  return { ok: true, opened: resolved };
}

module.exports = {
  getSystemStatus,
  searchFiles,
  openPath,
  isWithinHome,
  getActiveApp,
  getFrontWindowBounds,
  getDockBounds,
  getNextCalendarEvent,
  classifyFileKind
};
