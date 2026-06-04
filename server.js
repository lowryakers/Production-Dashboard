import express from 'express';
import compression from 'compression';
import cron from 'node-cron';
import Papa from 'papaparse';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(compression());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const EOD_SHEET_URL = process.env.EOD_SHEET_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ04WCKS8CMYHwd-6Ae5MAN5sYpEhJ3RiYMoxtX0SroNoeuYjxMhWfbVvQAy2xuKAnk62F6VeC4blhC/pub?output=csv';

const SCHEDULE_SHEET_URL = process.env.SCHEDULE_SHEET_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRNNf9pwyYPTeTx9RK118V5x3bLom6J2AWR89tSscvMBPQJnn01mu7sy7frM9dn9J-nL-8Zz1v3MPZV/pub?output=csv&gid=0';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'lowryakers/Production-Dashboard';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'claude/dreamy-hawking-FHkg4';
const SNAPSHOTS_PATH = 'data/schedule-snapshots.json';

const cache = {
  eod: { data: null, lastSync: null, error: null },
  schedule: { data: null, lastSync: null, error: null },
};

let scheduleSnapshots = [];
let snapshotsFileSha = null;

// --- GitHub persistence ---

async function loadSnapshotsFromGitHub() {
  if (!GITHUB_TOKEN) {
    console.log('[snapshots] No GITHUB_TOKEN set — snapshots will not persist across deploys');
    return;
  }
  try {
    const [owner, repo] = GITHUB_REPO.split('/');
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${SNAPSHOTS_PATH}?ref=${GITHUB_BRANCH}`,
      { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
    );
    if (res.status === 404) {
      console.log('[snapshots] No snapshots file in repo yet — starting fresh');
      return;
    }
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const json = await res.json();
    snapshotsFileSha = json.sha;
    const content = Buffer.from(json.content, 'base64').toString('utf-8');
    scheduleSnapshots = JSON.parse(content);
    console.log(`[snapshots] Loaded ${scheduleSnapshots.length} snapshots from GitHub`);
  } catch (err) {
    console.error('[snapshots] Failed to load from GitHub:', err.message);
  }
}

async function saveSnapshotsToGitHub() {
  if (!GITHUB_TOKEN) return;
  try {
    const [owner, repo] = GITHUB_REPO.split('/');
    const content = Buffer.from(JSON.stringify(scheduleSnapshots, null, 2)).toString('base64');
    const body = {
      message: `Update schedule snapshots (${scheduleSnapshots.length} weeks)`,
      content,
      branch: GITHUB_BRANCH,
    };
    if (snapshotsFileSha) body.sha = snapshotsFileSha;

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${SNAPSHOTS_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub API ${res.status}: ${errText}`);
    }
    const result = await res.json();
    snapshotsFileSha = result.content.sha;
    console.log(`[snapshots] Saved ${scheduleSnapshots.length} snapshots to GitHub`);
  } catch (err) {
    console.error('[snapshots] Failed to save to GitHub:', err.message);
  }
}

// --- Schedule snapshot logic ---

function getScheduleFingerprint(entries) {
  return entries.map((e) => e.mo).filter(Boolean).sort().join(',');
}

