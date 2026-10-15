// Android paid collections: shared Worker folder metadata and website Belsky index.
// Pure data transforms only. Protected media URLs/IDs are never put into public previews.
export const BELSKY_VOL1_ID = 'pap-whats-halacha-vol1-belsky';
export const BELSKY_INDEX_URL = 'https://irgunshiuraitorah.com/assets/belsky-question-index.json';
export const BELSKY_ALBUM_RANGES = Object.freeze([
  [1, 6], [7, 11], [12, 16], [17, 21], [22, 26], [27, 31], [32, 35]
]);
const natural = new Intl.Collator(undefined, {numeric:true, sensitivity:'base'});
const clean = value => String(value == null ? '' : value).trim();
const pad = number => String(number).padStart(2, '0');

export function belskyAlbumForSession(session) {
  const number = Number(session);
  if (!Number.isInteger(number) || number < 1 || number > 35) return null;
  const index = BELSKY_ALBUM_RANGES.findIndex(([start, end]) => number >= start && number <= end);
  if (index < 0) return null;
  const [start, end] = BELSKY_ALBUM_RANGES[index];
  return {number:index + 1, start, end, label:`Album ${index+1} — Sessions ${pad(start)}–${pad(end)}`};
}

export function belskySessionLabel(session, part = 0) {
  const number = Number(session);
  return `Session ${pad(number)}${Number(part) > 0 ? ` — Part ${Number(part)}` : ''}`;
}

export function paidFolderPath(productId, folders) {
  const original = (Array.isArray(folders) ? folders : []).map(clean).filter(Boolean).slice(0, 6);
  if (clean(productId) !== BELSKY_VOL1_ID) return original;
  const position = original.findIndex(name => /^RB-01-(\d{1,2})$/i.test(name));
  if (position < 0) return original;
  const session = Number(original[position].match(/^RB-01-(\d{1,2})$/i)[1]);
  const album = belskyAlbumForSession(session);
  if (!album) return original;
  // These names exist only inside the app; Google Drive folder names remain intact.
  return [...original.slice(0, position), album.label, belskySessionLabel(session),
    ...original.slice(position+1)];
}

export function paidFolderKey(productId, path) {
  return JSON.stringify([clean(productId), ...(Array.isArray(path) ? path.map(clean) : [])]);
}

function createNode(name, path) {
  return {name, path, count:0, folders:[], tracks:[]};
}
const normalFolders = track => (Array.isArray(track?.folders) ? track.folders : [])
  .map(clean).filter(Boolean).slice(0, 6);

function trackOrderValue(track) {
  const value = track?.sortOrder ?? track?.trackOrder ?? track?.trackNumber ?? track?.position;
  return value !== undefined && value !== null && clean(value) !== '' && Number.isFinite(Number(value))
    ? Number(value) : null;
}
function trackTitle(track) {
  return clean(track?.fileName || track?.filename || track?.title || track?.name || '');
}
function isIntroduction(track) {
  return /(?:^|[^a-z])(?:introduction|intro|announcement)(?:[^a-z]|$)/i.test(trackTitle(track));
}
export function comparePaidTrackEntries(a, b) {
  const first = trackOrderValue(a.track), second = trackOrderValue(b.track);
  if (first !== null && second !== null && first !== second) return first-second;
  const intro = Number(isIntroduction(b.track))-Number(isIntroduction(a.track));
  if (intro) return intro;
  // Natural numeric ordering (2 before 10), not lexical ("10" before "2").
  const result = natural.compare(trackTitle(a.track), trackTitle(b.track));
  return result || a.index - b.index;
}

export function buildPaidFolderTree(records, productId, {preview=false}={}) {
  const root = createNode('', []);
  for (const [index, record] of (Array.isArray(records) ? records : []).entries()) {
    const rawPath = normalFolders(record);
    const path = paidFolderPath(productId, rawPath);
    const count = preview
      ? Math.max(0, Math.floor(Number(record?.trackCount) || 0)) : 1;
    if (count <= 0) continue;
    root.count += count;
    let current = root;
    for (const name of path) {
      let child = current.folders.find(node => node.name === name);
      if (!child) {
        child = createNode(name, [...current.path,name]);
        current.folders.push(child);
      }
      child.count += count;
      current = child;
    }
    if (!preview && record?.id) current.tracks.push({track:record,index});
  }
  const sort = node => {
    node.folders.sort((a,b)=>natural.compare(a.name,b.name));
    node.tracks.sort(comparePaidTrackEntries);
    node.folders.forEach(sort);
  };
  sort(root);
  return root;
}

export function nextPaidTrackInFolder(tracks, currentTrackId) {
  const list = Array.isArray(tracks) ? tracks : [];
  const current = list.find(track => clean(track?.id) === clean(currentTrackId));
  if (!current?.id) return null;
  // Keep the actual deepest Worker folder, not an album label or guessed session.
  const key = JSON.stringify(normalFolders(current));
  const same = list.map((track,index)=>({track,index}))
    .filter(entry => entry.track?.id && JSON.stringify(normalFolders(entry.track)) === key)
    .sort(comparePaidTrackEntries);
  const index = same.findIndex(entry => clean(entry.track.id) === clean(currentTrackId));
  return index >= 0 ? same[index+1]?.track || null : null;
}

export function parseBelskyIndex(payload) {
  if (!payload || !Array.isArray(payload.sessions) || payload.sessions.length < 35)
    throw new Error('The published Halacha question index is incomplete.');
  const sessions = payload.sessions.map(section=>({
    disc:Number(section.disc),
    session:Number(section.session),
    part:Number(section.part)||0,
    topics:(Array.isArray(section.topics) ? section.topics : []).map(topic=>({
      num:clean(topic.num),text:clean(topic.text)
    })).filter(topic=>topic.text)
  })).filter(section=>Number.isInteger(section.disc)&&section.disc>=1&&section.disc<=7&&
    belskyAlbumForSession(section.session)&&section.part>=0&&section.part<=2);
  if (new Set(sessions.map(s=>s.session)).size !== 35) throw new Error('Question index sessions are incomplete.');
  return sessions;
}
function searchable(value) {
  return clean(value).normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
export function findBelskyQuestions(sessions, query='', disc='all') {
  const terms = searchable(query).split(/\s+/).filter(Boolean);
  const results = [];
  for (const section of (Array.isArray(sessions) ? sessions : [])) {
    if (disc !== 'all' && String(section.disc) !== String(disc)) continue;
    for (const topic of section.topics || []) {
      const haystack = searchable(`Album ${belskyAlbumForSession(section.session)?.number || ''} Disc ${section.disc} Session ${section.session} Part ${section.part} Question ${topic.num} ${topic.text}`);
      if (terms.every(term=>haystack.includes(term))) results.push({section,topic});
    }
  }
  return results;
}
