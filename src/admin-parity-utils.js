// Shared, side-effect-free validators used by the native-app admin panels.
// The protected Worker still authorizes every request and mutation.
export function adminEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}

export function validatedScheduleBatch(text) {
  let data;
  try { data = JSON.parse(String(text || '').trim()); }
  catch (error) { throw new Error('Invalid JSON: ' + error.message); }
  if (!data || Array.isArray(data) || typeof data !== 'object')
    throw new Error('Use an object with a unique sourceId and an events array.');
  const sourceId = String(data.sourceId || '').trim();
  if (!sourceId || sourceId.length > 160)
    throw new Error('Please provide a unique sourceId (up to 160 characters) for this flyer.');
  const events = data.events;
  if (!Array.isArray(events) || events.length < 1 || events.length > 100)
    throw new Error('Provide between 1 and 100 events in the events array.');
  const problems = [];
  events.forEach((item, index) => {
    const x = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    const missing = (field, value) => { if (!String(value || '').trim()) problems.push('#' + (index + 1) + ' missing ' + field); };
    if (!validIsoDate(x.date)) problems.push('#' + (index + 1) + ' has an invalid date');
    missing('location', x.location);
    missing('speaker', x.speaker || x.speakerEn || x.speakerHe);
    missing('title', x.title || x.titleEn || x.titleHe || x.topic || x.topicEn || x.topicHe);
    missing('startTime or timeLabel', x.startTime || x.timeLabel);
  });
  if (problems.length) throw new Error(problems.slice(0, 8).join('; ') + (problems.length > 8 ? '; and more' : ''));
  return { sourceId, events };
}

export function validIsoDate(raw) {
  const d = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const parsed = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
}

// RFC 4180-compatible quoted fields, including embedded newlines and escaped
// quotes. The file is read locally; the server only receives approved dates.
export function parseAdminCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (quoted) throw new Error('CSV has an unmatched quote.');
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(x => x.some(v => String(v || '').trim()));
}

export function normalizedAdminTitle(value) {
  return String(value || '').toLowerCase().normalize('NFKC')
    .replace(/[\u2018\u2019\u201C\u201D'",.!?;:()[\]{}\\/_-]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function planDateChanges(csvText, catalog) {
  const rows = parseAdminCsv(csvText);
  if (rows.length < 2) throw new Error('CSV has no lecture rows.');
  const headers = rows[0].map(x => String(x || '').trim());
  const idColumn = headers.indexOf('Vimeo ID');
  const dateColumn = headers.indexOf('New Lecture Date');
  const titleColumn = headers.indexOf('Irgun Title (DO NOT CHANGE)');
  if (idColumn < 0 || dateColumn < 0)
    throw new Error('This is not the expected Irgun Certain Date Updates CSV.');
  if (!Array.isArray(catalog)) throw new Error('The website returned no verified video catalog.');
  const byId = new Map(catalog.map(item => [String(item.id || item.vimeoId || '').trim(), item]));
  const seen = new Set();
  const counts = { ready:0, unchanged:0, review:0, missing:0, invalid:0 };
  const items = rows.slice(1).map(row => {
    const id = String(row[idColumn] || '').trim();
    const date = String(row[dateColumn] || '').trim();
    const title = titleColumn >= 0 ? String(row[titleColumn] || '').trim() : '';
    const video = byId.get(id);
    let status = 'ready';
    const currentTitle = String(video?.title || '').trim();
    const currentDate = String(video?.lectureDate || video?.date || '').trim();
    if (!id || seen.has(id) || !validIsoDate(date)) status = 'invalid';
    else if (!video) status = 'missing';
    else if (date === currentDate) status = 'unchanged';
    else if (title && normalizedAdminTitle(title) !== normalizedAdminTitle(currentTitle)) status = 'review';
    if (id) seen.add(id);
    counts[status]++;
    return { id, newDate:date, csvTitle:title, currentTitle, currentDate, status };
  });
  return { items, counts };
}