function getWeekLabel(entries) {
  const dates = entries.map((e) => e.date).filter(Boolean).sort();
  if (!dates.length) return 'Unknown week';
  const d1 = new Date(dates[0] + 'T00:00:00');
  const d2 = new Date(dates[dates.length - 1] + 'T00:00:00');
  return `${d1.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${d2.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

async function snapshotScheduleIfNew(entries) {
  if (!entries.length) return;
  const fingerprint = getScheduleFingerprint(entries);
  if (scheduleSnapshots.find((s) => s.fingerprint === fingerprint)) return;

  const dates = entries.map((e) => e.date).filter(Boolean).sort();
  scheduleSnapshots.push({
    id: Date.now().toString(36),
    fingerprint,
    weekLabel: getWeekLabel(entries),
    weekStart: dates[0] || null,
    weekEnd: dates[dates.length - 1] || null,
    capturedAt: new Date().toISOString(),
    entries,
  });
  scheduleSnapshots.sort((a, b) => (b.weekStart || '').localeCompare(a.weekStart || ''));
  console.log(`[snapshots] New schedule snapshot: ${getWeekLabel(entries)}`);
  await saveSnapshotsToGitHub();
}

// --- CSV parsing ---

async function fetchCSV(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  return await response.text();
}

function parseEOD(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  return data;
}

function parseSchedule(text) {
  const { data } = Papa.parse(text, { header: false, skipEmptyLines: false });
  if (data.length < 3) return [];

  const entries = [];
  const headerRow = data[1];
  if (!headerRow) return [];

  let col = 1;
  while (col < headerRow.length) {
    if (!headerRow[col] || headerRow[col].trim().toLowerCase() === 'room') {
      col++;
      continue;
    }

    const roomCol = col - 1;
    const isRoomCol = headerRow[col - 1]?.trim().toLowerCase() === 'room';
    if (!isRoomCol) { col++; continue; }

    const dateHeaders = [];
    let dayCol = col;
    while (dayCol < headerRow.length) {
      const val = headerRow[dayCol]?.trim();
      if (!val || val.toLowerCase() === 'room') break;
      dateHeaders.push({ col: dayCol, label: val });
      dayCol++;
    }

    for (let row = 2; row < data.length; row++) {
      const roomVal = data[row]?.[roomCol]?.trim();
      if (!roomVal || roomVal.toLowerCase() === 'production rooms' || roomVal.toLowerCase() === 'cleaning level') continue;

      for (const dh of dateHeaders) {
        const cellVal = data[row]?.[dh.col]?.trim();
        if (!cellVal || cellVal === 'N/A' || cellVal.toLowerCase() === 'full clean' || cellVal.toLowerCase() === 'partial') continue;

        const moMatch = cellVal.match(/MO(\d+)/i);
        const mo = moMatch ? `MO${moMatch[1]}` : null;
        const product = cellVal.replace(/MO\d+\s*/i, '').replace(/^\d+\s*/, '').trim();

        const dateMatch = dh.label.match(/(\w+)\s+(\d+)\/(\d+)/);
        let dateStr = null;
        if (dateMatch) {
          const month = parseInt(dateMatch[2], 10);
          const day = parseInt(dateMatch[3], 10);
          const year = new Date().getFullYear();
          dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }

        entries.push({ room: roomVal, dayLabel: dh.label, date: dateStr, mo, product, raw: cellVal });
      }
    }
    col = dayCol;
  }
  return entries;
}

// --- Sync ---

async function syncEOD() {
  try {
    console.log('[sync] Fetching EOD data...');
    const text = await fetchCSV(EOD_SHEET_URL);
    const data = parseEOD(text);
    cache.eod = { data, lastSync: new Date().toISOString(), error: null };
    console.log(`[sync] EOD: ${data.length} rows cached`);
  } catch (err) {
    console.error('[sync] EOD failed:', err.message);
    cache.eod.error = err.message;
  }
}

async function syncSchedule() {
  try {
    console.log('[sync] Fetching schedule data...');
    const text = await fetchCSV(SCHEDULE_SHEET_URL);
    const data = parseSchedule(text);
    cache.schedule = { data, lastSync: new Date().toISOString(), error: null };
    console.log(`[sync] Schedule: ${data.length} entries cached`);
    await snapshotScheduleIfNew(data);
  } catch (err) {
    console.error('[sync] Schedule failed:', err.message);
    cache.schedule.error = err.message;
  }
}

async function syncAll() {
  await Promise.all([syncEOD(), syncSchedule()]);
}

// Daily sync at 6:00 AM Central (11:00 UTC)
cron.schedule('0 11 * * *', () => {
  console.log('[cron] Daily sync triggered');
  syncAll();
}, { timezone: 'UTC' });

// --- API routes ---

app.get('/api/eod', (_req, res) => {
  if (!cache.eod.data) return res.status(503).json({ error: 'Data not yet loaded', lastSync: null });
  res.json({ data: cache.eod.data, lastSync: cache.eod.lastSync });
});

app.get('/api/schedule', (_req, res) => {
  if (!cache.schedule.data) return res.status(503).json({ error: 'Schedule not yet loaded', lastSync: null });
  res.json({
    data: cache.schedule.data,
    lastSync: cache.schedule.lastSync,
    snapshots: scheduleSnapshots.map((s) => ({
      id: s.id, weekLabel: s.weekLabel, weekStart: s.weekStart,
      weekEnd: s.weekEnd, capturedAt: s.capturedAt, entryCount: s.entries.length,
    })),
  });
});

app.get('/api/schedule/snapshot/:id', (req, res) => {
  const snap = scheduleSnapshots.find((s) => s.id === req.params.id);
  if (!snap) return res.status(404).json({ error: 'Snapshot not found' });
  res.json(snap);
});

app.post('/api/refresh', async (_req, res) => {
  await syncAll();
  res.json({
    eod: { rows: cache.eod.data?.length || 0, lastSync: cache.eod.lastSync, error: cache.eod.error },
    schedule: { rows: cache.schedule.data?.length || 0, lastSync: cache.schedule.lastSync, error: cache.schedule.error },
  });
});

app.get('/api/status', (_req, res) => {
  res.json({
    eod: { rows: cache.eod.data?.length || 0, lastSync: cache.eod.lastSync, error: cache.eod.error },
    schedule: { rows: cache.schedule.data?.length || 0, lastSync: cache.schedule.lastSync, error: cache.schedule.error },
    snapshots: scheduleSnapshots.length,
    githubPersistence: !!GITHUB_TOKEN,
  });
});

// Serve static React build
app.use(express.static(path.join(__dirname, 'dist')));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Startup
(async () => {
  await loadSnapshotsFromGitHub();
  await syncAll();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Powder Ops Dashboard running on port ${PORT}`);
  });
})();
