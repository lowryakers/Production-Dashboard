import express from 'express';
import compression from 'compression';
import cron from 'node-cron';
import Papa from 'papaparse';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(compression());

const PORT = process.env.PORT || 3000;

const EOD_SHEET_URL = process.env.EOD_SHEET_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ04WCKS8CMYHwd-6Ae5MAN5sYpEhJ3RiYMoxtX0SroNoeuYjxMhWfbVvQAy2xuKAnk62F6VeC4blhC/pub?output=csv';

const SCHEDULE_SHEET_URL = process.env.SCHEDULE_SHEET_URL ||
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRNNf9pwyYPTeTx9RK118V5x3bLom6J2AWR89tSscvMBPQJnn01mu7sy7frM9dn9J-nL-8Zz1v3MPZV/pub?output=csv&gid=0';

const cache = {
  eod: { data: null, lastSync: null, error: null },
  schedule: { data: null, lastSync: null, error: null },
};

async function fetchCSV(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const text = await response.text();
  return text;
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

    const dateHeaders = [];
    const roomCol = col - 1;
    let isRoomCol = headerRow[col - 1]?.trim().toLowerCase() === 'room';

    if (!isRoomCol) {
      col++;
      continue;
    }

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

        entries.push({
          room: roomVal,
          dayLabel: dh.label,
          date: dateStr,
          mo,
          product,
          raw: cellVal,
        });
      }
    }

    col = dayCol;
  }

  return entries;
}

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

// API routes
app.get('/api/eod', (_req, res) => {
  if (!cache.eod.data) {
    return res.status(503).json({ error: 'Data not yet loaded', lastSync: null });
  }
  res.json({ data: cache.eod.data, lastSync: cache.eod.lastSync });
});

app.get('/api/schedule', (_req, res) => {
  if (!cache.schedule.data) {
    return res.status(503).json({ error: 'Schedule not yet loaded', lastSync: null });
  }
  res.json({ data: cache.schedule.data, lastSync: cache.schedule.lastSync });
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
  });
});

// Serve static React build
app.use(express.static(path.join(__dirname, 'dist')));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

syncAll().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Powder Ops Dashboard running on port ${PORT}`);
  });
});
