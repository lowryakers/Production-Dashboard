import Papa from 'papaparse';

const GOOGLE_SHEETS_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ04WCKS8CMYHwd-6Ae5MAN5sYpEhJ3RiYMoxtX0SroNoeuYjxMhWfbVvQAy2xuKAnk62F6VeC4blhC/pub?output=csv';
const LOCAL_CSV = '/data.csv';

function parseTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[4].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function parseDuration(startStr, endStr) {
  const start = parseTime(startStr);
  const end = parseTime(endStr);
  if (start === null || end === null) return null;
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

function normalizeTeam(team) {
  if (!team) return null;
  const t = team.trim().toLowerCase();
  if (t.includes('batch') || t.includes('blend')) return 'Batching';
  if (t.includes('hand') || t.includes('fill')) return 'Hand Fill';
  if (t.includes('kit')) return 'Kitting';
  if (t.includes('stick') || t.includes('sachet')) return 'Stick Pack';
  return team.trim();
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

export async function fetchSheetData() {
  let text;
  try {
    const response = await fetch(GOOGLE_SHEETS_URL);
    if (!response.ok) throw new Error('Sheets unavailable');
    text = await response.text();
  } catch {
    const response = await fetch(LOCAL_CSV);
    text = await response.text();
  }

  const { data } = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  const runs = data
    .map((row) => {
      const date = parseDate(row["Today's Date"]);
      const team = normalizeTeam(row['Team']);
      const product = (row['Product Name:'] || '').trim();
      const mo = (row['MO #: '] || row['MO #:'] || '').trim();
      const lot = (row['Lot #:'] || '').trim();
      const quantity = parseFloat(row['Quantity Completed:']);
      const people = parseFloat(row['# of people working:']);
      const durationDecimal = parseFloat(row['Duration (decimal)']);
      const unitsPerHour = parseFloat(row['Units/Hour']);
      const startTime = row['Project Start Time:'];
      const endTime = row['Project End Time:'];
      const notes = (row['Notes/Observations on this MO # or Lot #:'] || '').trim();
      const reviewer = (row['Reviewed By (QA)'] || '').trim();
      const room = (row['Room'] || '').trim();

      if (!date || !team || isNaN(quantity) || quantity <= 0) return null;

      const duration = !isNaN(durationDecimal) && durationDecimal > 0
        ? durationDecimal
        : parseDuration(startTime, endTime);

      const manHours = duration && people ? duration * people : null;
      const unitsPerManHour = manHours && manHours > 0 ? quantity / manHours : null;

      return {
        date,
        dateStr: date.toISOString().split('T')[0],
        week: getWeekKey(date),
        team,
        product,
        mo,
        lot,
        quantity,
        people: isNaN(people) ? null : people,
        duration,
        manHours,
        unitsPerManHour,
        unitsPerHour: !isNaN(unitsPerHour) ? unitsPerHour : null,
        startTime,
        endTime,
        notes,
        reviewer,
        room,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date);

  return runs;
}

function getWeekKey(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export function getTeamColor(team) {
  const colors = {
    'Batching': '#f59e0b',
    'Hand Fill': '#10b981',
    'Kitting': '#8b5cf6',
    'Stick Pack': '#3b82f6',
  };
  return colors[team] || '#6b7280';
}

export function getTeams(runs) {
  return [...new Set(runs.map((r) => r.team))].sort();
}

export function getProducts(runs) {
  return [...new Set(runs.map((r) => r.product).filter(Boolean))].sort();
}
