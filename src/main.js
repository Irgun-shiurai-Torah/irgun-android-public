import './style.css';
import { usageAnalytics } from './usageAnalytics.js';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AppleSignIn, SignInScope } from '@capawesome/capacitor-apple-sign-in';

const API = 'https://api.irgunshiuraitorah.com';
const WEBSITE = 'https://irgunshiuraitorah.com/';
usageAnalytics.configure('15.1.23');
const TOKEN_KEY = 'istAppSessionToken';
const SPEED_KEY = 'istPlaybackSpeed';
const VISITOR_KEY = 'istAppVisitorId';
const OFFLINE_DOWNLOADS_KEY = 'istOfflineDownloadsV1';
const PLAYLISTS_KEY = 'istCustomPlaylistsV1';
const RECENT_SEARCHES_KEY = 'istRecentSearchesV1';
const UPCOMING_REMINDERS_KEY = 'istUpcomingRemindersV1';
const UPCOMING_REMINDER_MINUTES_KEY = 'istUpcomingReminderMinutesV1';
const UPCOMING_REMINDER_LOCATIONS_KEY = 'istUpcomingReminderLocationsV1';
const SCHEDULE_CITY_FILTER_KEY = 'istScheduleCityFilterV1';
const SKIP_SECONDS_KEY = 'istSkipSecondsV1';
const audio = document.getElementById('audioEngine');
const app = document.getElementById('app');
const persistentVideoMount = document.getElementById('persistentVideoMount');
const IrgunDownloader = registerPlugin('IrgunDownloader');
const IrgunPush = registerPlugin('IrgunPush');
const IrgunFullscreen = registerPlugin('IrgunFullscreen');
const IrgunPlayback = registerPlugin('IrgunPlayback');
let nativeVideoFullscreen = false;

async function setNativeVideoFullscreen(enabled) {
  if (Capacitor.getPlatform() !== 'android') return;
  const next = Boolean(enabled);
  if (nativeVideoFullscreen === next) return;
  nativeVideoFullscreen = next;
  try {
    await IrgunFullscreen.set({ enabled: next });
  } catch (error) {
    nativeVideoFullscreen = false;
    console.warn('Android fullscreen system-bar sync failed', error);
  }
}

function syncDocumentFullscreenToNative() {
  const element = document.fullscreenElement || document.webkitFullscreenElement || null;
  setNativeVideoFullscreen(Boolean(element));
}

document.addEventListener('fullscreenchange', syncDocumentFullscreenToNative);
document.addEventListener('webkitfullscreenchange', syncDocumentFullscreenToNative);
window.addEventListener('pagehide', () => { setNativeVideoFullscreen(false); });
const APP_PUSH_TOKEN_KEY = 'istAppFcmToken';
const ADMIN_MODE_KEY = 'istAppAdminMode';
const SPONSOR_DEDICATION_TYPES = [
  'Leilui Nishmat / In Memory Of', 'In Honor Of', 'Anonymous',
  'Refuah Shelema / Speedy Recovery', 'Shidduchim / Find a Soulmate', 'Blessing for Children',
  'Parnassah / Livelihood', 'Hatzlacha / Success', 'Shmira / Protection', 'Yeshuot',
  'Successful Surgery', 'All the Brachot of the Torah',
  'Happy Birthday', 'Happy Anniversary', 'Mazal Tov', 'Thank You'
];
const DONATION_PROVIDER_URLS = {
  card: 'https://secure.cardknox.com/irgunshiuraitorah',
  donorsfund: 'https://www.thedonorsfund.org/donate/irgun-shiurai-torah/113407360',
  matbia: 'https://app.matbia.org/d/00124237215',
  paypal: 'https://www.paypal.com/donate/?cmd=_s-xclick&hosted_button_id=BEA6CX2HK98RL&ssrt=1783550669655',
  ojc: 'https://secure.ojccardpaymentsite.org/MgAAADkAAAA4AAAANgAAAA=='
};

const state = {
  loading: true,
  libraryReady: false,
  error: '',
  offlineMode: false,
  usingCachedLibrary: false,
  offlineCacheSavedAt: 0,
  screen: 'home',
  videos: [],
  audioItems: [],
  videoById: new Map(),
  audioById: new Map(),
  metadata: { speakers: [], topics: [], lectures: {} },
  speakerById: new Map(),
  topicById: new Map(),
  speakerAliasToId: new Map(),
  trends: { week: new Map(), month: new Map(), all: new Map() },
  counter: 1124579,
  likeCounts: {},
  user: null,
  token: localStorage.getItem(TOKEN_KEY) || '',
  myLikes: new Set(),
  watchLater: new Set(),
  follows: new Map(),
  history: [],
  accountSection: 'profile',
  notificationSettings: { pushEnabled:false, emailEnabled:false, pushConfigured:false, emailConfigured:false },
  notificationBusy: false,
  librarySection: 'likes',
  authMode: 'login',
  authBusy: false,
  authMessage: '',
  authVerifyEmail: '',
  authVerifyPassword: '',
  deleteDialog: false,
  deleteBusy: false,
  libraryMode: 'all',
  librarySort: 'newest',
  libraryQuery: '',
  librarySearchMode: 'catalog',
  transcriptMatchedVideoIds: new Set(),
  transcriptMatchTimes: new Map(),
  transcriptSearchSerial: 0,
  libraryLimit: 48,
  filters: { location: [], year: [], language: [], speaker: [], topic: [] },
  filterDialog: '',
  filterDraft: new Set(),
  filterPanelOpen: false,
  scheduleFiles: [],
  scheduleLoaded: false,
  scheduleLoading: false,
  scheduleError: '',
  scheduleData: { events: [], sources: [] },
  scheduleDataLoaded: false,
  scheduleDataLoading: false,
  scheduleDataError: '',
  scheduleView: 'upcoming',
  scheduleCityFilter: localStorage.getItem(SCHEDULE_CITY_FILTER_KEY) || 'all',
  liveOverrides: new Set(),
  liveStatusLoaded: false,
  sponsorRibbon: null,
  paidCatalog: [],
  paidLoaded: false,
  paidLoading: false,
  paidError: '',
  paidExpandedId: '',
  paidCheckoutItemId: '',
  paidCheckoutBusy: false,
  paidCheckoutMessage: '',
  paidCheckout: null,
  paidPaymentElement: null,
  paidCheckoutActions: null,
  paidProgressLastAt: 0,
  paidPlaySessionCache: new Map(),
  paidPlaySessionPrefetch: new Map(),
  recurringDonations: [],
  recurringLoaded: false,
  recurringLoading: false,
  recurringError: '',
  recurringActionBusy: '',
  donationProvider: 'stripe',
  donationMode: 'donation',
  donationFrequency: 'one_time',
  donationTermType: 'ongoing',
  donationDraft: { amount:'36', name:'', email:'', phone:'', note:'', termMonths:12, billingDay:new Date().getDate(), sponsorPlan:'day', sponsorStartDate:'', dedicationType:'', nameEn:'', nameHe:'' },
  sponsorPrices: { day:10000, week:50000, month:200000 },
  sponsorPricesLoaded: false,
  sponsorPricesLoading: false,
  donationPaymentStage: false,
  donationCheckout: null,
  donationPaymentElement: null,
  donationCheckoutActions: null,
  donationCheckoutBusy: false,
  donationCheckoutMessage: '',
  donationCheckoutSessionId: '',
  donationSuccess: '',
  isAdmin: false,
  adminChecked: false,
  adminMode: localStorage.getItem(ADMIN_MODE_KEY) === '1',
  adminLoading: false,
  adminLoaded: false,
  adminError: '',
  adminStatus: null,
  adminAdmins: [],
  adminLive: { 'Boro Park':false, Flatbush:false },
  adminRibbon: { enabled:false, textEn:'', textHe:'', linkUrl:'' },
  adminSponsorPrices: { day:100, week:500, month:2000 },
  adminSponsorships: [],
  adminViewCounts: { actualWebsiteViews:0, items:[] },
  adminReviewItems: [],
  adminScheduleAdsView: 'review',
  adminDropboxAds: null,
  adminDropboxAdsLoading: false,
  adminDropboxAdsError: '',
  adminDonations: [],
  adminEditingSponsorshipId: '',
  adminReviewEditor: null,
  adminScheduleEditor: null,
  adminPaidEditor: null,
  adminVideoEditor: null,
  adminPaidCatalog: [],
  adminPaidCatalogLoaded: false,
  adminActionBusy: '',
  contactMessage: '',
  homeTrendPeriod: 'week',
  searchQuery: '',
  searchMode: 'all',
  current: null,
  nativePlayback: { connected:false, lectureId:'', vimeoId:'', mode:'AUDIO', presentationMode:'FULL', currentPositionMs:0, durationMs:0, isPlaying:false, playbackSpeed:Number(localStorage.getItem(SPEED_KEY) || 1), volume:1, audioReady:false, audioPositionMs:0, audioDurationMs:0, audioIsPlaying:false, audioPlayWhenReady:false, hasAudioSource:false },
  nativePlaybackDisabled: false,
  playbackAuthorityFence: null,
  nativeBackgroundHandoff: false,
  playerOpen: false,
  sleepTimer: null,
  sleepEndsAt: null,
  sleepMode: 'off',
  playbackSpeed: Number(localStorage.getItem(SPEED_KEY) || 1),
  watchVideo: null,
  watchMode: 'video',
  watchComments: [],
  watchCommentsLoading: false,
  watchCommentsError: '',
  editingCommentId: '',
  watchResumeSeconds: 0,
  watchMinimized: false,
  watchHostedExternally: false,
  watchVimeo: null,
  watchVimeoReady: false,
  watchVideoPlaying: false,
  systemPipActive: false,
  systemPipWasPlaying: false,
  systemPipLastSeconds: 0,
  watchVideoToAudioHandoff: false,
  watchAudioToVideoHandoff: false,
  watchAudioToVideoCommitBusy: false,
  watchAudioToVideoCommitPromise: null,
  watchAudioToVideoCommitPromiseId: '',
  watchAudioToVideoHandoffId: '',
  watchAudioToVideoTargetSeconds: 0,
  watchVimeoGeneration: 0,
  watchVimeoHistoryTimer: null,
  mediaSwitchBusy: false,
  pendingWatchMode: '',
  nativeRecoveryBusy: false,
  audioHistoryTimer: null,
  audioLastHistoryAt: 0,
  historyLastMediaType: new Map(),
  historyWriteChains: new Map(),
  publicCounted: new Set(),
  downloadJobs: new Map(),
  downloadPanelOpen: false,
  downloaderReady: false,
  offlineDownloads: new Map((loadJson(OFFLINE_DOWNLOADS_KEY, []) || []).map(item => [String(item?.key || ''), item]).filter(([key]) => key)),
  offlineJobs: new Map(),
  playlists: [],
  activePlaylistId: '',
  playlistPickerItem: null,
  playQueue: [],
  playQueueIndex: -1,
  queueStarting: false,
  recentSearches: Array.isArray(loadJson(RECENT_SEARCHES_KEY, [])) ? loadJson(RECENT_SEARCHES_KEY, []).slice(0,8) : [],
  speakerDiscoverySeed: Math.floor(Math.random() * 2147483647),
  speakerDiscoveryShuffle: 0,
  playbackPositions: new Map(),
  skipSeconds: [10,15,30].includes(Number(localStorage.getItem(SKIP_SECONDS_KEY))) ? Number(localStorage.getItem(SKIP_SECONDS_KEY)) : 15,
  upcomingRemindersEnabled: localStorage.getItem(UPCOMING_REMINDERS_KEY) === '1',
  upcomingReminderMinutes: [10,30,60].includes(Number(localStorage.getItem(UPCOMING_REMINDER_MINUTES_KEY))) ? Number(localStorage.getItem(UPCOMING_REMINDER_MINUTES_KEY)) : 30,
  upcomingReminderLocations: loadReminderLocations(),
  toast: ''
};

audio.playbackRate = state.playbackSpeed;

function tr(key, values = {}) {
  if (window.IST_I18N && typeof window.IST_I18N.t === 'function') {
    return window.IST_I18N.t(key, values);
  }
  return String(key).replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] == null ? '' : values[name]);
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function shiurTitleParts(value, fallback = 'Untitled shiur') {
  const raw = String(value == null ? '' : value);
  const visible = raw.replace(/\s*#.*$/s, '').trim();
  const match = visible.match(/^\s*((?:I\.?S\.?T\.?[- ]*)?(?:SF|SN|DL|SB)[- ]?\d{2,5})\s*(?:[-–—:|]\s*)?/i);
  if (!match) return { title: visible || fallback, code: '' };
  const number = (match[1].match(/(\d{2,5})/i) || [])[1] || '';
  const prefix = (match[1].match(/(SF|SN|DL|SB)/i) || [])[1] || '';
  const code = prefix && number ? `IST-${prefix.toUpperCase()}${number}` : match[1];
  const clean = visible.slice(match[0].length).trim();
  return { title: clean || visible || fallback, code };
}

function displayShiurTitle(value, fallback = 'Untitled shiur') {
  return shiurTitleParts(value, fallback).title;
}

function shiurCatalogCode(item) {
  const explicit = String((item && (item.shiurCode || item.code)) || '').trim();
  return explicit || shiurTitleParts((item && (item.title || item.name)) || '', '').code;
}


// V15.0.28 / iOS V1.2.33 TEST EXPERIENCE FIXES -------------------------
function compactShiurCode(value) {
  const normalized = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = normalized.match(/(?:IST)?(SF|SN|DL|SB)(\d{2,5})/);
  return match ? `IST${match[1]}${match[2]}` : '';
}

function lectureCodeQuery(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const key = compactShiurCode(raw);
  if (!key) return '';
  // Only activate code-only matching when a recognized lecture-code prefix is present.
  return /(?:IST\s*[-.]?\s*)?(?:SF|SN|DL|SB)\s*[- ]?\d{2,5}/i.test(raw) ? key : '';
}

function lectureCodeMatches(item, queryKey) {
  if (!queryKey) return true;
  const explicit = compactShiurCode(shiurCatalogCode(item));
  if (explicit && explicit === queryKey) return true;
  const titleKey = compactShiurCode(item && (item.title || item.name));
  return Boolean(titleKey && titleKey === queryKey);
}

function lectureCodeVariants(item) {
  const key = compactShiurCode(shiurCatalogCode(item));
  if (!key) return [];
  const short = key.replace(/^IST/, '');
  return [key, short, key.replace(/^IST/, 'IST-')];
}

function persistLocalCollection(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function persistOfflineDownloads() {
  persistLocalCollection(OFFLINE_DOWNLOADS_KEY, [...state.offlineDownloads.values()]);
}

function persistPlaylists() {
  // Custom playlists are account data. Never persist playlist contents to device storage.
}

function loadReminderLocations() {
  const raw = loadJson(UPCOMING_REMINDER_LOCATIONS_KEY, null);
  if (!Array.isArray(raw)) return null; // null means every city.
  return new Set(raw.map(value => String(value || '').trim()).filter(Boolean));
}

function persistReminderLocations() {
  try {
    if (state.upcomingReminderLocations === null) localStorage.removeItem(UPCOMING_REMINDER_LOCATIONS_KEY);
    else localStorage.setItem(UPCOMING_REMINDER_LOCATIONS_KEY, JSON.stringify([...state.upcomingReminderLocations]));
  } catch (_) {}
}

function persistRecentSearches() {
  persistLocalCollection(RECENT_SEARCHES_KEY, state.recentSearches.slice(0, 8));
}

function rememberLibrarySearch(value) {
  const query = String(value || '').trim();
  if (query.length < 2) return;
  state.recentSearches = [query, ...state.recentSearches.filter(item => normalizeText(item) !== normalizeText(query))].slice(0, 8);
  persistRecentSearches();
}

function mediaRef(kind, id) {
  const normalizedKind = kind === 'audio' || kind === 'library-audio' ? 'audio' : 'video';
  return { kind: normalizedKind, id: String(id || '').replace(/^audio:/, '') };
}

function mediaRefKey(ref) {
  if (!ref) return '';
  return `${ref.kind === 'audio' ? 'audio' : 'video'}:${String(ref.id || '').replace(/^audio:/, '')}`;
}

function itemFromMediaRef(ref) {
  if (!ref) return null;
  if (ref.kind === 'audio') {
    const item = state.audioById.get(String(ref.id || ''));
    return item ? { ...item, _kind:'audio' } : null;
  }
  const item = state.videoById.get(String(ref.id || ''));
  return item ? { ...item, _kind:'video' } : null;
}

function offlineKeyFor(kind, id) {
  return `${kind === 'audio' || kind === 'library-audio' ? 'audio' : 'video'}:${String(id || '').replace(/^audio:/, '')}`;
}

function offlineRecordForAudioItem(item) {
  if (!item) return null;
  if (item.kind === 'library-audio') return state.offlineDownloads.get(offlineKeyFor('audio', item.id)) || null;
  if (item.kind === 'video-audio') return state.offlineDownloads.get(offlineKeyFor('video', item.id)) || null;
  return null;
}

function offlineRecordForCatalogItem(item) {
  if (!item) return null;
  return state.offlineDownloads.get(offlineKeyFor(item._kind === 'audio' ? 'audio' : 'video', item._kind === 'audio' ? rawAudioId(item) : videoId(item))) || null;
}

function offlineFileUrl(record) {
  if (!record || !record.uri) return '';
  try { return Capacitor.convertFileSrc(record.uri); } catch (_) { return record.uri; }
}

function humanBytes(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return '';
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function offlineActionState(kind, id) {
  const key = offlineKeyFor(kind, id);
  const record = state.offlineDownloads.get(key) || null;
  const job = state.offlineJobs.get(key) || null;
  if (record) return { key, record, job:null, status:'saved', cls:'offline-saved', label:currentLanguage()==='he'?'הסר שמירה לא מקוונת':'Remove Offline' };
  if (job) {
    const percent = Number(job.percent) || 0;
    return { key, record:null, job, status:'downloading', cls:'offline-downloading', label:percent > 0 ? `${currentLanguage()==='he'?'מוריד':'Downloading'} ${percent}%` : (currentLanguage()==='he'?'מוריד…':'Downloading…') };
  }
  return { key, record:null, job:null, status:'idle', cls:'', label:currentLanguage()==='he'?'האזנה ללא אינטרנט':'Listen Offline' };
}

function refreshOfflineButtonElement(button) {
  if (!button) return;
  const info = offlineActionState(button.dataset.saveOfflineKind, button.dataset.saveOfflineId);
  button.classList.toggle('offline-saved', info.status === 'saved');
  button.classList.toggle('offline-downloading', info.status === 'downloading');
  button.setAttribute('aria-busy', info.status === 'downloading' ? 'true' : 'false');
  button.setAttribute('aria-label', info.label);
  button.setAttribute('title', info.label);
  const visible = button.querySelector('.watch-action-text') || [...button.querySelectorAll('span')].find(node => !node.classList.contains('action-symbol') && !node.classList.contains('sr-only') && !node.classList.contains('offline-progress-badge'));
  if (visible) visible.textContent = info.label;
  const sr = button.querySelector('.sr-only');
  if (sr) sr.textContent = info.label;
  let badge = button.querySelector('.offline-progress-badge');
  if (info.status === 'downloading') {
    if (!badge) { badge = document.createElement('span'); badge.className = 'offline-progress-badge'; button.appendChild(badge); }
    badge.textContent = Number(info.job?.percent) > 0 ? `${Number(info.job.percent)}%` : '…';
  } else if (badge) badge.remove();
}

function refreshOfflineButtonsForKey(key = '') {
  document.querySelectorAll('[data-save-offline-kind]').forEach(button => {
    const buttonKey = offlineKeyFor(button.dataset.saveOfflineKind, button.dataset.saveOfflineId);
    if (!key || key === buttonKey) refreshOfflineButtonElement(button);
  });
}

async function saveOffline(kind, id) {
  const normalizedKind = kind === 'audio' ? 'audio' : 'video';
  const key = offlineKeyFor(normalizedKind, id);
  if (state.offlineDownloads.has(key)) {
    const confirmed = confirm(currentLanguage() === 'he' ? 'להסיר את העותק השמור להאזנה ללא אינטרנט?' : 'Remove the saved offline copy?');
    if (confirmed) await deleteOffline(key, { stayHere:true });
    return;
  }
  if (state.offlineJobs.has(key)) {
    setToast(currentLanguage() === 'he' ? 'ההורדה כבר מתבצעת.' : 'This shiur is already downloading.');
    refreshOfflineButtonsForKey(key);
    return;
  }
  if (!Capacitor.isNativePlatform()) {
    alert(currentLanguage() === 'he' ? 'שמירה להאזנה ללא אינטרנט זמינה באפליקציה המותקנת.' : 'Offline listening is available in the installed app.');
    return;
  }
  const item = normalizedKind === 'audio' ? state.audioById.get(String(id)) : state.videoById.get(String(id));
  if (!item || (normalizedKind === 'video' && !item.hasAudio)) {
    alert(currentLanguage() === 'he' ? 'קובץ שמע אינו זמין לשמירה.' : 'An audio file is not available to save offline.');
    return;
  }
  usageAnalytics.event('offline_listen_started', { shiurId:String(id || ''), mediaType:'audio', dedupeKey:`offline:${normalizedKind}:${id}`, cooldownMs:3000 });
  const rawId = normalizedKind === 'audio' ? rawAudioId(item) : videoId(item);
  const sourceId = normalizedKind === 'audio' ? rawId : mediaApiId(item, rawId);
  const url = `${API}/download/${encodeURIComponent(sourceId)}?type=audio`;
  const title = itemTitle({ ...item, _kind: normalizedKind === 'audio' ? 'audio' : 'video' });
  const subtitle = itemSubtitle({ ...item, _kind: normalizedKind === 'audio' ? 'audio' : 'video' });
  const safe = key.replace(/[^A-Za-z0-9_-]+/g, '_');
  const path = `irgun-offline/${safe}.mp3`;
  state.offlineJobs.set(key, { percent:0, title });
  refreshOfflineButtonsForKey(key);
  if (state.screen === 'library' && state.librarySection === 'downloads') render();
  let listener = null;
  try {
    await Filesystem.mkdir({ directory: Directory.Data, path:'irgun-offline', recursive:true }).catch(() => {});
    const fileInfo = await Filesystem.getUri({ directory: Directory.Data, path });
    listener = await FileTransfer.addListener('progress', progress => {
      if (String(progress?.url || '') !== url) return;
      const total = Number(progress?.contentLength) || 0;
      const bytes = Number(progress?.bytes) || 0;
      const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(bytes / total * 100))) : 0;
      state.offlineJobs.set(key, { percent, bytes, total, title });
      const node = document.querySelector(`[data-offline-progress="${CSS.escape(key)}"]`);
      if (node) node.textContent = total > 0 ? `${percent}%` : (currentLanguage() === 'he' ? 'שומר…' : 'Saving…');
      refreshOfflineButtonsForKey(key);
    });
    const headers = { 'X-Irgun-App':'1' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    await FileTransfer.downloadFile({ url, path:fileInfo.uri, headers, progress:true });
    const stat = await Filesystem.stat({ directory:Directory.Data, path }).catch(() => ({}));
    state.offlineDownloads.set(key, {
      key, kind:normalizedKind, id:rawId, sourceId, title, subtitle,
      uri:fileInfo.uri, path, bytes:Number(stat?.size) || Number(state.offlineJobs.get(key)?.total) || 0,
      savedAt:Date.now()
    });
    state.offlineJobs.delete(key);
    persistOfflineDownloads();
    setToast(currentLanguage() === 'he' ? 'נשמר להאזנה ללא אינטרנט.' : 'Saved for offline listening.');
    if (state.screen === 'library' && state.librarySection === 'downloads') render(); else { refreshInteractiveUi(); refreshOfflineButtonsForKey(key); }
  } catch (error) {
    console.warn('Offline save failed', error);
    state.offlineJobs.delete(key);
    setToast(currentLanguage() === 'he' ? 'לא היה אפשר לשמור את השיעור.' : 'Could not save this shiur offline.');
    if (state.screen === 'library' && state.librarySection === 'downloads') render(); else refreshOfflineButtonsForKey(key);
  } finally {
    try { if (listener && typeof listener.remove === 'function') await listener.remove(); } catch (_) {}
  }
}

async function deleteOffline(key, options = {}) {
  const record = state.offlineDownloads.get(String(key || ''));
  if (!record) return;
  try { await Filesystem.deleteFile({ directory:Directory.Data, path:record.path }); } catch (_) {}
  state.offlineDownloads.delete(record.key);
  persistOfflineDownloads();
  setToast(currentLanguage() === 'he' ? 'העותק הלא מקוון הוסר.' : 'Offline copy removed.');
  if (state.screen === 'library' && state.librarySection === 'downloads' && !options.stayHere) render();
  else { refreshInteractiveUi(); refreshOfflineButtonsForKey(record.key); }
}

async function playOfflineRecord(key) {
  resetWatchPresentationForStandaloneAudio();
  const record = state.offlineDownloads.get(String(key || ''));
  if (!record) return;
  const url = offlineFileUrl(record);
  if (!url) return;
  state.queueStarting = false;
  await startAudio({
    kind:record.kind === 'audio' ? 'library-audio' : 'video-audio',
    id:record.id, sourceId:record.sourceId || record.id,
    title:record.title || 'Shiur', subtitle:record.subtitle || '', thumbnail:'',
    url, networkUrl:record.kind === 'audio' ? audioUrl(record.sourceId || record.id) : audioUrl(record.sourceId || record.id),
    offline:true, offlineKey:record.key
  }, 0);
}

function normalizePlaylistStore(value) {
  if (!Array.isArray(value)) return [];
  return value.map(row => ({
    id:String(row?.id || ''), name:String(row?.name || '').trim(),
    items:Array.isArray(row?.items) ? row.items.map(item => mediaRef(item?.kind, item?.id)).filter(item => item.id) : []
  })).filter(row => row.id && row.name);
}

function saveDestinationState(kind, id) {
  const ref = mediaRef(kind, id);
  const saveId = ref.kind === 'audio' ? `audio:${ref.id}` : String(ref.id || '');
  const key = mediaRefKey(ref);
  const savedForLater = state.watchLater.has(saveId);
  const inCustomPlaylist = state.playlists.some(playlist =>
    Array.isArray(playlist.items) && playlist.items.some(item => mediaRefKey(item) === key)
  );
  return { ref, saveId, savedForLater, inCustomPlaylist };
}

function saveDestinationPresentation(kind, id) {
  const status = saveDestinationState(kind, id);
  const customOnly = !status.savedForLater && status.inCustomPlaylist;
  return {
    ...status,
    cls: status.savedForLater ? 'saved' : (customOnly ? 'playlist-saved' : ''),
    label: status.savedForLater ? 'Saved' : (customOnly ? 'Playlist' : 'Save')
  };
}

function closePlaylistPickerInPlace() {
  state.playlistPickerItem = null;
  document.querySelectorAll('.playlist-picker-backdrop').forEach(node => node.remove());
}

function refreshSaveDestinationButtons(kind = '', id = '') {
  const normalizedKind = kind ? mediaRef(kind, id).kind : '';
  const normalizedId = id == null ? '' : String(id).replace(/^audio:/, '');
  document.querySelectorAll('[data-open-playlist-picker]').forEach(button => {
    const buttonKind = mediaRef(button.dataset.playlistKind || 'video', button.dataset.playlistId || '').kind;
    const buttonId = String(button.dataset.playlistId || '').replace(/^audio:/, '');
    if (normalizedKind && (buttonKind !== normalizedKind || buttonId !== normalizedId)) return;
    const presentation = saveDestinationPresentation(buttonKind, buttonId);
    button.classList.toggle('saved', presentation.savedForLater);
    button.classList.toggle('playlist-saved', !presentation.savedForLater && presentation.inCustomPlaylist);
    button.setAttribute('aria-label', tr(presentation.label));
    button.setAttribute('title', tr(presentation.label));
    const watchLabel = button.querySelector('.watch-action-text');
    if (watchLabel) watchLabel.textContent = tr(presentation.label);
    const playerLabel = button.closest('.player-action-grid') ? button.querySelector('span:not(.action-symbol):not(.sr-only)') : null;
    if (playerLabel) playerLabel.textContent = tr(presentation.label);
    const sr = button.querySelector('.sr-only');
    if (sr) sr.textContent = tr(presentation.label);
  });
}

async function createPlaylist(name, addRef = null) {
  const label = String(name || '').trim().slice(0, 80);
  if (!label) return null;
  if (!state.user) { requireLogin(currentLanguage()==='he'?'התחברו כדי לשמור רשימות בחשבון.':'Sign in to save playlists to your account.'); return null; }
  try {
    const body = { name:label };
    if (addRef) body.item = mediaRef(addRef.kind, addRef.id);
    const data = await apiJson('/custom-playlists/create', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const playlist = normalizePlaylistStore([data.playlist])[0] || null;
    if (!playlist) throw new Error('Playlist could not be created.');
    state.playlists = [playlist, ...state.playlists.filter(row => row.id !== playlist.id)];
    return playlist;
  } catch (error) {
    alert(error.message || 'Could not create playlist.');
    return null;
  }
}

async function addToPlaylist(playlistId, ref) {
  const playlist = state.playlists.find(row => row.id === String(playlistId));
  if (!playlist || !ref || !state.user) return;
  const normalized = mediaRef(ref.kind, ref.id);
  const key = mediaRefKey(normalized);
  const alreadySaved = playlist.items.some(item => mediaRefKey(item) === key);

  // V15.1.22: custom playlists toggle exactly like Save for Later. The local
  // account state changes immediately so the watch-page color never waits for a
  // route change or a second render. The server request then confirms it.
  if (alreadySaved) {
    const removed = playlist.items.find(item => mediaRefKey(item) === key) || normalized;
    playlist.items = playlist.items.filter(item => mediaRefKey(item) !== key);
    closePlaylistPickerInPlace();
    refreshSaveDestinationButtons(normalized.kind, normalized.id);
    setToast(currentLanguage() === 'he' ? `הוסר מ-${playlist.name}` : `Removed from ${playlist.name}`);
    try {
      await apiJson('/custom-playlists/remove', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ playlistId:playlist.id, item:normalized }) });
      if (!state.watchVideo && state.screen === 'library' && state.librarySection === 'playlists') render();
    } catch (error) {
      if (!playlist.items.some(item => mediaRefKey(item) === key)) playlist.items.push(removed);
      refreshSaveDestinationButtons(normalized.kind, normalized.id);
      alert(error.message || 'Could not remove from playlist.');
    }
    return;
  }

  playlist.items.push(normalized);
  closePlaylistPickerInPlace();
  refreshSaveDestinationButtons(normalized.kind, normalized.id);
  setToast(currentLanguage() === 'he' ? `נוסף אל ${playlist.name}` : `Added to ${playlist.name}`);
  try {
    await apiJson('/custom-playlists/add', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ playlistId:playlist.id, item:normalized }) });
    if (!state.watchVideo && state.screen === 'library' && state.librarySection === 'playlists') render();
  } catch (error) {
    playlist.items = playlist.items.filter(item => mediaRefKey(item) !== key);
    refreshSaveDestinationButtons(normalized.kind, normalized.id);
    alert(error.message || 'Could not add to playlist.');
  }
}

function mediaRefFromKey(key) {
  const raw = String(key || '');
  const split = raw.indexOf(':');
  if (split < 0) return mediaRef('video', raw);
  return mediaRef(raw.slice(0, split), raw.slice(split + 1));
}

async function removeFromPlaylist(playlistId, key) {
  const playlist = state.playlists.find(row => row.id === String(playlistId));
  if (!playlist || !state.user) return;
  const ref = mediaRefFromKey(key);
  const removed = playlist.items.find(item => mediaRefKey(item) === String(key)) || ref;
  playlist.items = playlist.items.filter(item => mediaRefKey(item) !== String(key));
  refreshSaveDestinationButtons(ref.kind, ref.id);
  if (state.screen === 'library' && state.librarySection === 'playlists') render();
  try {
    await apiJson('/custom-playlists/remove', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ playlistId:playlist.id, item:ref }) });
  } catch (error) {
    if (!playlist.items.some(item => mediaRefKey(item) === String(key))) playlist.items.push(removed);
    refreshSaveDestinationButtons(ref.kind, ref.id);
    if (state.screen === 'library' && state.librarySection === 'playlists') render();
    alert(error.message || 'Could not remove from playlist.');
  }
}

async function deletePlaylist(playlistId) {
  const playlist = state.playlists.find(row => row.id === String(playlistId));
  if (!playlist || !state.user) return;
  if (!confirm(currentLanguage() === 'he' ? `למחוק את הרשימה “${playlist.name}”?` : `Delete playlist “${playlist.name}”?`)) return;
  try {
    await apiJson('/custom-playlists/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ playlistId:playlist.id }) });
    state.playlists = state.playlists.filter(row => row.id !== playlist.id);
    if (state.activePlaylistId === playlist.id) state.activePlaylistId = '';
    render();
  } catch (error) { alert(error.message || 'Could not delete playlist.'); }
}

function openPlaylistPicker(kind, id) {
  if (!state.user) return requireLogin(currentLanguage()==='he'?'התחברו כדי לשמור שיעורים ורשימות בחשבון.':'Sign in to save shiurim and playlists to your account.');
  state.playlistPickerItem = mediaRef(kind, id);
  render();
}

function playlistPickerHtml() {
  if (!state.playlistPickerItem) return '';
  const he = currentLanguage() === 'he';
  const ref = state.playlistPickerItem;
  const saveId = ref.kind === 'audio' ? `audio:${ref.id}` : String(ref.id || '');
  const savedForLater = state.watchLater.has(saveId);
  const saveLaterLabel = savedForLater
    ? (he ? 'הסר משמירה לאחר כך' : 'Remove from Save for Later')
    : (he ? 'שמור לאחר כך' : 'Save for Later');
  const saveLaterNote = state.user
    ? (savedForLater ? (he ? 'כבר שמור בחשבון' : 'Saved to your account') : (he ? 'נשמר בחשבון שלך' : 'Syncs with your account'))
    : (he ? 'נדרשת התחברות' : 'Sign in required');
  const playlistRows = state.playlists.length
    ? `<div class="playlist-picker-list">${state.playlists.map(pl => {
        const already = pl.items.some(item => mediaRefKey(item) === mediaRefKey(ref));
        return `<button data-playlist-add-target="${esc(pl.id)}" class="${already ? 'playlist-already-saved' : ''}"><span>${svgIcon('playlist')}</span><strong>${esc(pl.name)}</strong><small>${already ? '✓' : pl.items.length}</small></button>`;
      }).join('')}</div>`
    : `<div class="empty">${he?'עדיין אין רשימות. צרו את הראשונה למטה.':'No playlists yet. Create your first one below.'}</div>`;
  return `<div class="playlist-picker-backdrop" data-playlist-picker-close="1"><section class="playlist-picker save-picker" data-playlist-picker-panel="1" role="dialog" aria-modal="true"><div class="playlist-picker-head"><div><small>${he?'שמירה':'SAVE'}</small><h2>${he?'שמירת שיעור':'Save Shiur'}</h2></div><button data-playlist-picker-close="1" aria-label="Close">×</button></div><button type="button" class="save-later-destination ${savedForLater ? 'saved' : ''}" data-save="${esc(saveId)}"><span>${svgIcon('bookmark')}</span><strong>${saveLaterLabel}</strong><small>${saveLaterNote}</small></button><div class="playlist-picker-label">${he?'רשימות השמעה':'PLAYLISTS'}</div>${playlistRows}<form id="playlistCreateForm" class="playlist-create-form"><input id="playlistCreateName" maxlength="80" placeholder="${he?'שם הרשימה':'Playlist name'}" required><button type="submit">${he?'צור ושמור':'Create & Save'}</button></form><p class="device-only-note">${he?'רשימות ההשמעה נשמרות בחשבון ומסתנכרנות בין המכשירים.':'Playlists are saved to your account and sync across your devices.'}</p></section></div>`;
}

function playlistItemHtml(ref, playlistId, index) {
  const item = itemFromMediaRef(ref);
  if (!item) return '';
  const canListen = item._kind === 'audio' || item.hasAudio;
  return `<article class="playlist-row"><div class="playlist-order">${index + 1}</div><div class="playlist-row-copy"><strong>${esc(itemTitle(item))}</strong><small>${esc(itemSubtitle(item))}</small></div><div class="playlist-row-actions"><button data-playlist-play="${esc(playlistId)}" data-playlist-index="${index}">${canListen ? svgIcon('audio') : svgIcon('play')} ${currentLanguage()==='he'?'נגן':'Play'}</button><button class="danger" data-playlist-remove="${esc(playlistId)}" data-playlist-key="${esc(mediaRefKey(ref))}">×</button></div></article>`;
}

async function playMediaReference(ref, queueRefs = null, index = -1) {
  const item = itemFromMediaRef(ref);
  if (!item) return;
  if (Array.isArray(queueRefs)) {
    state.playQueue = queueRefs.map(value => mediaRef(value.kind, value.id));
    state.playQueueIndex = Number(index) || 0;
  }
  state.queueStarting = true;
  try {
    if (item._kind === 'audio') await playLibraryAudio(rawAudioId(item));
    else if (item.hasAudio) await playVideoAudio(videoId(item));
    else await openWatch(videoId(item));
  } finally { state.queueStarting = false; }
}

async function advanceQueue(delta) {
  if (!state.playQueue.length) return false;
  const next = state.playQueueIndex + Number(delta || 0);
  if (next < 0 || next >= state.playQueue.length) return false;
  state.playQueueIndex = next;
  await playMediaReference(state.playQueue[next], state.playQueue, next);
  return true;
}

function playlistLibraryHtml() {
  const he = currentLanguage() === 'he';
  const active = state.playlists.find(row => row.id === state.activePlaylistId);
  if (active) return `<section class="local-library-panel"><div class="section-head"><div><button class="back-inline" data-playlist-back="1">${he?'→ כל הרשימות':'← All playlists'}</button><h2>${esc(active.name)}</h2><p>${active.items.length} ${he?'פריטים':'items'} · ${he?'מסונכרן לחשבון':'synced to your account'}</p></div>${active.items.length ? `<button class="section-link" data-playlist-play="${esc(active.id)}" data-playlist-index="0">${svgIcon('play')} ${he?'נגן הכל':'Play All'}</button>` : ''}</div><div class="playlist-detail-list">${active.items.length ? active.items.map((ref,index)=>playlistItemHtml(ref,active.id,index)).join('') : `<div class="empty">${he?'הרשימה ריקה. הוסיפו שיעורים מכרטיסי השיעור או מהנגן.':'This playlist is empty. Add shiurim from a card or the player.'}</div>`}</div><button class="small-btn danger playlist-delete" data-playlist-delete="${esc(active.id)}">${he?'מחק רשימה':'Delete Playlist'}</button></section>`;
  return `<section class="local-library-panel"><div class="section-head"><div><h2>${he?'רשימות השמעה':'Playlists'}</h2><p>${he?'צרו רשימות משלכם לנושאים, השבוע או כל סדר האזנה.':'Create your own lists for topics, this week, or any listening order.'}</p></div></div><form id="libraryPlaylistCreateForm" class="playlist-create-form"><input id="libraryPlaylistCreateName" maxlength="80" placeholder="${he?'שם רשימה חדשה':'New playlist name'}" required><button type="submit">${he?'צור רשימה':'Create Playlist'}</button></form><div class="playlist-card-grid">${state.playlists.length ? state.playlists.map(pl=>`<button class="playlist-card" data-playlist-open="${esc(pl.id)}"><span>${svgIcon('playlist')}</span><strong>${esc(pl.name)}</strong><small>${pl.items.length} ${he?'פריטים':'items'}</small></button>`).join('') : `<div class="empty">${he?'עדיין אין רשימות.':'No playlists yet.'}</div>`}</div><p class="device-only-note">${he?'הרשימות נשמרות בחשבון שלך ומסתנכרנות בין מכשירים.':'These playlists are saved to your account and sync across devices.'}</p></section>`;
}

function downloadsLibraryHtml() {
  const he = currentLanguage() === 'he';
  const rows = [...state.offlineDownloads.values()].sort((a,b)=>Number(b.savedAt)-Number(a.savedAt));
  const jobs = [...state.offlineJobs.entries()];
  return `<section class="local-library-panel"><div class="section-head"><div><h2>${he?'הורדות להאזנה ללא אינטרנט':'Offline Downloads'}</h2><p>${he?'השיעורים כאן מתנגנים מהקובץ השמור גם בלי אינטרנט.':'These shiurim play from the saved file even without internet.'}</p></div><small>${rows.length} ${he?'שמורים':'saved'}</small></div>${jobs.length ? `<div class="offline-saving-list">${jobs.map(([key,job])=>`<div class="offline-saving-row"><strong>${esc(job.title||'Shiur')}</strong><span data-offline-progress="${esc(key)}">${job.percent ? `${job.percent}%` : (he?'שומר…':'Saving…')}</span></div>`).join('')}</div>`:''}<div class="offline-list">${rows.length ? rows.map(record=>`<article class="offline-row"><div class="offline-check">✓</div><div><strong>${esc(record.title||'Shiur')}</strong><small>${esc(record.subtitle||'')}${record.bytes?` · ${esc(humanBytes(record.bytes))}`:''}</small></div><div class="offline-row-actions"><button data-offline-play="${esc(record.key)}">${svgIcon('play')} ${he?'נגן':'Play'}</button><button class="danger" data-offline-delete="${esc(record.key)}">${he?'מחק':'Delete'}</button></div></article>`).join('') : `<div class="empty">${he?'עדיין לא נשמרו שיעורים. לחצו “שמירה Offline” בכרטיס שיעור או בנגן.':'Nothing saved yet. Tap “Save Offline” on a shiur card or in the player.'}</div>`}</div></section>`;
}

function activeFilterChipsHtml() {
  const chips = [];
  for (const key of ['location','year','language','speaker','topic']) {
    for (const value of state.filters[key] || []) chips.push(`<button class="active-filter-chip" data-remove-filter="${esc(key)}" data-remove-filter-value="${esc(value)}">${esc(filterLabeler(key,value))} ×</button>`);
  }
  return chips.length ? `<div class="active-filter-chips">${chips.join('')}</div>` : '';
}

function searchAssistHtml() {
  const he = currentLanguage() === 'he';
  const q = String(state.libraryQuery || '').trim();
  const suggestions = [];
  if (q.length >= 2) {
    const codeKey = lectureCodeQuery(q);
    if (codeKey) {
      const codeItem = allLibraryItems().find(item => lectureCodeMatches(item, codeKey));
      if (codeItem) suggestions.push({ label:shiurCatalogCode(codeItem), sub:itemTitle(codeItem), query:shiurCatalogCode(codeItem) });
    }
    const nq = normalizeText(q);
    for (const [id,speaker] of state.speakerById.entries()) {
      if (suggestions.length >= 5) break;
      const label = speakerLabel(id);
      if (label && normalizeText(label).includes(nq)) suggestions.push({ label, sub:he?'מרצה':'Speaker', query:label });
    }
    for (const topic of state.metadata.topics || []) {
      if (suggestions.length >= 7) break;
      const label = topicLabel(String(topic.id));
      if (label && normalizeText(label).includes(nq)) suggestions.push({ label, sub:he?'נושא':'Topic', query:label });
    }
  }
  const recent = !q && state.recentSearches.length ? state.recentSearches.slice(0,5) : [];
  if (!suggestions.length && !recent.length) return '';
  return `<div class="search-assist">${suggestions.map(row=>`<button data-search-suggestion="${esc(row.query)}"><strong>${esc(row.label)}</strong><small>${esc(row.sub)}</small></button>`).join('')}${recent.map(query=>`<button data-search-suggestion="${esc(query)}"><span>${svgIcon('history')}</span><strong>${esc(query)}</strong><small>${he?'חיפוש אחרון':'Recent'}</small></button>`).join('')}</div>`;
}

function refreshSearchAssist() {
  const node = document.getElementById('librarySearchAssist');
  if (node) node.innerHTML = searchAssistHtml();
  bindSearchAssist(node || document);
}

function bindSearchAssist(root=document) {
  root.querySelectorAll?.('[data-search-suggestion]').forEach(el => el.addEventListener('click', () => {
    state.libraryQuery = el.dataset.searchSuggestion || '';
    rememberLibrarySearch(state.libraryQuery);
    const input = document.getElementById('librarySearch'); if (input) input.value = state.libraryQuery;
    runLibrarySearch(); refreshSearchAssist();
  }));
}

function continueListeningItems(limit=4) {
  if (!state.user || !Array.isArray(state.history)) return [];
  return state.history.filter(row => Number(row.progressSeconds || row.positionSeconds || 0) > 15 && !row.completed).slice(0,limit);
}

function discoveryHash(value) {
  let hash = 2166136261;
  for (const ch of String(value || '')) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function speakerDiscoveryMetrics() {
  const metrics = new Map();
  const ensure = id => {
    const key = String(id || '');
    if (!key) return null;
    if (!metrics.has(key)) metrics.set(key, { id:key, count:0, newest:0, recentCount:0, week:0, month:0, all:0, latestTitle:'', latestTopic:'' });
    return metrics.get(key);
  };
  const cutoff = Date.now() - (120 * 24 * 60 * 60 * 1000);
  const consume = (item, kind) => {
    const ids = [...new Set((item?._speakerIds || []).map(String).filter(Boolean))];
    if (!ids.length) return;
    const when = itemDate(item);
    const itemId = kind === 'audio' ? rawAudioId(item) : videoId(item);
    const week = Number(state.trends.week.get(String(itemId)) || 0);
    const month = Number(state.trends.month.get(String(itemId)) || 0);
    const all = Number(state.trends.all.get(String(itemId)) || 0);
    for (const id of ids) {
      const row = ensure(id);
      if (!row) continue;
      row.count += 1;
      row.week += week; row.month += month; row.all += all;
      if (when >= cutoff) row.recentCount += 1;
      if (when >= row.newest) {
        row.newest = when;
        row.latestTitle = displayShiurTitle(item.title || item.name, '');
        row.latestTopic = item._topicLabel || '';
      }
    }
  };
  state.videos.forEach(item => consume(item, 'video'));
  state.audioItems.forEach(item => consume(item, 'audio'));
  return metrics;
}

function historySpeakerIds() {
  const ids = new Set();
  for (const row of state.history || []) {
    const mediaType = String(row?.mediaType || '').toLowerCase();
    const rawId = String(row?.rawAudioId || row?.videoId || row?.id || '').replace(/^audio:/, '');
    let item = null;
    if (mediaType === 'audio') item = state.videoById.get(rawId) || state.audioById.get(rawId);
    else item = state.videoById.get(rawId);
    for (const id of item?._speakerIds || []) ids.add(String(id));
  }
  return ids;
}

function speakerDiscoveryRows(limit = 8) {
  const metrics = speakerDiscoveryMetrics();
  const all = [...metrics.values()].filter(row => row.count > 0 && speakerLabel(row.id));
  if (!all.length) return [];
  const used = new Set();
  const rows = [];
  const he = currentLanguage() === 'he';
  const listened = historySpeakerIds();
  const followed = new Set([...state.follows.keys()].filter(key => key.startsWith('speaker:')).map(key => key.slice(8)));
  const personal = new Set([...listened, ...followed]);
  const salt = `${state.speakerDiscoverySeed}:${state.speakerDiscoveryShuffle}`;
  const tie = row => discoveryHash(`${salt}:${row.id}`) / 4294967295;
  const take = (pool, count, tagEn, tagHe, score) => {
    const chosen = pool.filter(row => !used.has(row.id)).sort((a,b) => {
      const diff = score(b) - score(a);
      return Math.abs(diff) > 0.000001 ? diff : tie(b) - tie(a);
    }).slice(0, count);
    for (const row of chosen) {
      used.add(row.id);
      rows.push({ ...row, tag: he ? tagHe : tagEn });
    }
  };

  if (state.user) {
    take(all.filter(row => personal.has(row.id)), 2, 'For you', 'בשבילך', row => (followed.has(row.id) ? 1000000 : 0) + (listened.has(row.id) ? 500000 : 0) + row.week * 20 + row.month * 2 + row.newest / 1e9);
    take(all, 2, 'Recently active', 'פעילים לאחרונה', row => row.recentCount * 100000 + row.newest / 1e8 + row.week * 2);
    take(all, 2, 'Popular', 'פופולרי', row => row.week * 1000 + row.month * 25 + row.all * .05 + row.count);
    take(all.filter(row => !personal.has(row.id)), 2, 'Discover', 'לגלות', row => row.recentCount * 120 + Math.log2(row.count + 1) * 20 + tie(row) * 90);
  } else {
    take(all, 3, 'Recently active', 'פעילים לאחרונה', row => row.recentCount * 100000 + row.newest / 1e8 + row.week * 2);
    take(all, 3, 'Popular', 'פופולרי', row => row.week * 1000 + row.month * 25 + row.all * .05 + row.count);
    take(all, 2, 'Discover', 'לגלות', row => row.recentCount * 120 + Math.log2(row.count + 1) * 20 + tie(row) * 90);
  }

  if (rows.length < limit) take(all, limit - rows.length, 'Discover', 'לגלות', row => row.week * 10 + row.recentCount * 5 + Math.log2(row.count + 1) + tie(row));
  return rows.slice(0, limit);
}

function speakerDiscoveryCard(row) {
  const he = currentLanguage() === 'he';
  const latest = row.latestTopic || row.latestTitle || '';
  const countText = `${Number(row.count || 0).toLocaleString()} ${he ? 'שיעורים' : (Number(row.count || 0) === 1 ? 'shiur' : 'shiurim')}`;
  return `<button class="discover-speaker-card" data-home-speaker="${esc(row.id)}"><span class="discover-speaker-tag">${esc(row.tag || '')}</span><strong>${esc(speakerLabel(row.id))}</strong><small>${esc(countText)}</small>${latest ? `<span class="discover-speaker-latest">${he ? 'חדש: ' : 'Latest: '}${esc(latest)}</span>` : ''}</button>`;
}

function homeDiscoveryHtml() {
  const he = currentLanguage() === 'he';
  const continueRows = continueListeningItems(4);
  const following = state.user ? followingFeed().slice(0,4) : [];
  const speakers = speakerDiscoveryRows(8);
  return `<section class="home-discovery"><div class="home-search-box"><span>${svgIcon('search')}</span><input id="homeLibrarySearch" type="search" placeholder="${he?'חיפוש לפי כותרת, מרצה או קוד שיעור…':'Search title, speaker or lecture code…'}"><button id="homeLibrarySearchGo">${he?'חפש':'Search'}</button></div>${continueRows.length?`<div class="section-head"><div><span class="section-kicker">${he?'המשך':'CONTINUE'}</span><h2>${he?'המשך להאזין':'Continue Listening'}</h2></div><button class="section-link" data-nav="library" data-open-history="1">${he?'היסטוריה':'History'}</button></div><div class="list home-continue-list">${continueRows.map(row=>compactItem(row)).join('')}</div>`:''}${following.length?`<div class="section-head follow-home-head"><div><span class="section-kicker">${he?'במעקב':'FOLLOWING'}</span><h2>${he?'חדש ממה שאתם עוקבים אחריו':'New From What You Follow'}</h2></div></div><div class="card-grid compact-home-grid">${following.map(v=>itemCard({...v,_kind:'video'})).join('')}</div>`:''}<div class="discover-speakers"><div class="discover-speaker-head"><div><span class="section-kicker">${he?'גילוי':'DISCOVER'}</span><strong>${he?'גלו לפי מרצה':'Discover by Speaker'}</strong></div><div class="discover-speaker-head-actions"><button type="button" data-shuffle-speakers="1">${he?'ערבוב':'Shuffle'}</button><button type="button" data-home-all-speakers="1">${he?'כל המרצים':'See all'}</button></div></div><div class="discover-speaker-grid">${speakers.map(speakerDiscoveryCard).join('')}</div></div></section>`;
}

function promiseWithTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message || 'Request timed out.')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function notificationHash(value) {
  let hash = 2166136261;
  for (const ch of String(value || '')) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return 600000 + (Math.abs(hash) % 90000);
}

function availableScheduleLocations() {
  const fromData = (state.scheduleData?.events || []).map(event => String(event?.location || '').trim()).filter(Boolean);
  const preferred = ['Boro Park','Flatbush','Williamsburg','Monsey','Jerusalem'];
  return [...new Set([...preferred, ...fromData])];
}

function reminderLocationAllowed(event) {
  if (state.upcomingReminderLocations === null) return true;
  return state.upcomingReminderLocations.has(String(event?.location || '').trim());
}

function updateReminderLocation(location, checked) {
  const city = String(location || '').trim();
  if (!city) return;
  const all = availableScheduleLocations();
  if (state.upcomingReminderLocations === null) state.upcomingReminderLocations = new Set(all);
  if (checked) state.upcomingReminderLocations.add(city); else state.upcomingReminderLocations.delete(city);
  if (all.length && all.every(item => state.upcomingReminderLocations.has(item))) state.upcomingReminderLocations = null;
  persistReminderLocations();
  if (state.upcomingRemindersEnabled) scheduleUpcomingReminders().catch(() => {});
  render();
}

function setAllReminderLocations(enabled) {
  state.upcomingReminderLocations = enabled ? null : new Set();
  persistReminderLocations();
  if (state.upcomingRemindersEnabled) scheduleUpcomingReminders().catch(() => {});
  render();
}

async function scheduleUpcomingReminders() {
  if (!Capacitor.isNativePlatform() || !state.upcomingRemindersEnabled || !state.scheduleDataLoaded) return;
  try {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return;
    const events = futureScheduleEvents(120).filter(reminderLocationAllowed).slice(0, 24);
    const minutes = Math.max(5, Math.min(180, Number(state.upcomingReminderMinutes) || 30));
    const pending = [];
    for (const event of events) {
      const deltaMinutes = eventPseudoMinutes(event) - nyPseudoMinutes() - minutes;
      if (!(deltaMinutes > 0 && deltaMinutes < 60 * 24 * 30)) continue;
      const key = [event.date,event.startTime,event.location,event.speaker,event.title].join('|');
      pending.push({
        id:notificationHash(key),
        title:currentLanguage()==='he' ? 'שיעור מתחיל בקרוב' : 'Shiur starting soon',
        body:[event.speaker,event.title,event.location].filter(Boolean).join(' · '),
        schedule:{ at:new Date(Date.now() + deltaMinutes * 60000), allowWhileIdle:true },
        extra:{ route:'schedule' }
      });
    }
    const existing = await LocalNotifications.getPending();
    const ours = (existing.notifications || []).filter(n => Number(n.id) >= 600000 && Number(n.id) < 690000).map(n => ({ id:n.id }));
    if (ours.length) await LocalNotifications.cancel({ notifications:ours });
    if (pending.length) await LocalNotifications.schedule({ notifications:pending });
  } catch (error) { console.warn('Upcoming shiur reminders unavailable', error); }
}

async function setUpcomingReminders(enabled) {
  state.upcomingRemindersEnabled = Boolean(enabled);
  localStorage.setItem(UPCOMING_REMINDERS_KEY, state.upcomingRemindersEnabled ? '1' : '0');
  if (state.upcomingRemindersEnabled && Capacitor.isNativePlatform()) {
    try {
      const permission = await LocalNotifications.requestPermissions();
      if (permission.display !== 'granted') {
        state.upcomingRemindersEnabled = false;
        localStorage.setItem(UPCOMING_REMINDERS_KEY, '0');
        setToast(currentLanguage()==='he'?'לא ניתנה הרשאה להתראות.':'Notification permission was not granted.');
      } else {
        if (!state.scheduleDataLoaded) await loadScheduleData();
        await scheduleUpcomingReminders();
      }
    } catch (_) {}
  } else {
    try {
      const pending = await LocalNotifications.getPending();
      const ours = (pending.notifications || []).filter(n => Number(n.id) >= 600000 && Number(n.id) < 690000).map(n => ({ id:n.id }));
      if (ours.length) await LocalNotifications.cancel({ notifications:ours });
    } catch (_) {}
  }
  render();
}
// -------------------------------------------------------------------------


const SCHEDULE_ZONE = 'America/New_York';
const LIVE_STREAMS = {
  'Boro Park': 'https://vimeo.com/event/4489109/embed',
  'Flatbush': 'https://vimeo.com/event/5232471/embed'
};

function scheduleTextDir(value){return /[\u0590-\u05ff]/.test(String(value||''))?'rtl':'ltr';}

function stripScheduleFlyerFooter(value) {
  return String(value || '').split(/(?:\s+|^)נ[״"'׳]?ב(?:\s|$)|קול\s*הלשון|0732951716/)[0].trim();
}

function scheduleDisplayVenue(event) {
  const raw = stripScheduleFlyerFooter(event?.venue || '');
  const location = String(event?.location || '').toLowerCase();
  if (location === 'monsey' && /phyllis\s+terrace/i.test(raw)) return 'Vizhnitz Beis Medrash, 25 Phyllis Terrace';
  if (location === 'jerusalem') {
    const match = raw.replace(/\s+/g,' ').match(/(בית\s*המדרש\s*המרכזי\s*דחסידי\s*סקווירא\s*[–—-]\s*ירושלים)(?:\s*[,;|]?\s*[()]*\s*(רח[׳'״"]?\s*יהודה\s*המכבי)\s*[()]*)?/);
    return match ? [match[1],match[2]].filter(Boolean).join(', ') : 'בית המדרש המרכזי דחסידי סקווירא – ירושלים, רח׳ יהודה המכבי';
  }
  return raw;
}

function scheduleVenueHtml(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const addressMatch = raw.match(/\b\d{1,6}\s+(?:[A-Za-z0-9.'’#-]+\s+){0,5}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Terrace|Ter\.?|Drive|Dr\.?|Lane|Ln\.?|Place|Pl\.?|Court|Ct\.?)\b/iu);
  if (!addressMatch) return `<bdi dir="${scheduleTextDir(raw)}">${esc(raw)}</bdi>`;
  const index = Number(addressMatch.index || 0);
  const address = String(addressMatch[0] || '').trim();
  const before = raw.slice(0,index).replace(/[\s,·|–—-]+$/u,'').trim();
  const after = raw.slice(index + addressMatch[0].length).replace(/^[\s,·|–—-]+/u,'').trim();
  const parts = [];
  if (before) parts.push(`<bdi dir="${scheduleTextDir(before)}">${esc(before)}</bdi>`);
  parts.push(`<bdi dir="ltr" class="schedule-address-ltr">${esc(address)}</bdi>`);
  if (after) parts.push(`<bdi dir="${scheduleTextDir(after)}">${esc(after)}</bdi>`);
  return parts.join('<span class="schedule-place-separator" aria-hidden="true"> · </span>');
}

function schedulePlaceHtml(event) {
  const location = String(event?.location || '').trim();
  const venue = scheduleDisplayVenue(event);
  const pieces = [];
  if (location) pieces.push(`<bdi dir="${scheduleTextDir(location)}">${esc(location)}</bdi>`);
  if (venue) pieces.push(scheduleVenueHtml(venue));
  return pieces.join('<span class="schedule-place-separator" aria-hidden="true"> • </span>');
}

function apiUrl(path = '') {
  const value = String(path || '');
  return /^https?:\/\//i.test(value) ? value : `${API}${value.startsWith('/') ? value : `/${value}`}`;
}

function money(cents, currency = 'usd') {
  const amount = Math.max(0, Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat(currentLanguage() === 'he' ? 'he-IL' : 'en-US', {
      style: 'currency', currency: String(currency || 'usd').toUpperCase(), maximumFractionDigits: amount % 1 ? 2 : 0
    }).format(amount);
  } catch (_) { return `$${amount.toFixed(amount % 1 ? 2 : 0)}`; }
}

function scheduleZone(event) {
  return String(event?.location || '').trim().toLowerCase() === 'jerusalem' ? 'Asia/Jerusalem' : SCHEDULE_ZONE;
}

function zonedParts(date = new Date(), timeZone = SCHEDULE_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year:map.year, month:map.month, day:map.day, hour:map.hour, minute:map.minute };
}

function zonedPseudoMinutes(date = new Date(), timeZone = SCHEDULE_ZONE) {
  const p = zonedParts(date, timeZone);
  return Math.floor(Date.UTC(Number(p.year), Number(p.month)-1, Number(p.day), Number(p.hour), Number(p.minute)) / 60000);
}

function eventPseudoMinutes(event, end = false) {
  const date = String(event?.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;

  // Match the website exactly for JSON-imported rows: only a real 24-hour
  // start/end clock controls expiry. A human printed timeLabel such as
  // "After Maariv" is display text, not a parseable clock. If there is no
  // machine-readable time, keep the row visible through the end of its date.
  const parseClock = value => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?:\b|$)/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  };
  const start = parseClock(event?.startTime);
  const finish = parseClock(event?.endTime);
  const clock = end ? (finish || start) : start;
  const hour = clock ? clock.hour : 23;
  const minute = clock ? clock.minute : 59;
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return Math.floor(Date.UTC(+match[1], +match[2]-1, +match[3], hour, minute) / 60000);
}

function eventSortValue(event) {
  const value = eventPseudoMinutes(event, false);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function futureScheduleEvents(limit = Infinity, locations = null) {
  const accepted = locations ? new Set(locations) : null;
  return (state.scheduleData?.events || [])
    .filter(event => !accepted || accepted.has(String(event.location || '')))
    .filter(event => {
      const end = eventPseudoMinutes(event, true);
      const now = zonedPseudoMinutes(new Date(), scheduleZone(event));
      return Number.isFinite(end) && end >= now;
    })
    .sort((a,b) => eventSortValue(a) - eventSortValue(b))
    .slice(0, limit);
}

function recentScheduleEvents(days = 30, limit = Infinity, locations = null) {
  const accepted = locations ? new Set(locations) : null;
  const windowMinutes = Math.max(1, Number(days) || 30) * 24 * 60;
  return (state.scheduleData?.events || [])
    .filter(event => !accepted || accepted.has(String(event.location || '')))
    .filter(event => {
      const end = eventPseudoMinutes(event, true);
      const now = zonedPseudoMinutes(new Date(), scheduleZone(event));
      return Number.isFinite(end) && end < now && end >= now - windowMinutes;
    })
    .sort((a,b) => eventSortValue(b) - eventSortValue(a))
    .slice(0, limit);
}

function liveScheduleEvents() {
  const scheduled = (state.scheduleData?.events || []).filter(event => {
    if (!LIVE_STREAMS[event.location]) return false;
    const start = eventPseudoMinutes(event, false);
    const end = eventPseudoMinutes(event, true);
    const now = zonedPseudoMinutes(new Date(), scheduleZone(event));
    return Number.isFinite(start) && Number.isFinite(end) && now >= start - 15 && now < end + 30;
  }).sort((a,b) => eventSortValue(a)-eventSortValue(b));
  const seen = new Set(scheduled.map(event => event.location));
  for (const location of state.liveOverrides) {
    if (!LIVE_STREAMS[location] || seen.has(location)) continue;
    scheduled.push({ location, title:'Live Broadcast', titleEn:'Live Broadcast', titleHe:'שידור חי', adminLiveOverride:true });
  }
  return scheduled;
}

function formatScheduleDate(event) {
  const raw = String(event?.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    try {
      const d = new Date(`${raw}T12:00:00Z`);
      // Always keep the Gregorian/English date visible on schedule cards,
      // even when a flyer or JSON import also supplies a Hebrew dateLabel.
      return new Intl.DateTimeFormat('en-US', { weekday:'short', month:'short', day:'numeric', timeZone:'UTC' }).format(d);
    } catch (_) {}
  }
  return raw || String(event?.dateLabel || '').trim();
}

function formatClock(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value || '');
  let h = Number(match[1]); const m = match[2]; const suffix = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
}

function scheduleEventTime(event) {
  const printed = String(event?.timeLabel || '').trim();
  if (printed) return printed;
  const raw = String(event?.startTime || event?.time || event?.start || '').trim();
  return raw ? formatClock(raw) : '';
}

function scheduleEventDateLine(event) {
  const englishDate = formatScheduleDate(event);
  const parts = [];
  const add = value => {
    const text = String(value || '').trim();
    if (!text || parts.some(item => item.toLowerCase() === text.toLowerCase())) return;
    parts.push(text);
  };
  add(englishDate);
  add(event?.hebrewDate);
  // Preserve meaningful printed flyer/JSON date labels in addition to the
  // English Gregorian date. This is especially useful for Chol Hamoed/Yom Tov.
  add(event?.dateLabel);
  return parts.join(' • ');
}

function scheduleEventCard(event, compact = false) {
  const live = LIVE_STREAMS[event.location] && liveScheduleEvents().some(item => item.location === event.location && (!item.date || item.date === event.date));
  const dateLine = scheduleEventDateLine(event);
  const timeLine = scheduleEventTime(event);
  const title = stripScheduleFlyerFooter(event.title || event.topicEn || event.topicHe || 'Torah Shiur');
  const speaker = stripScheduleFlyerFooter(event.speaker || event.speakerHe || event.speakerEn || '');
  return `<article class="schedule-event-card ${compact ? 'compact' : ''} ${live ? 'is-live' : ''}">
    <div class="schedule-event-date"><span>${esc(dateLine || event.date || 'Upcoming')}</span>${live ? '<b>LIVE</b>' : ''}</div>
    <div class="schedule-event-main"><div class="schedule-event-time">${esc(timeLine)}</div><div class="schedule-event-copy"><h3 dir="${scheduleTextDir(title)}">${esc(title)}</h3>${speaker ? `<strong dir="${scheduleTextDir(speaker)}">${esc(speaker)}</strong>` : ''}<p>${schedulePlaceHtml(event)}</p></div></div>
    ${LIVE_STREAMS[event.location] ? `<button class="schedule-live-link" data-nav="${event.location === 'Flatbush' ? 'live-flatbush' : 'live-boro'}">${live ? 'Watch Live' : 'Open Live Stream'}</button>` : ''}
    ${!compact && state.isAdmin && state.adminMode ? `<div class="admin-card-tools"><button data-admin-schedule-edit="${esc(scheduleAdminKey(event))}">Edit</button><button class="danger" data-admin-schedule-delete="${esc(scheduleAdminKey(event))}">Delete</button></div>` : ''}
  </article>`;
}

function scheduleIdentityText(value) {
  return normalizeText(String(value || '').replace(/[\u2013\u2014]/g, '-'));
}

function scheduleEventIdentity(event) {
  const date = scheduleIdentityText(event?.date || event?.dateLabel || event?.hebrewDate || '');
  const time = scheduleIdentityText(event?.startTime || event?.timeLabel || event?.time || '');
  const location = scheduleIdentityText(event?.location || '');
  const speaker = scheduleIdentityText(bareSpeakerName(event?.speaker || event?.speakerHe || event?.speakerEn || ''));
  const title = scheduleIdentityText(stripScheduleFlyerFooter(event?.title || event?.titleEn || event?.titleHe || event?.topic || event?.topicEn || event?.topicHe || event?.program || ''));
  if (!date && !time && !location && !speaker && !title) return '';
  return [date, time, location, speaker, title].join('|');
}

function dedupeScheduleEvents(events) {
  const out = [];
  const seen = new Map();
  for (const raw of Array.isArray(events) ? events : []) {
    if (!raw || typeof raw !== 'object') continue;
    const event = { ...raw };
    const key = scheduleEventIdentity(event);
    if (!key || !seen.has(key)) {
      if (key) seen.set(key, out.length);
      out.push(event);
      continue;
    }
    const index = seen.get(key);
    const current = out[index] || {};
    // Preserve the richest version of a duplicate without inventing fields.
    for (const [field, value] of Object.entries(event)) {
      if ((current[field] == null || current[field] === '') && value != null && value !== '') current[field] = value;
    }
    out[index] = current;
  }
  return out;
}

function mergePublicScheduleOverlay(manual, automatic) {
  const manualBase = manual && Array.isArray(manual.events)
    ? { ...manual, events:dedupeScheduleEvents(manual.events) }
    : { events:[], sources:[] };
  if (!automatic || typeof automatic !== 'object') return manualBase;

  // The Worker exposes administrator JSON imports (manual:/bulk:) separately
  // as adminScheduleOverrides as well as in newer combined `events` feeds.
  // Always merge that public overlay explicitly so an app never shows only the
  // PDF/ad-reader rows when the backend version/cache returns them separately.
  const automaticBase = Array.isArray(automatic.events)
    ? { ...automatic, events:dedupeScheduleEvents(automatic.events) }
    : { ...automatic, events:[] };
  const base = automatic.websitePublishing === true || automatic.adminScheduleOverridesPublic === true
    ? automaticBase
    : manualBase;

  const overlay = automatic.adminScheduleOverrides || {};
  const approved = Array.isArray(automatic.approvedScheduleReviewEvents) ? automatic.approvedScheduleReviewEvents : [];
  const replacements = dedupeScheduleEvents([...approved, ...(Array.isArray(overlay.events) ? overlay.events : [])]);
  const deletedKeys = new Set((Array.isArray(overlay.deletedKeys) ? overlay.deletedKeys : []).map(value => String(value || '').trim()).filter(Boolean));
  const deletedSlots = new Set([...deletedKeys].map(key => key.split('|').slice(0, 3).join('|')).filter(slot => slot.split('|').filter(Boolean).length === 3));
  const replacementBySlot = new Map();
  for (const event of replacements) {
    const slot = [event?.date,event?.startTime || event?.timeLabel,event?.location].map(v=>String(v||'').trim()).join('|');
    if (slot.split('|').filter(Boolean).length === 3) replacementBySlot.set(slot,event);
  }
  const retained = (base.events || []).filter(event => {
    const key=[event?.date,event?.startTime || event?.timeLabel,event?.location,event?.speaker,event?.title].map(v=>String(v||'').trim()).join('|').slice(0,1000);
    const slot=[event?.date,event?.startTime || event?.timeLabel,event?.location].map(v=>String(v||'').trim()).join('|');
    const adminKey=String(event?.adminOverrideBaseKey || '').trim();
    return !deletedKeys.has(key) && !deletedKeys.has(adminKey) && !deletedSlots.has(slot) && !replacementBySlot.has(slot);
  });
  return {
    ...base,
    ...automatic,
    events:dedupeScheduleEvents([...retained,...replacementBySlot.values()]),
    adminScheduleOverridesApplied:replacementBySlot.size>0 || deletedKeys.size>0
  };
}

function sponsorRibbonHtml() {
  const data = state.sponsorRibbon;
  if (!data?.enabled) return '';
  const text = String(currentLanguage() === 'he' ? (data.textHe || data.textEn || '') : (data.textEn || data.textHe || '')).trim();
  if (!text) return '';
  const attrs = data.linkUrl ? ` data-external="${esc(data.linkUrl)}" role="link"` : '';
  return `<button type="button" class="app-sponsor-ribbon"${attrs}>${esc(text)}</button>`;
}

function svgIcon(name, extraClass = '') {
  const common = `class="ui-icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"`;
  const icons = {
    home: `<svg ${common}><path d="M3 10.7 12 3l9 7.7v9.1a1.2 1.2 0 0 1-1.2 1.2h-5.2v-6.1H9.4V21H4.2A1.2 1.2 0 0 1 3 19.8z"/></svg>`,
    search: `<svg ${common}><circle cx="10.5" cy="10.5" r="6.3"/><path d="m15.2 15.2 5.2 5.2"/></svg>`,
    history: `<svg ${common}><path d="M4 5v5h5M5.5 9.5A8 8 0 1 1 4.8 15"/><path d="M12 7v5l3 2"/></svg>`,
    play: `<svg ${common}><path d="M8 5.4v13.2L19 12z"/></svg>`,
    live: `<svg ${common}><circle cx="12" cy="12" r="3.1"/><path d="M6.8 6.8a7.4 7.4 0 0 0 0 10.4M17.2 6.8a7.4 7.4 0 0 1 0 10.4M3.7 3.7a11.8 11.8 0 0 0 0 16.6M20.3 3.7a11.8 11.8 0 0 1 0 16.6"/></svg>`,
    library: `<svg ${common}><path d="M5 4.5h12.5A1.5 1.5 0 0 1 19 6v13.5H6.4A2.4 2.4 0 0 1 4 17.1V5.5a1 1 0 0 1 1-1Z"/><path d="M6.5 16.5H19M8 8h7M8 11h6"/></svg>`,
    account: `<svg ${common}><circle cx="12" cy="8" r="3.2"/><path d="M5.4 20c.7-4 3-6 6.6-6s5.9 2 6.6 6"/></svg>`,
    heart: `<svg ${common}><path d="M20.8 5.8a5.2 5.2 0 0 0-7.4 0L12 7.2l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4L12 22l8.8-8.8a5.2 5.2 0 0 0 0-7.4Z"/></svg>`,
    bookmark: `<svg ${common}><path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21L12 17.5 6.5 21z"/></svg>`,
    playlist: `<svg ${common}><path d="M4 6h9M4 11h9M4 16h6"/><path d="m14 14 6 4-6 4z"/></svg>`,
    share: `<svg ${common}><circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="m8.2 10.9 7.6-4.5M8.2 13.1l7.6 4.5"/></svg>`,
    download: `<svg ${common}><path d="M12 3v12M7.5 10.8 12 15.3l4.5-4.5M4 20h16"/></svg>`,
    mail: `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>`,
    donate: `<svg ${common}><path d="M12 21s-7.5-4.2-7.5-10A4.5 4.5 0 0 1 12 7.7 4.5 4.5 0 0 1 19.5 11c0 5.8-7.5 10-7.5 10Z"/><path d="M12 9.5v6M9 12.5h6"/></svg>`,
    store: `<svg ${common}><path d="M4 8.5h16l-1 11H5z"/><path d="M7 8.5V7a5 5 0 0 1 10 0v1.5M9 12h6"/></svg>`,
    calendar: `<svg ${common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3"/></svg>`,
    audio: `<svg ${common}><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>`,
    video: `<svg ${common}><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2z"/></svg>`,
    minimize: `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`,
    pip: `<svg ${common}><rect x="3" y="4" width="18" height="16" rx="2"/><rect x="12.5" y="11.5" width="6.5" height="5.5" rx="1"/></svg>`,
    back15: `<svg class="skip-icon-modern" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="skip-ring" d="M17 18A22 22 0 1 1 11 34"/><path class="skip-arrowhead" d="M18 8 8 18l10 10"/><text x="32" y="39" text-anchor="middle" class="skip-text">${state.skipSeconds}</text></svg>`,
    forward15: `<svg class="skip-icon-modern" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="skip-ring" d="M47 18A22 22 0 1 0 53 34"/><path class="skip-arrowhead" d="m46 8 10 10-10 10"/><text x="32" y="39" text-anchor="middle" class="skip-text">${state.skipSeconds}</text></svg>`
  };
  return icons[name] || '';
}

function offlineIconHtml(extraClass = '') {
  return `<img class="offline-headphones-icon ${extraClass}" src="/offline-headphones.png" alt="" aria-hidden="true">`;
}


function googleGIcon() {
  return `<svg class="google-g-icon" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.703-1.568 2.684-3.877 2.684-6.613z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.182l-2.909-2.258c-.806.54-1.836.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.963 10.705A5.42 5.42 0 0 1 3.682 9c0-.592.102-1.168.281-1.705V4.963H.956A9 9 0 0 0 0 9c0 1.45.347 2.824.956 4.037l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.582-2.582C13.463.892 11.426 0 9 0A9 9 0 0 0 .956 4.963l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58z"/></svg>`;
}

function logoArtworkHtml(extraClass = '') {
  return `<div class="audio-cover ${extraClass}"><img src="/logo.png" alt="Irgun Shiurai Torah"></div>`;
}

function sortChoiceHtml() {
  const options = [
    ['newest', 'Newest'],
    ['week', 'Most Watched This Week'],
    ['month', 'Most Watched This Month'],
    ['all', 'Most Watched All Time']
  ];
  return `<div class="sort-filter-wrap"><span class="sort-filter-label">Sort</span><div class="sort-filter-options">${options.map(([value,label]) => `<button class="sort-filter-pill ${state.librarySort === value ? 'active' : ''}" data-library-sort="${value}">${esc(label)}</button>`).join('')}</div></div>`;
}

function historyPlaybackInfo(item) {
  const mediaType = String(item && item.mediaType || '').toLowerCase();
  const rawId = String(item && (item.rawAudioId || item.videoId || item.id) || '').replace(/^audio:/, '');
  const video = state.videoById.get(rawId);
  if (mediaType === 'audio' && video && video.hasAudio) {
    return { isAudio: true, isVideoAudio: true, id: rawId, video };
  }
  if (mediaType === 'audio') {
    return { isAudio: true, isVideoAudio: false, id: rawId, video: null };
  }
  return { isAudio: false, isVideoAudio: false, id: rawId, video: video || null };
}

function shiurimResultsHtml(filtered = filteredLibraryItems()) {
  const visible = filtered.slice(0, state.libraryLimit);
  return `${visible.length ? `<div class="card-grid section">${visible.map(itemCard).join('')}</div>` : '<div class="empty section">No shiurim matched your search.</div>'}
    ${visible.length < filtered.length ? `<div class="load-row"><button class="load-more" data-load-more="1">Load More</button></div>` : ''}`;
}

function refreshShiurimResults() {
  const mount = document.getElementById('shiurimResults');
  if (!mount) return;
  const filtered = filteredLibraryItems();
  const count = document.getElementById('shiurimFoundCount');
  if (count) count.textContent = `Found ${filtered.length} shiurim`;
  mount.innerHTML = shiurimResultsHtml(filtered);
  bindShiurimResultEvents(mount);
}

function bindShiurimResultEvents(root) {
  root.querySelectorAll('[data-watch]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    const requestedTime = el.dataset.watchTime == null || el.dataset.watchTime === '' ? null : Number(el.dataset.watchTime);
    openWatch(el.dataset.watch, requestedTime);
  }));
  root.querySelectorAll('[data-listen-video]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    playVideoAudio(el.dataset.listenVideo);
  }));
  root.querySelectorAll('[data-listen-audio]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    playLibraryAudio(el.dataset.listenAudio);
  }));
  root.querySelectorAll('[data-like]').forEach(el => el.addEventListener('click', async event => {
    event.stopPropagation();
    await preserveWatchTime();
    toggleLike(el.dataset.like);
  }));
  root.querySelectorAll('[data-save]').forEach(el => el.addEventListener('click', async event => {
    event.stopPropagation();
    await preserveWatchTime();
    toggleWatchLater(el.dataset.save);
  }));
  root.querySelectorAll('[data-share-kind]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    shareItem(el.dataset.shareKind, el.dataset.shareId);
  }));
  root.querySelectorAll('[data-download-kind]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    downloadItem(el.dataset.downloadKind, el.dataset.downloadId);
  }));
  root.querySelectorAll('[data-save-offline-kind]').forEach(el => el.addEventListener('click', event => { event.stopPropagation(); saveOffline(el.dataset.saveOfflineKind, el.dataset.saveOfflineId); }));
  root.querySelectorAll('[data-open-playlist-picker]').forEach(el => el.addEventListener('click', event => { event.stopPropagation(); openPlaylistPicker(el.dataset.playlistKind, el.dataset.playlistId); }));
  root.querySelectorAll('[data-admin-video-edit]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    openAdminVideoEditor(el.dataset.adminVideoEdit, el.dataset.adminMediaKind === 'audio' ? 'audio' : 'video');
  }));
  root.querySelectorAll('[data-load-more]').forEach(el => el.addEventListener('click', () => {
    state.libraryLimit += 48;
    refreshShiurimResults();
  }));
}

function downloadManagerHtml() {
  const jobs = [...state.downloadJobs.values()];
  if (!jobs.length) return '';
  if (!state.downloadPanelOpen) {
    const active = jobs.filter(job => ['queued','running','paused'].includes(job.status)).length;
    return `<button class="download-float" data-open-download-manager="1">${svgIcon('download')}<span>${active ? `${active} download${active === 1 ? '' : 's'}` : 'Downloads'}</span></button>`;
  }
  return `<div class="download-manager">
    <div class="download-manager-head"><strong>Downloads</strong><button data-hide-download-manager="1" aria-label="Hide downloads">×</button></div>
    <div class="download-manager-list">${jobs.map(job => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(job.percent) || 0)));
      const running = job.status === 'running' || job.status === 'queued';
      return `<div class="download-job ${esc(job.status || '')}">
        <div class="download-job-title">${esc(job.title || job.filename || 'Download')}</div>
        <div class="download-job-bar"><span style="width:${pct}%"></span></div>
        <div class="download-job-row"><span>${job.status === 'completed' ? 'Completed' : job.status === 'paused' ? `Paused · ${pct}%` : job.status === 'cancelled' ? 'Cancelled' : job.status === 'error' ? 'Failed' : `${pct}%`}</span><div class="download-job-actions">${running ? `<button data-pause-download="${esc(job.id)}">Pause</button>` : ''}${job.status === 'paused' ? `<button data-resume-download="${esc(job.id)}">Resume</button>` : ''}${!['completed','cancelled','error'].includes(job.status) ? `<button class="danger" data-cancel-download="${esc(job.id)}">Cancel</button>` : `<button data-remove-download="${esc(job.id)}">Clear</button>`}</div></div>
      </div>`;
    }).join('')}</div>
  </div>`;
}

function refreshDownloadManager() {
  const mount = document.getElementById('downloadManagerMount');
  if (!mount) return;
  mount.innerHTML = downloadManagerHtml();
  bindDownloadManager(mount);
}

function bindDownloadManager(root) {
  root.querySelectorAll('[data-open-download-manager]').forEach(el => el.addEventListener('click', () => { state.downloadPanelOpen = true; refreshDownloadManager(); }));
  root.querySelectorAll('[data-hide-download-manager]').forEach(el => el.addEventListener('click', () => { state.downloadPanelOpen = false; refreshDownloadManager(); }));
  root.querySelectorAll('[data-pause-download]').forEach(el => el.addEventListener('click', () => pauseDownload(el.dataset.pauseDownload)));
  root.querySelectorAll('[data-resume-download]').forEach(el => el.addEventListener('click', () => resumeDownload(el.dataset.resumeDownload)));
  root.querySelectorAll('[data-cancel-download]').forEach(el => el.addEventListener('click', () => cancelDownload(el.dataset.cancelDownload)));
  root.querySelectorAll('[data-remove-download]').forEach(el => el.addEventListener('click', () => { state.downloadJobs.delete(el.dataset.removeDownload); refreshDownloadManager(); }));
}

async function initNativeDownloader() {
  if (!Capacitor.isNativePlatform() || state.downloaderReady) return;
  state.downloaderReady = true;
  try {
    await IrgunDownloader.addListener('downloadProgress', data => {
      const id = String(data.id || '');
      const current = state.downloadJobs.get(id);
      if (!current) return;
      state.downloadJobs.set(id, { ...current, status: data.status || 'running', percent: Number(data.percent) || 0, bytes: Number(data.bytes) || 0, total: Number(data.total) || 0 });
      refreshDownloadManager();
    });
    await IrgunDownloader.addListener('downloadState', data => {
      const id = String(data.id || '');
      const current = state.downloadJobs.get(id);
      if (!current) return;
      state.downloadJobs.set(id, { ...current, status: data.status || current.status, percent: data.status === 'completed' ? 100 : (Number(data.percent) || current.percent || 0), message: data.message || '', uri: data.uri || '' });
      refreshDownloadManager();
      if (data.status === 'completed') setToast('Download complete.');
    });
  } catch (error) {
    console.warn('Native downloader listener setup failed', error);
  }
}

async function pauseDownload(id) {
  const job = state.downloadJobs.get(String(id));
  if (job && job.controller) return;
  try { await IrgunDownloader.pause({ id }); } catch (error) { console.warn(error); }
}

async function resumeDownload(id) {
  try { await IrgunDownloader.resume({ id }); } catch (error) { console.warn(error); }
}
async function cancelDownload(id) {
  const job = state.downloadJobs.get(String(id));
  if (job && job.controller) { job.controller.abort(); return; }
  try { await IrgunDownloader.cancel({ id }); } catch (error) { console.warn(error); }
}


function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function fmtTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDurationOrUnknown(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? fmtTime(value) : '—:—';
}

function parseAppDate(value) {
  const raw = String(value || '').trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    // Treat an administrator-entered lecture date as a calendar date, not UTC midnight.
    // This prevents Sep 16 from displaying as Sep 15 in time zones west of UTC.
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12, 0, 0, 0);
  }
  return new Date(raw);
}

function fmtDate(value) {
  const date = parseAppDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(currentLanguage() === 'he' ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isNew(value, days = 7) {
  const date = parseAppDate(value);
  if (Number.isNaN(date.getTime())) return false;
  const age = Date.now() - date.getTime();
  return age >= 0 && age <= days * 86400000;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const SPEAKER_TOKEN_EN_COUNTS = new Map();
const SPEAKER_TOKEN_HE_COUNTS = new Map();

function bareSpeakerName(value) {
  return String(value || '')
    .replace(/^(Rabbi|Rav|HaRav|Harav|Reb|הרב|רבי|רב|ר[׳'])\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function incrementSpeakerTokenCount(map, source, target) {
  if (!source || !target) return;
  if (!map.has(source)) map.set(source, new Map());
  const counts = map.get(source);
  counts.set(target, (counts.get(target) || 0) + 1);
}

function learnSpeakerNameDictionary() {
  SPEAKER_TOKEN_EN_COUNTS.clear();
  SPEAKER_TOKEN_HE_COUNTS.clear();
  for (const speaker of state.metadata.speakers || []) {
    const rawHe = bareSpeakerName(speaker?.nameHe || speaker?.displayHe || '');
    const rawEn = bareSpeakerName(speaker?.nameEn || speaker?.displayEn || '');
    if (!/[\u0590-\u05ff]/.test(rawHe) || !/[a-z]/i.test(rawEn)) continue;
    const heTokens = normalizeText(rawHe).split(' ').filter(Boolean);
    const enTokens = normalizeText(rawEn).split(' ').filter(Boolean);
    if (!heTokens.length || heTokens.length !== enTokens.length) continue;
    for (let i = 0; i < heTokens.length; i++) {
      const he = heTokens[i];
      const en = enTokens[i];
      if (!/[\u0590-\u05ff]/.test(he) || !/^[a-z0-9]+$/.test(en)) continue;
      incrementSpeakerTokenCount(SPEAKER_TOKEN_EN_COUNTS, he, en);
      incrementSpeakerTokenCount(SPEAKER_TOKEN_HE_COUNTS, en, he);
    }
  }
}

function preferredSpeakerToken(map, token) {
  const counts = map.get(normalizeText(token));
  if (!counts || !counts.size) return '';
  return [...counts.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]))[0][0];
}

function generatedEnglishSpeakerName(value) {
  const tokens = normalizeText(bareSpeakerName(value)).split(' ').filter(Boolean);
  if (!tokens.length || !tokens.every(token => /[\u0590-\u05ff]/.test(token))) return '';
  const translated = tokens.map(token => preferredSpeakerToken(SPEAKER_TOKEN_EN_COUNTS, token));
  return translated.every(Boolean) ? translated.map(token => token.charAt(0).toUpperCase()+token.slice(1)).join(' ') : '';
}

function generatedHebrewSpeakerName(value) {
  const tokens = normalizeText(bareSpeakerName(value)).split(' ').filter(Boolean);
  if (!tokens.length || !tokens.every(token => /^[a-z0-9]+$/.test(token))) return '';
  const translated = tokens.map(token => preferredSpeakerToken(SPEAKER_TOKEN_HE_COUNTS, token));
  return translated.every(Boolean) ? translated.join(' ') : '';
}

function videoId(item) {
  return String(item && (item.id || item.vimeoId) || '').trim();
}

function rawAudioId(item) {
  return String(item && (item.rawAudioId || item.publicId || item.id) || '').replace(/^audio:/, '').trim();
}

function actionId(item, kind) {
  if (kind === 'audio') return `audio:${rawAudioId(item)}`;
  return videoId(item);
}

function mediaApiId(item, fallbackId) {
  // Prefer the catalog's exact video/Vimeo ID. The Worker can resolve this with
  // an exact lookup and does not need to scan titles for an IST code on every
  // range request. Keep the title code only as a legacy fallback.
  const exactId = String(fallbackId || videoId(item) || '').trim();
  if (exactId) return exactId;
  const title = String(item && item.title || '');
  const match = title.match(/\b(?:I\.?S\.?T\.?[- ]*)?(SF|SN|DL|SB)[- ]?(\d{2,5})\b/i);
  return match ? `IST-${match[1].toUpperCase()}${match[2]}` : String(rawAudioId(item) || '');
}

function audioUrl(id) {
  return `${API}/audio/${encodeURIComponent(String(id || ''))}`;
}

function prewarmVideoAudioMetadata(video, id) {
  if (!video || !video.hasAudio || state.watchAudioToVideoHandoff) return;
  const base = videoAudioPlaybackItem(video, id);
  if (!base || !base.url) return;
  const offlineRecord = offlineRecordForAudioItem(base);
  const localUrl = offlineFileUrl(offlineRecord);
  const item = localUrl
    ? { ...base, url:localUrl, networkUrl:base.url, nativeBackgroundUrl:offlineRecord?.uri || '', offline:true, offlineKey:offlineRecord.key }
    : { ...base, networkUrl:base.url, offline:false };
  if (usesNativeUnifiedAudio()) {
    // Media3 owns Android audio even while Vimeo is visible. Preparing the item is
    // conservative: ExoPlayer establishes metadata/range state but does not play or
    // download the whole MP3. This makes a later handoff start near the live clock.
    PlaybackController.loadLecture(item, state.watchResumeSeconds || 0, true).catch(()=>{});
    return;
  }
  if (!audio.paused) return;
  const sameSource = audio.src === item.url || audio.currentSrc === item.url;
  try {
    audio.preload = 'metadata';
    if (!sameSource) { audio.src = item.url; audio.load(); }
  } catch (_) {}
}

function currentLanguage() {
  return window.IST_I18N && window.IST_I18N.getLanguage && window.IST_I18N.getLanguage() === 'he' ? 'he' : 'en';
}

function paidProductTitle(item, fallback = 'Paid Shiur') {
  const en = String(item?.titleEn || item?.title || item?.titleHe || '').trim();
  const he = String(item?.titleHe || '').trim();
  return currentLanguage() === 'he' ? (he || en || fallback) : (en || he || fallback);
}

function speakerLabel(id) {
  const s = state.speakerById.get(id);
  if (!s) return '';
  return currentLanguage() === 'he'
    ? (s.displayHe || s.nameHe || s.displayEn || s.nameEn || '')
    : (s.displayEn || s.nameEn || s.displayHe || s.nameHe || '');
}

function topicLabel(id) {
  const t = state.topicById.get(id);
  if (!t) return '';
  return currentLanguage() === 'he' ? (t.he || t.en || '') : (t.en || t.he || '');
}

function getVisitorId() {
  let value = localStorage.getItem(VISITOR_KEY) || '';
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(value)) {
    value = (crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
    localStorage.setItem(VISITOR_KEY, value);
  }
  return value;
}

function authHeaders(extra = {}) {
  const headers = new Headers(extra || {});
  headers.set('X-Irgun-App', '1');
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  return headers;
}

async function apiFetch(path, options = {}) {
  const headers = authHeaders(options.headers || {});
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: 'include'
  });
  return response;
}

async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `${path} returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const OFFLINE_DB_NAME = 'ist-offline-library-v1';
const OFFLINE_DB_STORE = 'responses';
let offlineDbPromise = null;
let bootstrapInFlight = false;
let reconnectTimer = null;

function openOfflineDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (offlineDbPromise) return offlineDbPromise;
  offlineDbPromise = new Promise(resolve => {
    try {
      const request = indexedDB.open(OFFLINE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OFFLINE_DB_STORE)) db.createObjectStore(OFFLINE_DB_STORE, { keyPath:'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch (_) { resolve(null); }
  });
  return offlineDbPromise;
}

async function offlineCacheGet(key) {
  const db = await openOfflineDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(OFFLINE_DB_STORE, 'readonly');
      const req = tx.objectStore(OFFLINE_DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

async function offlineCachePut(key, data) {
  const db = await openOfflineDb();
  if (!db) return;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(OFFLINE_DB_STORE, 'readwrite');
      tx.objectStore(OFFLINE_DB_STORE).put({ key, savedAt:Date.now(), data });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch (_) { resolve(); }
  });
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal:controller.signal });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function bootstrapJson(path) {
  const rawPath = String(path || '');
  const key = `bootstrap:${rawPath}`;
  let networkError = null;
  if (navigator.onLine !== false) {
    try {
      // The website always reads the live catalog with no-store. The app used to give
      // /video-map only seven seconds and then silently fall back to an older IndexedDB
      // snapshot. On slower connections that could make newer website shiurim appear to
      // be missing from the app. Catalog endpoints now get a longer window, explicit
      // no-store, and a harmless cache-busting query while retaining the offline fallback.
      const isCatalog = rawPath.startsWith('/video-map') || rawPath.startsWith('/audio-map');
      const options = isCatalog ? { cache:'no-store' } : undefined;
      const timeoutMs = isCatalog ? 20000 : 7000;
      const separator = rawPath.includes('?') ? '&' : '?';
      const requestPath = isCatalog ? `${rawPath}${separator}_app_catalog=${Date.now()}` : rawPath;
      const data = await fetchJsonWithTimeout(`${API}${requestPath}`, options, timeoutMs);
      offlineCachePut(key, data).catch(() => {});
      if (isCatalog) {
        state.offlineMode = false;
        state.usingCachedLibrary = false;
        state.offlineCacheSavedAt = 0;
      }
      return data;
    } catch (error) {
      networkError = error;
    }
  }

  const cached = await offlineCacheGet(key);
  if (cached && Object.prototype.hasOwnProperty.call(cached, 'data')) {
    state.offlineMode = true;
    state.usingCachedLibrary = true;
    state.offlineCacheSavedAt = Math.max(Number(state.offlineCacheSavedAt) || 0, Number(cached.savedAt) || 0);
    return cached.data;
  }
  throw networkError || new Error('No internet connection and no saved library is available yet.');
}

function offlineBannerHtml() {
  if (!state.libraryReady || !state.usingCachedLibrary) return '';
  const saved = state.offlineCacheSavedAt ? new Date(state.offlineCacheSavedAt).toLocaleString() : '';
  return `<div class="offline-library-banner"><strong>Using saved library</strong><span>${saved ? `Saved ${esc(saved)}. ` : ''}We’ll refresh automatically when internet returns.</span><button type="button" data-retry-library>Retry now</button></div>`;
}

function updateReconnectTimer() {
  const needsRetry = Boolean(state.error || state.offlineMode || state.usingCachedLibrary);
  if (needsRetry && !reconnectTimer) {
    reconnectTimer = setInterval(() => {
      if (!document.hidden && !bootstrapInFlight) bootstrap({ background:true });
    }, 10000);
  } else if (!needsRetry && reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = null;
  }
}

async function publicJson(path) {
  const noStore = String(path || '').startsWith('/audio-map') || String(path || '').startsWith('/audio-library') || String(path || '').startsWith('/schedule-data') || String(path || '').startsWith('/ads-source');
  const response = await fetch(`${API}${path}`, noStore ? { cache: 'no-store' } : undefined);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function setToast(message) {
  state.toast = message;
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(setToast._timer);
  setToast._timer = setTimeout(() => {
    state.toast = '';
    toast.remove();
  }, 2600);
}

function setToken(token) {
  state.token = String(token || '');
  if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
  else localStorage.removeItem(TOKEN_KEY);
}

function resetUserState() {
  state.user = null;
  state.myLikes = new Set();
  state.watchLater = new Set();
  state.follows = new Map();
  state.history = [];
  state.playbackPositions = new Map();
  state.historyLastMediaType = new Map();
  state.historyWriteChains = new Map();
  state.playlists = [];
  state.activePlaylistId = '';
  state.playlistPickerItem = null;
  state.notificationSettings = { pushEnabled:false, emailEnabled:false, pushConfigured:false, emailConfigured:false };
  state.paidLoaded = false;
  state.paidCatalog = [];
  state.paidExpandedId = '';
  state.recurringDonations = [];
  state.recurringLoaded = false;
  state.recurringLoading = false;
  state.recurringError = '';
  state.recurringActionBusy = '';
  state.isAdmin = false;
  state.adminChecked = false;
  state.adminLoaded = false;
  state.adminStatus = null;
  state.adminAdmins = [];
  state.adminReviewItems = [];
  state.adminSponsorships = [];
  state.adminPaidCatalog = [];
  state.adminPaidCatalogLoaded = false;
  if (state.accountSection === 'admin') state.accountSection = 'profile';
}


async function loadMetadata() {
  try {
    const response = await fetch('/library-metadata.json');
    if (!response.ok) throw new Error('metadata');
    state.metadata = await response.json();
  } catch (_) {
    const response = await fetch(`${WEBSITE}library-metadata.json`);
    state.metadata = await response.json();
  }

  state.speakerById = new Map((state.metadata.speakers || []).map(s => [String(s.id), s]));
  state.topicById = new Map((state.metadata.topics || []).map(t => [String(t.id), t]));
  learnSpeakerNameDictionary();
  state.speakerAliasToId = new Map();
  for (const speaker of state.metadata.speakers || []) {
    for (const name of [speaker.nameEn, speaker.nameHe, speaker.displayEn, speaker.displayHe, ...(speaker.aliases || [])]) {
      const clean = String(name || '').replace(/^(Rabbi|Rav|HaRav|Harav|Reb)\s+/i, '');
      const key = normalizeText(clean);
      if (key) state.speakerAliasToId.set(key, speaker.id);
    }
  }
}

function getVideoFilterMeta(showcase) {
  const normalized = String(showcase || '').toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
  let location = '';
  let locationSub = '';
  let year = '';
  if (normalized.includes('summer flatbush')) location = 'Flatbush';
  else if (normalized.includes('lakewood chol hamoed')) location = 'Lakewood';
  else if (normalized.includes('parsha') && normalized.includes('elozer nissen rubin')) { location = 'Boro Park'; locationSub = 'Parsha'; }
  else if (normalized.includes('zev smith')) { location = 'Boro Park'; locationSub = 'Sunday Shiurim'; }
  else if (normalized.includes('daily and chol hamoed') || normalized.includes('daily yiddish') || normalized.includes('boro park')) { location = 'Boro Park'; locationSub = 'Daily Shiurim'; }

  if (normalized.includes('parsha') && normalized.includes('elozer nissen rubin')) year = 'Mixed';
  else if (normalized.includes('lakewood chol hamoed')) year = 'Mixed';
  else if (/5784\s+and\s+older/.test(normalized)) year = '5784 & Older';
  else {
    const match = normalized.match(/\b(578[0-9])\b/);
    if (match) year = match[1];
  }
  return { location, locationKey: locationSub ? `${location}|${locationSub}` : location, year };
}

function extractSpeakerFromTitle(title) {
  const source = String(title || '').replace(/[\u2013\u2014]/g, '-');
  let match = source.match(/\b(Rabbi|Rav)\s+([^#|]+?)(?=\s+-\s+|#|\||$)/i);
  if (match) return match[2].trim().split(/\s+/).slice(0, 4).join(' ');
  match = source.match(/(?:\u05d4\u05e8\u05d1|\u05e8\u05d1\u05d9)\s*([^#|\-]+?)(?=\s+-\s+|#|\||$)/);
  if (match) return match[1].trim().split(/\s+/).slice(0, 4).join(' ');
  return '';
}

function resolveSpeakerFromTitle(title) {
  const raw = extractSpeakerFromTitle(title);
  const detected = normalizeText(raw);
  if (!detected) return '';
  if (state.speakerAliasToId.has(detected)) return state.speakerAliasToId.get(detected);
  for (const [alias, id] of state.speakerAliasToId.entries()) {
    if (alias && detected && (alias.includes(detected) || detected.includes(alias))) return id;
  }

  // V14: unknown complete names can reuse reviewed word-by-word name parts.
  // Never publish a half-guessed translation: every word must be known.
  const id = `auto-speaker:${detected}`;
  if (!state.speakerById.has(id)) {
    const hebrew = /[\u0590-\u05ff]/.test(raw);
    const generatedEn = hebrew ? generatedEnglishSpeakerName(raw) : '';
    const generatedHe = hebrew ? '' : generatedHebrewSpeakerName(raw);
    const speaker = {
      id,
      nameEn: generatedEn || (hebrew ? '' : raw),
      nameHe: hebrew ? raw : generatedHe,
      displayEn: generatedEn ? `Rav ${generatedEn}` : (hebrew ? raw : `Rav ${raw}`),
      displayHe: hebrew ? `הרב ${raw}` : (generatedHe ? `הרב ${generatedHe}` : raw),
      auto: true,
      generatedFromKnownNameParts: Boolean(generatedEn || generatedHe)
    };
    state.speakerById.set(id, speaker);
    state.speakerAliasToId.set(detected, id);
  }
  return id;
}

function resolveTopicFromTag(title) {
  const match = String(title || '').match(/#\s*([^#]+?)\s*$/);
  if (!match) return '';
  const wanted = normalizeText(match[1]);
  for (const topic of state.metadata.topics || []) {
    if ([topic.en, topic.he].some(v => normalizeText(v) === wanted)) return topic.id;
  }
  return '';
}

function cleanSpeakerDisplayName(value) {
  const source = String(value || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  const topicMarkers = new Set(['דיני','הלכות','הלכה','עניני','ענייני','שיעור','דרשה','פרשת','מסכת','dinei','hilchos','halacha','halachos','shiur','lecture','topic']);
  const words = source.split(/\s+/);
  const kept = [];
  let nameWords = 0;
  for (const word of words) {
    const clean = normalizeText(word).replace(/[^a-z0-9\u0590-\u05ff]/g, '');
    const honorific = /^(?:הרב|רבי|רב|ר|rabbi|rav|reb|harav)$/i.test(clean);
    if (nameWords >= 2 && topicMarkers.has(clean)) break;
    kept.push(word);
    if (!honorific && clean) nameWords += 1;
  }
  return kept.join(' ').replace(/[–—-]+\s*$/, '').trim();
}

function cleanTopicDisplayName(value) {
  return String(value || '')
    .replace(/\bInerview\b/gi, 'Interview')
    .replace(/\s*#chizuk\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function explicitSpeakerIdsForItem(item) {
  const ids = [];
  const add = value => {
    const id = String(value || '').trim();
    if (id && !ids.includes(id)) ids.push(id);
  };
  if (Array.isArray(item?.speakerIds)) item.speakerIds.forEach(add);
  add(item?.speakerId);
  if (ids.length) return ids;
  for (const value of [item?.speakerEn, item?.speakerHe, item?.speaker, item?.rabbi, item?.lecturer]) {
    const key = normalizeText(bareSpeakerName(value));
    if (key && state.speakerAliasToId.has(key)) add(state.speakerAliasToId.get(key));
  }
  return ids;
}

function explicitTopicIdForItem(item) {
  const direct = String(item?.topicId || '').trim();
  if (direct) return direct;
  const wanted = [item?.topicEn, item?.topicHe, item?.topic].map(normalizeText).filter(Boolean);
  if (!wanted.length) return '';
  for (const topic of state.metadata.topics || []) {
    const aliases = [topic.id, topic.en, topic.he, ...(topic.aliases || [])].map(normalizeText).filter(Boolean);
    if (wanted.some(value => aliases.includes(value))) return String(topic.id || '');
  }
  return '';
}

function speakerSearchValues(ids) {
  return (ids || []).flatMap(id => {
    const speaker = state.speakerById.get(id);
    return speaker ? [speaker.nameEn, speaker.nameHe, speaker.displayEn, speaker.displayHe, ...(speaker.aliases || [])] : [];
  }).filter(Boolean);
}

function getSpeechLanguage(item, type) {
  const location = String(type === 'video' ? item._location : item.location || '').toLowerCase();
  const showcase = String(item.showcase || '').toLowerCase();
  const speaker = [item._speakerLabel, item.speaker, item.rabbi, item.lecturer, item.title, item.name].filter(Boolean).join(' ').toLowerCase();
  if (location.includes('flatbush') || location.includes('lakewood')) return 'English';
  if (showcase.includes('smith') || /smith|smit/.test(speaker)) return 'English';
  return 'Yiddish';
}

function enrichVideo(video) {
  const id = videoId(video);
  const saved = state.metadata.lectures && state.metadata.lectures[id] || {};
  const filter = getVideoFilterMeta(video.showcase);
  video._location = String(video.location || filter.location || '');
  video._locationKey = video.location && (!filter.location || String(video.location) !== String(filter.location))
    ? String(video.location)
    : (filter.locationKey || video._location);
  video._year = String(video.year || filter.year || '');

  const serverSpeakerIds = explicitSpeakerIdsForItem(video);
  video._speakerIds = serverSpeakerIds.length ? serverSpeakerIds : (Array.isArray(saved.speakerIds) ? saved.speakerIds.filter(Boolean) : []);
  if (!video._speakerIds.length && saved.speakerId) video._speakerIds = [saved.speakerId];
  if (!video._speakerIds.length) {
    const detected = resolveSpeakerFromTitle(video.title);
    if (detected) video._speakerIds = [detected];
  }
  video._speakerIds = [...new Set(video._speakerIds.map(String).filter(Boolean))];

  video._topicId = explicitTopicIdForItem(video) || saved.topicId || resolveTopicFromTag(video.title) || '';
  const lang = currentLanguage();
  const explicitTitle = lang === 'he'
    ? (video.titleHe || video.title || video.titleEn)
    : (video.titleEn || video.title || video.titleHe);
  const explicitSpeaker = lang === 'he'
    ? (video.speakerHe || video.speaker || video.speakerEn)
    : (video.speakerEn || video.speaker || video.speakerHe);
  const explicitTopic = lang === 'he'
    ? (video.topicHe || video.topic || video.topicEn)
    : (video.topicEn || video.topic || video.topicHe);

  video._displayTitle = displayShiurTitle(explicitTitle, 'Untitled shiur');
  video._speakerLabel = cleanSpeakerDisplayName(explicitSpeaker) || video._speakerIds.map(speakerLabel).filter(Boolean).join(' / ');
  video._topicLabel = cleanTopicDisplayName(explicitTopic) || cleanTopicDisplayName(topicLabel(video._topicId));
  video._language = String(video.language || getSpeechLanguage(video, 'video'));
  const speakerAliases = speakerSearchValues(video._speakerIds);
  video._catalogSearch = normalizeText([
    video._displayTitle, video.title, video.titleEn, video.titleHe,
    video._speakerLabel, ...speakerAliases,
    video._topicLabel, video.topic, video.topicEn, video.topicHe,
    shiurCatalogCode(video), ...lectureCodeVariants(video)
  ].filter(Boolean).join(' '));
  video._search = normalizeText([
    video._catalogSearch, video.description, video.showcase, video.speaker, video.speakerEn, video.speakerHe,
    video.rabbi, video.lecturer, video._location, video._year, video._language
  ].filter(Boolean).join(' '));
  return video;
}

function enrichAudio(item) {
  item._location = item.location || '';
  item._locationKey = item.location || '';
  item._year = item.year || '';

  const explicitSpeakerIds = explicitSpeakerIdsForItem(item);
  const detected = explicitSpeakerIds.length ? '' : resolveSpeakerFromTitle(item.title || item.name);
  item._speakerIds = explicitSpeakerIds.length ? [...new Set(explicitSpeakerIds)] : (detected ? [detected] : []);
  item._topicId = explicitTopicIdForItem(item) || resolveTopicFromTag(item.title || item.name) || '';

  const lang = currentLanguage();
  const explicitTitle = lang === 'he'
    ? (item.titleHe || item.title || item.titleEn || item.name)
    : (item.titleEn || item.title || item.titleHe || item.name);
  const explicitSpeaker = lang === 'he'
    ? (item.speakerHe || item.speaker || item.speakerEn)
    : (item.speakerEn || item.speaker || item.speakerHe);
  const explicitTopic = lang === 'he'
    ? (item.topicHe || item.topic || item.topicEn)
    : (item.topicEn || item.topic || item.topicHe);

  item._displayTitle = displayShiurTitle(explicitTitle, 'Untitled shiur');
  item._speakerLabel = cleanSpeakerDisplayName(explicitSpeaker) || item._speakerIds.map(speakerLabel).filter(Boolean).join(' / ');
  item._topicLabel = cleanTopicDisplayName(explicitTopic) || cleanTopicDisplayName(topicLabel(item._topicId));
  item._language = String(item.language || getSpeechLanguage(item, 'audio'));
  const speakerAliases = speakerSearchValues(item._speakerIds);
  item._catalogSearch = normalizeText([
    item._displayTitle, item.title, item.titleEn, item.titleHe,
    item._speakerLabel, ...speakerAliases,
    item._topicLabel, item.topic, item.topicEn, item.topicHe,
    shiurCatalogCode(item), ...lectureCodeVariants(item)
  ].filter(Boolean).join(' '));
  item._search = normalizeText([
    item._catalogSearch, item.description, item.location, item.year, item._language,
    item.speaker, item.speakerEn, item.speakerHe
  ].filter(Boolean).join(' '));
  return item;
}

async function bootstrapJsonOr(path, fallback) {
  try { return await bootstrapJson(path); } catch (_) { return fallback; }
}

async function hydrateInitialCatalogCache() {
  if (state.libraryReady) return false;
  try {
    await loadMetadata();
    const keys = [
      '/video-map', '/audio-map', '/trending?period=week&limit=2500',
      '/trending?period=month&limit=2500', '/trending?period=all&limit=2500',
      '/shiur-view-count', '/like-counts'
    ];
    const cached = await Promise.all(keys.map(path => offlineCacheGet(`bootstrap:${path}`)));
    const videoCache = cached[0];
    if (!videoCache || !Array.isArray(videoCache.data)) return false;
    const videos = videoCache.data;
    const audios = cached[1]?.data || { items:[] };
    const week = cached[2]?.data || { items:[] };
    const month = cached[3]?.data || { items:[] };
    const all = cached[4]?.data || { items:[] };
    const counter = cached[5]?.data || { count:state.counter };
    const likeCounts = cached[6]?.data || {};
    state.videos = videos.map(enrichVideo).sort((a,b)=>itemDate(b)-itemDate(a));
    state.audioItems = (audios.items || []).map(enrichAudio).sort((a,b)=>itemDate(b)-itemDate(a));
    state.videoById = new Map(state.videos.map(v => [videoId(v), v]));
    state.audioById = new Map(state.audioItems.map(a => [rawAudioId(a), a]));
    state.trends.week = new Map((week.items || []).map(x => [String(x.id), Number(x.count) || 0]));
    state.trends.month = new Map((month.items || []).map(x => [String(x.id), Number(x.count) || 0]));
    state.trends.all = new Map((all.items || []).map(x => [String(x.id), Number(x.count) || 0]));
    state.counter = Number(counter.count || counter.total || counter.value) || state.counter;
    state.likeCounts = likeCounts || {};
    state.libraryReady = true;
    state.loading = false;
    state.usingCachedLibrary = true;
    state.offlineCacheSavedAt = Math.max(...cached.map(entry => Number(entry?.savedAt)||0), 0);
    render();
    return true;
  } catch (error) {
    console.warn('Fast cached startup unavailable', error);
    return false;
  }
}

async function bootstrap(options = {}) {
  if (bootstrapInFlight) return;
  bootstrapInFlight = true;
  const hadLibrary = state.libraryReady;
  if (!hadLibrary) {
    state.loading = true;
    state.error = '';
    if (!options.initial) render();
  }
  state.offlineMode = false;
  state.usingCachedLibrary = false;
  state.offlineCacheSavedAt = 0;
  initNativeDownloader().catch(() => {});
  try {
    await loadMetadata();
    const [videos, audios, week, month, all, counter, likeCounts] = await Promise.all([
      bootstrapJson('/video-map'),
      bootstrapJsonOr('/audio-map', { items:[] }),
      bootstrapJsonOr('/trending?period=week&limit=2500', { items:[] }),
      bootstrapJsonOr('/trending?period=month&limit=2500', { items:[] }),
      bootstrapJsonOr('/trending?period=all&limit=2500', { items:[] }),
      bootstrapJsonOr('/shiur-view-count', { count:1124579 }),
      bootstrapJsonOr('/like-counts', {})
    ]);

    state.videos = (Array.isArray(videos) ? videos : []).map(enrichVideo)
      .sort((a, b) => itemDate(b) - itemDate(a));
    state.audioItems = (audios.items || []).map(enrichAudio)
      .sort((a, b) => itemDate(b) - itemDate(a));
    state.videoById = new Map(state.videos.map(v => [videoId(v), v]));
    state.audioById = new Map(state.audioItems.map(a => [rawAudioId(a), a]));
    state.libraryReady = true;
    state.trends.week = new Map((week.items || []).map(x => [String(x.id), Number(x.count) || 0]));
    state.trends.month = new Map((month.items || []).map(x => [String(x.id), Number(x.count) || 0]));
    state.trends.all = new Map((all.items || []).map(x => [String(x.id), Number(x.count) || 0]));
    state.counter = Number(counter.count || counter.total || counter.value) || 1124579;
    state.likeCounts = likeCounts || {};
    state.error = '';

    await restoreSession();
    await Promise.all([loadSponsorRibbon(), loadScheduleData(), loadLiveStatus()]);
    await handleAppReturn();
  } catch (error) {
    console.error(error);
    if (!state.libraryReady) {
      state.error = 'offline';
      state.offlineMode = navigator.onLine === false;
    } else {
      state.offlineMode = true;
      state.usingCachedLibrary = true;
    }
  } finally {
    state.loading = false;
    bootstrapInFlight = false;
    render();
    updateReconnectTimer();
  }
}

async function restoreSession() {
  if (!state.token) {
    resetUserState();
    return;
  }
  try {
    const data = await apiJson('/me');
    if (!data.loggedIn || !data.user) {
      setToken('');
      resetUserState();
      return;
    }
    state.user = data.user;
    await loadUserCollections();
    await checkAdminStatus();
    warmNativePaidCatalog();
  } catch (error) {
    if (error.status === 401) {
      setToken('');
      resetUserState();
    }
  }
}

async function loadUserCollections() {
  if (!state.user) return;
  try {
    const [likes, later, follows, history, notificationSettings, playlists] = await Promise.all([
      apiJson('/my-like-ids').catch(() => ({ ids: [] })),
      apiJson('/watch-later').catch(() => ({ items: [] })),
      apiJson('/follows').catch(() => ({ items: [] })),
      apiJson('/history').catch(() => ({ items: [] })),
      apiJson('/notification-settings').catch(() => ({ pushEnabled:false, emailEnabled:false, pushConfigured:false, emailConfigured:false })),
      apiJson('/custom-playlists').catch(() => ({ items: [] }))
    ]);
    state.myLikes = new Set((likes.ids || []).map(String));
    state.watchLater = new Set((later.items || []).map(item => String(item.id || item.vimeoId || '')));
    state.follows = new Map((follows.items || []).map(item => [`${item.type}:${item.key}`, item]));
    const rawHistory = history.items || [];
    state.history = normalizeHistoryRows(rawHistory);
    refreshHistoryTypeIndex();
    cleanupDuplicateHistoryRows(rawHistory).catch(() => {});
    state.playlists = normalizePlaylistStore(playlists.items || []);
    try { localStorage.removeItem(PLAYLISTS_KEY); } catch (_) {}
    state.notificationSettings = { ...state.notificationSettings, ...notificationSettings };
    // Push is per app installation. Do not inherit another browser/device's state.
    state.notificationSettings.pushEnabled = await currentNativePushEnabled();
  } catch (error) {
    console.warn('Could not load account collections', error);
  }
}


async function checkAdminStatus(force = false) {
  if (!state.user) {
    state.isAdmin = false;
    state.adminChecked = true;
    return false;
  }
  if (state.adminChecked && !force) return state.isAdmin;
  try {
    const data = await apiJson('/admin/status');
    state.isAdmin = Boolean(data?.isAdmin);
    state.adminStatus = data || null;
    state.adminAdmins = Array.isArray(data?.admins) ? data.admins : [];
  } catch (error) {
    state.isAdmin = false;
    state.adminStatus = null;
    if (![401,403].includes(Number(error?.status))) console.warn('Admin status check failed', error);
  }
  state.adminChecked = true;
  if (!state.isAdmin && state.accountSection === 'admin') state.accountSection = 'profile';
  return state.isAdmin;
}

async function refreshLikeCounts() {
  try { state.likeCounts = await publicJson('/like-counts'); } catch (_) {}
}

async function login(email, password) {
  state.authBusy = true;
  state.authMessage = '';
  render();
  try {
    const response = await apiFetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.verificationRequired) {
        state.authVerifyEmail = String(data.email || email || '').trim().toLowerCase();
        state.authVerifyPassword = String(password || '');
        state.authMode = 'verify';
        state.authMessage = data.error || 'Enter the 6-digit verification code from your email.';
        return;
      }
      throw new Error(data.error || 'Login failed.');
    }
    if (!data.sessionToken) throw new Error('The app Worker is not returning an app session token.');
    setToken(data.sessionToken);
    state.user = data.user || { name: data.name || '', email };
    await loadUserCollections();
    state.adminChecked = false;
    await checkAdminStatus(true);
    state.paidLoaded = false;
    state.paidCatalog = [];
    state.recurringLoaded = false;
    state.recurringDonations = [];
    warmNativePaidCatalog();
    state.authMessage = '';
    state.authMode = 'login';
    state.authVerifyEmail = '';
    state.authVerifyPassword = '';
    setToast('Signed in successfully.');
  } catch (error) {
    state.authMessage = error.message || 'Login failed.';
  } finally {
    state.authBusy = false;
    render();
  }
}

async function loginWithGoogle() {
  state.authBusy = true;
  state.authMessage = '';
  render();
  try {
    const nativeGoogle = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.IrgunGoogleAuth;
    if (!nativeGoogle || typeof nativeGoogle.signIn !== 'function') {
      throw new Error('Google sign-in is not available in this app build.');
    }
    const config = await publicJson('/auth-config');
    const clientId = String(config.googleClientId || '').trim();
    if (!clientId) throw new Error('Google sign-in is not configured yet.');

    const nativeResult = await nativeGoogle.signIn({ clientId });
    const credential = String(nativeResult && nativeResult.idToken || '').trim();
    if (!credential) throw new Error('Google did not return a sign-in token.');

    const data = await apiJson('/google-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });
    if (!data.sessionToken) throw new Error('The app Worker did not return an app session token.');
    setToken(data.sessionToken);
    state.user = data.user || { name: data.name || nativeResult.name || '', email: nativeResult.email || '' };
    await loadUserCollections();
    state.adminChecked = false;
    await checkAdminStatus(true);
    state.paidLoaded = false;
    state.paidCatalog = [];
    state.recurringLoaded = false;
    state.recurringDonations = [];
    warmNativePaidCatalog();
    state.authMessage = ''
    state.authMode = 'login';
    setToast('Signed in with Google.');
  } catch (error) {
    const message = String(error && error.message || 'Google sign-in failed.');
    state.authMessage = /cancel/i.test(message) ? 'Google sign-in was cancelled.' : message;
  } finally {
    state.authBusy = false;
    render();
  }
}

async function loginWithApple() {
  state.authBusy=true;state.authMessage='';render();
  try{
    const config=await publicJson('/auth-config');
    const clientId=String(config.appleWebClientId||'').trim();
    const redirectUrl=String(config.appleWebRedirectUri||'https://irgunshiuraitorah.com/login.html').trim();
    if(!clientId)throw new Error('Apple sign-in is not configured yet.');
    await AppleSignIn.initialize({clientId});
    const stateToken=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`);
    const result=await AppleSignIn.signIn({scopes:[SignInScope.Email,SignInScope.FullName],redirectUrl,state:stateToken});
    if(result?.state&&String(result.state)!==stateToken)throw new Error('Apple sign-in security check failed.');
    const identityToken=String(result?.idToken||result?.identityToken||'').trim();
    if(!identityToken)throw new Error('Apple did not return a sign-in token.');
    const givenName=String(result?.givenName||'').trim();const familyName=String(result?.familyName||'').trim();const email=String(result?.email||'').trim();
    const data=await apiJson('/apple-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identityToken,givenName,familyName})});
    if(!data.sessionToken)throw new Error('The app Worker did not return an app session token.');
    setToken(data.sessionToken);state.user=data.user||{name:data.name||[givenName,familyName].filter(Boolean).join(' '),email};
    await loadUserCollections();state.adminChecked=false;await checkAdminStatus(true);state.paidLoaded=false;state.paidCatalog=[];state.recurringLoaded=false;state.recurringDonations=[];warmNativePaidCatalog();state.authMessage='';state.authMode='login';setToast('Signed in with Apple.');
  }catch(error){const message=String(error?.message||'Apple sign-in failed.');state.authMessage=/cancel|canceled|cancelled|1001/i.test(message)?'Apple sign-in was cancelled.':message;}
  finally{state.authBusy=false;render();}
}

async function register(name, email, password) {
  state.authBusy = true;
  state.authMessage = '';
  render();
  try {
    const response = await apiFetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (data.verificationRequired) {
      state.authVerifyEmail = String(data.email || email || '').trim().toLowerCase();
      state.authVerifyPassword = String(password || '');
      state.authMode = 'verify';
      state.authMessage = data.message || data.error || 'A 6-digit verification code was sent to your email.';
      return;
    }
    if (!response.ok) throw new Error(data.error || 'Registration failed.');
    throw new Error('Registration did not return verification instructions.');
  } catch (error) {
    state.authMessage = error.message || 'Registration failed.';
  } finally {
    state.authBusy = false;
    render();
  }
}
async function verifyEmailCode(code) {
  const email = String(state.authVerifyEmail || '').trim().toLowerCase();
  const cleanCode = String(code || '').replace(/\D/g, '').slice(0,6);
  if (!email) { state.authMessage = 'Enter your email and password again.'; state.authMode = 'login'; render(); return; }
  if (!/^\d{6}$/.test(cleanCode)) { state.authMessage = 'Enter the 6-digit verification code.'; render(); return; }
  state.authBusy = true; state.authMessage = 'Verifying code...'; render();
  try {
    const data = await apiJson('/verify-email-code', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email, code:cleanCode }) });
    if (!data.success) throw new Error(data.error || 'Verification failed.');
    const password = String(state.authVerifyPassword || '');
    state.authMessage = 'Email verified.';
    state.authBusy = false;
    if (password) { await login(email, password); return; }
    state.authMode = 'login';
    state.authVerifyEmail = '';
    render();
  } catch (error) {
    state.authBusy = false; state.authMessage = error.message || 'Verification failed.'; render();
  }
}

async function resendEmailVerificationCode() {
  const email = String(state.authVerifyEmail || '').trim().toLowerCase();
  if (!email) return;
  state.authBusy = true; state.authMessage = 'Sending a new verification code...'; render();
  try {
    const data = await apiJson('/resend-verification', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email }) });
    state.authMessage = data.message || 'A new 6-digit verification code was emailed.';
  } catch (error) {
    state.authMessage = error.message || 'Could not send verification code.';
  } finally {
    state.authBusy = false; render();
  }
}


async function requestPasswordReset(email) {
  state.authBusy = true;
  state.authMessage = '';
  render();
  try {
    await apiJson('/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    state.authMessage = 'If that email is registered, a password reset link has been sent. Please check your inbox and spam folder.';
  } catch (error) {
    state.authMessage = error.message || 'Could not request a password reset. Please try again.';
  } finally {
    state.authBusy = false;
    render();
  }
}

async function logout() {
  try { await apiJson('/logout', { method: 'POST' }); } catch (_) {}
  setToken('');
  resetUserState();
  state.accountSection = 'profile';
  render();
}

async function updateProfile(name, password) {
  try {
    await apiJson('/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password })
    });
    state.user.name = name;
    setToast('Profile updated.');
  } catch (error) {
    alert(error.message || 'Could not update profile.');
  }
}

async function toggleLike(id) {
  if (!state.user) return requireLogin('Sign in to like shiurim.');
  const wasLiked = state.myLikes.has(id);
  if (wasLiked) state.myLikes.delete(id); else state.myLikes.add(id);
  state.likeCounts[id] = Math.max(0, (Number(state.likeCounts[id]) || 0) + (wasLiked ? -1 : 1));
  refreshInteractiveUi();
  try {
    const result = await apiJson('/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: id })
    });
    if (result.liked) state.myLikes.add(id); else state.myLikes.delete(id);
    refreshInteractiveUi();
    refreshLikeCounts().then(refreshInteractiveUi).catch(() => {});
    if (!state.watchVideo && state.screen === 'library' && state.librarySection === 'likes') render();
  } catch (error) {
    if (wasLiked) state.myLikes.add(id); else state.myLikes.delete(id);
    state.likeCounts[id] = Math.max(0, (Number(state.likeCounts[id]) || 0) + (wasLiked ? 1 : -1));
    refreshInteractiveUi();
    alert(error.message || 'Could not update like.');
  }
}

async function toggleWatchLater(id) {
  if (!state.user) {
    state.playlistPickerItem = null;
    return requireLogin('Sign in to save shiurim.');
  }
  const saved = state.watchLater.has(id);
  if (saved) state.watchLater.delete(id); else state.watchLater.add(id);
  closePlaylistPickerInPlace();
  const inferred = String(id).startsWith('audio:') ? mediaRef('audio', id) : mediaRef('video', id);
  refreshSaveDestinationButtons(inferred.kind, inferred.id);
  try {
    await apiJson(saved ? '/playlist/remove' : '/playlist/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: id })
    });
    if (!saved) usageAnalytics.event('save_for_later', { shiurId:String(id || ''), dedupeKey:`save-later:${id}`, cooldownMs:3000 });
    if (!state.watchVideo && state.screen === 'library' && state.librarySection === 'later') render();
  } catch (error) {
    if (saved) state.watchLater.add(id); else state.watchLater.delete(id);
    refreshSaveDestinationButtons(inferred.kind, inferred.id);
    if (!state.watchVideo && state.screen === 'library' && state.librarySection === 'later') render();
    alert(error.message || 'Could not update Watch Later.');
  }
}

function requireLogin(message) {
  state.screen = 'account';
  state.authMode = 'login';
  state.authMessage = message || 'Please sign in.';
  closeWatch(false);
  render();
}

async function toggleFollow(type, key, label) {
  if (!state.user) return requireLogin('Sign in to follow speakers and topics.');
  try {
    const result = await apiJson('/follows/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, key, labelEn: label, labelHe: label })
    });
    const identity = `${type}:${key}`;
    if (result.following) state.follows.set(identity, result.item || { type, key, labelEn: label, labelHe: label });
    else state.follows.delete(identity);
    if (!state.watchVideo && state.screen === 'library' && state.librarySection === 'following') render();
    else refreshInteractiveUi();
  } catch (error) {
    alert(error.message || 'Could not update follow.');
  }
}

function historyIdFor(item) {
  if (!item) return '';
  return item.kind === 'video' ? String(item.id) : String(item.id);
}

function historyRowId(item) {
  return String(item?.rawAudioId || item?.videoId || item?.id || '').replace(/^audio:/, '');
}

function historyRowMediaType(item) {
  return String(item?.mediaType || (String(item?.id || '').startsWith('audio:') ? 'audio' : 'video')).toLowerCase();
}

function isVideoBackedHistoryId(id) {
  const raw = String(id || '').replace(/^audio:/, '');
  return Boolean(raw && (state.videoById?.has?.(raw) || (state.watchVideo && videoId(state.watchVideo) === raw) || (state.current?.kind === 'video-audio' && String(state.current.id) === raw)));
}

function historyLogicalKey(idOrItem, mediaType = '') {
  const isObject = idOrItem && typeof idOrItem === 'object';
  const raw = isObject ? historyRowId(idOrItem) : String(idOrItem || '').replace(/^audio:/, '');
  const type = isObject ? historyRowMediaType(idOrItem) : String(mediaType || '').toLowerCase();
  if (!raw) return '';
  if (type === 'video' || isVideoBackedHistoryId(raw)) return `shiur:${raw}`;
  return `audio:${raw}`;
}

function historyRowTimestamp(item) {
  for (const value of [item?.updatedAt, item?.updated_at, item?.lastWatchedAt, item?.last_watched_at, item?.updated, item?.createdAt, item?.created_at, item?.created, item?.timestamp]) {
    if (value == null || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 100000000000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeHistoryRows(rows) {
  const input = Array.isArray(rows) ? rows : [];
  const chosen = new Map();
  const order = [];
  input.forEach((row, index) => {
    const key = historyLogicalKey(row);
    if (!key) return;
    const score = historyRowTimestamp(row);
    if (!chosen.has(key)) {
      chosen.set(key, { row, score, index });
      order.push(key);
      return;
    }
    const current = chosen.get(key);
    // Prefer an explicitly newer timestamp. When the API has no timestamps,
    // preserve its existing order because /history is already newest-first.
    if (score > current.score) chosen.set(key, { row, score, index:current.index });
  });
  return order.map(key => chosen.get(key)?.row).filter(Boolean);
}

function refreshHistoryTypeIndex() {
  state.historyLastMediaType = new Map();
  for (const row of state.history || []) {
    const key = historyLogicalKey(row);
    if (key) state.historyLastMediaType.set(key, historyRowMediaType(row));
  }
}

function updateLocalHistoryPosition(id, mediaType, progress, duration, completed) {
  const key = historyLogicalKey(id, mediaType);
  if (!key) return;
  const index = (state.history || []).findIndex(row => historyLogicalKey(row) === key);
  if (index < 0) return;
  const existing = state.history[index];
  const safeProgress = Math.max(0, Math.floor(Number(progress) || 0));
  state.history[index] = {
    ...existing,
    mediaType:String(mediaType || '').toLowerCase(),
    progressSeconds:safeProgress,
    positionSeconds:safeProgress,
    durationSeconds:Math.max(0, Math.floor(Number(duration) || 0)),
    completed:Boolean(completed)
  };
  state.history = normalizeHistoryRows(state.history);
  refreshHistoryTypeIndex();
}

function queueHistoryWrite(key, task) {
  const previous = state.historyWriteChains.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  state.historyWriteChains.set(key, next);
  next.finally(() => {
    if (state.historyWriteChains.get(key) === next) state.historyWriteChains.delete(key);
  }).catch(() => {});
  return next;
}

async function cleanupDuplicateHistoryRows(rows, onlyKey = '') {
  if (!state.user) return;
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = historyLogicalKey(row);
    if (!key || (onlyKey && key !== onlyKey)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const normalized = normalizeHistoryRows(group);
    const keep = normalized[0];
    const keepId = String(keep?.historyId || '');
    if (!keepId) continue;
    const stale = group.filter(row => String(row?.historyId || '') && String(row.historyId) !== keepId);
    if (!stale.length) continue;
    await Promise.allSettled(stale.map(row => apiJson(`/history/${encodeURIComponent(row.historyId)}`, { method:'DELETE' })));
  }
}

async function reconcileHistoryForShiur(id, desiredMediaType) {
  if (!state.user || !id) return;
  const key = historyLogicalKey(id, desiredMediaType);
  const data = await apiJson('/history').catch(() => ({ items:[] }));
  const rows = Array.isArray(data.items) ? data.items : [];
  const matching = rows.filter(row => historyLogicalKey(row) === key);
  if (matching.length > 1) {
    const desired = matching.filter(row => historyRowMediaType(row) === String(desiredMediaType || '').toLowerCase());
    const pool = desired.length ? desired : matching;
    const keep = normalizeHistoryRows(pool)[0] || pool[0];
    const keepId = String(keep?.historyId || '');
    const stale = keepId ? matching.filter(row => String(row?.historyId || '') && String(row.historyId) !== keepId) : [];
    if (stale.length) await Promise.allSettled(stale.map(row => apiJson(`/history/${encodeURIComponent(row.historyId)}`, { method:'DELETE' })));
    const staleIds = new Set(stale.map(row => String(row.historyId)));
    state.history = normalizeHistoryRows(rows.filter(row => !staleIds.has(String(row?.historyId || ''))));
  } else {
    state.history = normalizeHistoryRows(rows);
  }
  refreshHistoryTypeIndex();
}

function playbackPositionKey(id, mediaType) {
  return historyLogicalKey(id, mediaType);
}

function cachedSavedPosition(id, mediaType) {
  if (!id) return 0;
  const key = playbackPositionKey(id, mediaType);
  if (state.playbackPositions.has(key)) return Math.max(0, Number(state.playbackPositions.get(key)) || 0);
  if (!state.user) return 0;
  const row = (state.history || []).find(item => historyLogicalKey(item) === key);
  return row && !row.completed ? Math.max(0, Number(row.progressSeconds || row.positionSeconds) || 0) : 0;
}

async function getSavedPosition(id, mediaType) {
  const cached = cachedSavedPosition(id, mediaType);
  if (cached > 0 || !state.user || !id) return cached;
  try {
    const data = await apiJson(`/history?videoId=${encodeURIComponent(id)}&mediaType=${encodeURIComponent(mediaType)}`);
    let item = data.item || null;
    // A video-backed shiur has one logical resume point regardless of whether the
    // last presentation was Audio or Video. If the typed lookup misses, consult
    // the account history and use the single normalized lecture row.
    if ((!item || item.completed) && isVideoBackedHistoryId(id)) {
      const all = await apiJson('/history').catch(() => ({ items:[] }));
      state.history = normalizeHistoryRows(all.items || []);
      refreshHistoryTypeIndex();
      item = state.history.find(row => historyLogicalKey(row) === historyLogicalKey(id, mediaType)) || null;
    }
    const seconds = item && !item.completed ? Number(item.progressSeconds || item.positionSeconds) || 0 : 0;
    if (seconds > 0) state.playbackPositions.set(playbackPositionKey(id, mediaType), seconds);
    return seconds;
  } catch (_) {
    return 0;
  }
}

function saveHistory(id, mediaType, progress, duration, completed = false, options = {}) {
  if (!state.user || !id) return Promise.resolve();
  const normalizedType = String(mediaType || '').toLowerCase();
  const key = playbackPositionKey(id, normalizedType);
  const safeProgress = Math.max(0, Math.floor(Number(progress) || 0));
  const safeDuration = Math.max(0, Math.floor(Number(duration) || 0));
  const previousType = String(state.historyLastMediaType.get(key) || '').toLowerCase();
  const presentationChanged = Boolean(key.startsWith('shiur:') && previousType && previousType !== normalizedType);
  const shouldReconcile = Boolean(options.reconcile || presentationChanged);
  state.playbackPositions.set(key, completed ? 0 : safeProgress);
  updateLocalHistoryPosition(id, normalizedType, safeProgress, safeDuration, completed);
  state.historyLastMediaType.set(key, normalizedType);

  return queueHistoryWrite(key, async () => {
    try {
      await apiJson('/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: id,
          mediaType: normalizedType,
          progressSeconds: safeProgress,
          durationSeconds: safeDuration,
          completed: Boolean(completed)
        })
      });
      // Reconcile automatically whenever the presentation changes (Video <->
      // Audio), not only when the switch came from the watch-page buttons. This
      // also covers Listen-from-Home, History, background handoff, and deep links.
      if (shouldReconcile && key.startsWith('shiur:')) {
        await reconcileHistoryForShiur(id, normalizedType);
      }
    } catch (error) {
      console.warn('History save failed', error);
    }
  });
}

async function reloadHistory() {
  if (!state.user) return;
  try {
    const data = await apiJson('/history');
    const rows = data.items || [];
    state.history = normalizeHistoryRows(rows);
    refreshHistoryTypeIndex();
    state.playbackPositions = new Map();
    cleanupDuplicateHistoryRows(rows).catch(() => {});
  } catch (_) {}
}

async function removeHistory(id) {
  if (!state.user || !id) return;
  try {
    await apiJson(`/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await reloadHistory();
    render();
  } catch (error) {
    alert(error.message || 'Could not remove history item.');
  }
}

async function clearHistory() {
  if (!state.user || !confirm('Clear your entire watch history?')) return;
  try {
    await apiJson('/history', { method: 'DELETE' });
    state.history = [];
    state.playbackPositions = new Map();
    state.historyLastMediaType = new Map();
    state.historyWriteChains = new Map();
    render();
  } catch (error) {
    alert(error.message || 'Could not clear history.');
  }
}

async function recordPublicView(id, mediaType) {
  if (!id) return;
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${mediaType}:${id}`;
  if (state.publicCounted.has(key) || localStorage.getItem(`ist-view-${key}`)) return;
  state.publicCounted.add(key);
  try {
    await apiJson('/shiur-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: id, mediaType, visitorId: getVisitorId() })
    });
    localStorage.setItem(`ist-view-${key}`, '1');
  } catch (error) {
    state.publicCounted.delete(key);
  }
}

function trendCount(item, period = state.librarySort) {
  if (period === 'newest') return 0;
  const id = item && item._kind === 'audio' ? rawAudioId(item) : videoId(item);
  return Number(state.trends[period] && state.trends[period].get(String(id)) || 0);
}

function itemDate(item) {
  const value = item && (item.lectureDate || item.date || item.modified || item.created) || 0;
  const time = parseAppDate(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function allLibraryItems() {
  const videos = state.videos.map(item => ({ ...item, _kind: 'video' }));
  const audios = state.audioItems.map(item => ({ ...item, _kind: 'audio' }));
  if (state.libraryMode === 'video') return videos;
  if (state.libraryMode === 'audio') return audios;
  return [...videos, ...audios];
}

function uniqueOptions(items, getter) {
  return [...new Set(items.map(getter).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function availableFilters() {
  const items = allLibraryItems();
  const speakerIds = [...new Set(items.flatMap(item => item._speakerIds || []).filter(Boolean))]
    .sort((a, b) => speakerLabel(a).localeCompare(speakerLabel(b)));
  const topicIds = [...new Set([
    ...(state.metadata.topics || []).map(t => t.id),
    ...items.map(item => item._topicId).filter(Boolean)
  ])];
  return {
    locations: uniqueOptions(items, item => item._locationKey || item._location),
    years: uniqueOptions(items, item => item._year),
    languages: uniqueOptions(items, item => item._language),
    speakers: speakerIds,
    topics: topicIds
  };
}

function locationFilterMatches(item, selections) {
  if (!selections.length) return true;
  const key = String(item._locationKey || item._location || '');
  const parent = String(item._location || key.split('|')[0] || '');
  return selections.some(value => {
    const selected = String(value);
    if (selected === key) return true;
    if (!selected.includes('|') && selected === parent) return true;
    return false;
  });
}

function containsNormalizedPhrase(haystack, needle) {
  return (` ${normalizeText(haystack)} `).includes(` ${normalizeText(needle)} `);
}

function speakerSearchIntent(rawQuery) {
  const query = normalizeText(rawQuery);
  if (!query || !state.speakerById.size) return null;
  const honorifics = new Set(['rav','rabbi','reb','harav','הרב','רבי','רב','ר']);
  const records = [];
  for (const [id, speaker] of state.speakerById.entries()) {
    const aliases = [...new Set([speaker?.nameEn, speaker?.nameHe, speaker?.displayEn, speaker?.displayHe, ...(speaker?.aliases || [])]
      .map(value => normalizeText(bareSpeakerName(value))).filter(Boolean))];
    for (const alias of aliases) {
      if (alias.length < 3) continue;
      if (containsNormalizedPhrase(query, alias)) records.push({ id:String(id), alias, words:alias.split(' ').length, length:alias.length });
    }
  }
  if (records.length) {
    records.sort((a,b) => b.words-a.words || b.length-a.length);
    const best = records[0];
    const tied = new Set(records.filter(row => row.words===best.words && row.length===best.length && row.alias===best.alias).map(row => row.id));
    if (tied.size === 1) {
      const sourceTokens = query.split(' ').filter(Boolean);
      const aliasTokens = best.alias.split(' ').filter(Boolean);
      let removed = false;
      const remainderTokens = [];
      for (let i = 0; i < sourceTokens.length;) {
        const match = !removed && aliasTokens.every((token, offset) => sourceTokens[i + offset] === token);
        if (match) { i += aliasTokens.length; removed = true; continue; }
        if (!honorifics.has(sourceTokens[i])) remainderTokens.push(sourceTokens[i]);
        i += 1;
      }
      return { speakerIds:[best.id], remainder:remainderTokens.join(' ').trim(), matched:best.alias };
    }
  }

  const queryTokens = query.split(' ').filter(token => token && !honorifics.has(token));
  for (const token of queryTokens) {
    if (token.length < 4) continue;
    const ids = new Set();
    for (const [id, speaker] of state.speakerById.entries()) {
      const aliases = [speaker?.nameEn, speaker?.nameHe, speaker?.displayEn, speaker?.displayHe, ...(speaker?.aliases || [])]
        .map(value => normalizeText(bareSpeakerName(value))).filter(Boolean);
      if (aliases.some(alias => { const parts = alias.split(' ').filter(Boolean); return parts.length && parts[parts.length - 1] === token; })) ids.add(String(id));
    }
    if (ids.size) {
      return { speakerIds:[...ids], remainder:queryTokens.filter(value => value !== token).join(' ').trim(), matched:token };
    }
  }
  return null;
}

function speakerIntentMatches(item, intent) {
  if (!intent || !Array.isArray(intent.speakerIds) || !intent.speakerIds.length) return true;
  const ids = (item?._speakerIds || []).map(String);
  return ids.some(id => intent.speakerIds.includes(id));
}

function speakerAwareQueryContext(rawQuery) {
  const raw = String(rawQuery || '').trim();
  const codeQuery = lectureCodeQuery(raw);
  if (codeQuery) return { raw, intent:null, metadataQuery:'', codeQuery };
  const intent = speakerSearchIntent(raw);
  const metadataQuery = normalizeText(intent ? intent.remainder : raw);
  return { raw, intent, metadataQuery, codeQuery:'' };
}

function matchesLibraryFilters(item, searchContext = null) {
  const f = state.filters;
  if (!locationFilterMatches(item, f.location)) return false;
  if (f.year.length && !f.year.includes(item._year)) return false;
  if (f.language.length && !f.language.includes(item._language)) return false;
  if (f.speaker.length && !(item._speakerIds || []).some(id => f.speaker.includes(id))) return false;
  if (f.topic.length && !f.topic.includes(item._topicId)) return false;
  const context = searchContext || speakerAwareQueryContext(state.libraryQuery);
  if (context.raw) {
    if (context.codeQuery && !lectureCodeMatches(item, context.codeQuery)) return false;
    if (!speakerIntentMatches(item, context.intent)) return false;
    const catalogMatch = Boolean(context.codeQuery) || !context.metadataQuery || String(item._catalogSearch || item._search || '').includes(context.metadataQuery);
    if (state.librarySearchMode === 'catalog') {
      if (!catalogMatch) return false;
    } else {
      const transcriptMatch = item._kind === 'video' && state.transcriptMatchedVideoIds.has(videoId(item));
      if (!catalogMatch && !transcriptMatch) return false;
    }
  }
  return true;
}

async function runLibrarySearch() {
  const query = String(state.libraryQuery || '').trim();
  const serial = ++state.transcriptSearchSerial;
  state.transcriptMatchedVideoIds = new Set();
  state.transcriptMatchTimes = new Map();
  refreshShiurimResults();
  if (state.librarySearchMode !== 'content' || query.length < 2) return;
  const context = speakerAwareQueryContext(query);
  if (context.codeQuery) return;
  const transcriptQuery = context.intent ? context.intent.remainder : query;
  if (String(transcriptQuery || '').trim().length < 2) return;
  try {
    const data = await publicJson(`/transcript-search?q=${encodeURIComponent(transcriptQuery)}&limit=100`);
    if (serial !== state.transcriptSearchSerial || state.librarySearchMode !== 'content' || String(state.libraryQuery || '').trim() !== query) return;
    const byId = new Map(state.videos.map(video => [videoId(video), video]));
    const hits = (data.items || []).filter(item => item.mediaType === 'video' && item.mediaId && speakerIntentMatches(byId.get(String(item.mediaId)), context.intent));
    state.transcriptMatchedVideoIds = new Set(hits.map(item => String(item.mediaId || '')));
    state.transcriptMatchTimes = new Map();
    for (const hit of hits) {
      const id = String(hit.mediaId || '');
      if (!id || state.transcriptMatchTimes.has(id)) continue;
      state.transcriptMatchTimes.set(id, Math.max(0, Math.floor(Number(hit.startSeconds) || 0)));
    }
    refreshShiurimResults();
  } catch (error) {
    console.warn('Shiur Content search unavailable; showing title/details matches only.', error);
  }
}

function filteredLibraryItems() {
  const context = speakerAwareQueryContext(state.libraryQuery);
  const items = allLibraryItems().filter(item => matchesLibraryFilters(item, context));
  return items.sort((a, b) => {
    if (state.librarySort === 'newest') return itemDate(b) - itemDate(a);
    const countDiff = trendCount(b) - trendCount(a);
    return countDiff || itemDate(b) - itemDate(a);
  });
}

function searchResults() {
  const context = speakerAwareQueryContext(state.searchQuery);
  if (!context.raw) return [];
  const videos = state.searchMode === 'audio' ? [] : state.videos.map(v => ({ ...v, _kind: 'video' }));
  const audios = state.searchMode === 'video' ? [] : state.audioItems.map(a => ({ ...a, _kind: 'audio' }));
  return [...videos, ...audios]
    .filter(item => (!context.codeQuery || lectureCodeMatches(item, context.codeQuery)) && speakerIntentMatches(item, context.intent) && (Boolean(context.codeQuery) || !context.metadataQuery || String(item._search || '').includes(context.metadataQuery)))
    .sort((a, b) => itemDate(b) - itemDate(a))
    .slice(0, 100);
}

function homeTrending() {
  const map = state.trends[state.homeTrendPeriod] || new Map();
  const byId = new Map([
    ...state.videos.map(v => [videoId(v), { ...v, _kind: 'video' }]),
    ...state.audioItems.map(a => [rawAudioId(a), { ...a, _kind: 'audio' }])
  ]);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ item: byId.get(id), count }))
    .filter(x => x.item)
    .slice(0, 6);
}

function recentItems() {
  return [
    ...state.videos.map(v => ({ ...v, _kind: 'video' })),
    ...state.audioItems.map(a => ({ ...a, _kind: 'audio' }))
  ].sort((a, b) => itemDate(b) - itemDate(a)).slice(0, 6);
}

function likeIdForItem(item) {
  return item._kind === 'audio' ? `audio:${rawAudioId(item)}` : videoId(item);
}

function watchLaterIdForItem(item) {
  return likeIdForItem(item);
}

function itemTitle(item) {
  return displayShiurTitle(item && (item._displayTitle || item.title || item.name), 'Untitled shiur');
}

function itemSubtitle(item) {
  if (item._kind === 'audio') return [item.location, item.year, item._speakerLabel, item._topicLabel].filter(Boolean).join(' - ');
  return [item.showcase, item._speakerLabel, item._topicLabel].filter(Boolean).join(' - ');
}

function actionIconButton({ cls = '', attrs = '', icon = '', label = '', suffix = '' }) {
  return `<button class="icon-action ${cls}" ${attrs} aria-label="${esc(label)}" title="${esc(label)}"><span class="action-symbol">${icon}</span>${suffix}<span class="sr-only">${esc(label)}</span></button>`;
}

function sanitizeDownloadFilename(value, extension) {
  let base = String(value || 'shiur')
    .replace(/[\/:*?"<>|]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (!base) base = 'shiur';
  if (base.length > 120) base = base.slice(0, 120).trim();
  return `${base}.${extension}`;
}

function paidRichDescription(value) {
  const fallback='Torah audio collection from Irgun Shiurai Torah.';
  const raw=String(value||fallback).replace(/\r\n?/g,'\n').trim()||fallback;
  const inline=line=>esc(line)
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/_([^_]+)_/g,'<em>$1</em>');
  const blocks=[]; let list=[];
  const flushList=()=>{if(list.length){blocks.push(`<ul>${list.map(item=>`<li>${inline(item)}</li>`).join('')}</ul>`);list=[];}};
  for(const line of raw.split('\n')){
    const trimmed=line.trim();
    const bullet=trimmed.match(/^[-*]\s+(.+)$/);
    if(bullet){list.push(bullet[1]);continue;}
    flushList();
    if(!trimmed){blocks.push('<div class="paid-rich-spacer"></div>');continue;}
    blocks.push(`<p>${inline(trimmed)}</p>`);
  }
  flushList();
  return blocks.join('');
}

function allLabelForFilter(key) {
  return { location: 'All Locations', year: 'All Years', language: 'All Languages', speaker: 'All Speakers', topic: 'All Topics' }[key] || 'All';
}

function topicChildren(parentId) {
  return (state.metadata.topics || []).filter(topic => topic.parent === parentId).map(topic => String(topic.id));
}

function itemCard(item, options = {}) {
  const isAudio = item._kind === 'audio';
  const id = isAudio ? rawAudioId(item) : videoId(item);
  const actionIdValue = likeIdForItem(item);
  const liked = state.myLikes.has(actionIdValue);
  const savePresentation = saveDestinationPresentation(isAudio ? 'audio' : 'video', id);
  const saved = savePresentation.savedForLater;
  const count = Number(state.likeCounts[actionIdValue]) || 0;
  const date = item.lectureDate || item.date || item.modified || item.created;
  const hasContentMatch = !isAudio && state.librarySearchMode === 'content' && state.transcriptMatchedVideoIds.has(String(id)) && state.transcriptMatchTimes.has(String(id));
  const matchStart = hasContentMatch ? Math.max(0, Math.floor(Number(state.transcriptMatchTimes.get(String(id))) || 0)) : 0;
  const watchTimeAttr = hasContentMatch ? ` data-watch-time="${matchStart}"` : '';
  const catalogCode = shiurCatalogCode(item);
  const offlineState = (isAudio || item.hasAudio) ? offlineActionState(isAudio ? 'audio' : 'video', id) : null;
  return `<article class="media-card">
    <div class="media-cover-wrap">
      <button class="media-cover" data-${isAudio ? 'listen-audio' : 'watch'}="${esc(id)}"${isAudio ? '' : watchTimeAttr} aria-label="${esc(isAudio ? tr('Listen') : tr('Watch'))}">
        ${isAudio
          ? logoArtworkHtml()
          : `<img src="${esc(item.thumbnail || '')}" alt="" loading="lazy">`}
        ${isNew(date) ? '<span class="badge-new">NEW</span>' : ''}
      </button>
      <div class="media-primary-overlay">
        <button class="primary-media-btn" data-${isAudio ? 'listen-audio' : 'watch'}="${esc(id)}"${isAudio ? '' : watchTimeAttr}>${svgIcon('play')}<span>${isAudio ? 'Listen' : 'Watch'}</span></button>
        ${!isAudio && item.hasAudio ? `<button class="primary-media-btn secondary" data-listen-video="${esc(id)}">${svgIcon('audio')}<span>Listen</span></button>` : ''}
      </div>
    </div>
    <div class="media-body">
      <button class="media-title" data-${isAudio ? 'listen-audio' : 'watch'}="${esc(id)}"${isAudio ? '' : watchTimeAttr}>${esc(itemTitle(item))}</button>
      <div class="media-meta">${esc(itemSubtitle(item))}</div>
      ${hasContentMatch ? `<button class="content-match-time content-match-button" data-watch="${esc(id)}" data-watch-time="${matchStart}" type="button">Match at ${esc(fmtTime(matchStart))}</button>` : ''}
      <div class="media-meta">${date ? esc(fmtDate(date)) : ''}${isAudio ? ` - ${esc(fmtDurationOrUnknown(item.duration))}` : (item.duration ? ` - ${esc(fmtTime(item.duration))}` : '')}</div>
      ${state.isAdmin && state.adminMode ? `<div class="admin-card-tools media-admin-tools"><button data-admin-video-edit="${esc(id)}" data-admin-media-kind="${isAudio ? 'audio' : 'video'}">Edit Shiur</button></div>` : ''}
      ${catalogCode ? `<div class="card-catalog-code">${esc(catalogCode)}</div>` : ''}
      <div class="action-row">
        ${actionIconButton({ cls: liked ? 'active' : '', attrs: `data-like="${esc(actionIdValue)}"`, icon: svgIcon('heart'), label: 'Like', suffix: `<span class="card-like-count">${count}</span>` })}
        ${actionIconButton({ cls: savePresentation.cls, attrs: `data-open-playlist-picker="1" data-playlist-kind="${isAudio ? 'audio' : 'video'}" data-playlist-id="${esc(id)}"`, icon: svgIcon('bookmark'), label: savePresentation.label })}
        ${actionIconButton({ attrs: `data-share-kind="${isAudio ? 'audio' : 'video'}" data-share-id="${esc(id)}"`, icon: svgIcon('share'), label: 'Share' })}
        ${actionIconButton({ attrs: `data-download-kind="${isAudio ? 'audio' : 'video'}" data-download-id="${esc(id)}"`, icon: svgIcon('download'), label: 'Download' })}
        ${offlineState ? actionIconButton({ cls: offlineState.cls, attrs: `data-save-offline-kind="${isAudio ? 'audio' : 'video'}" data-save-offline-id="${esc(id)}"`, icon: offlineIconHtml(), label: offlineState.label, suffix: offlineState.status === 'downloading' ? `<span class="offline-progress-badge">${Number(offlineState.job?.percent)>0?`${Number(offlineState.job.percent)}%`:'…'}</span>` : '' }) : ''}
      </div>
    </div>
  </article>`;
}

function compactItem(item) {
  const playback = historyPlaybackInfo(item);
  const isHistory = Boolean(item && item.mediaType);
  const isAudio = isHistory ? playback.isAudio : (item._kind === 'audio');
  const isVideoAudio = isHistory && playback.isVideoAudio;
  const id = isHistory ? playback.id : (isAudio ? String(item.rawAudioId || item.videoId || item.id || '').replace(/^audio:/, '') : String(item.id || item.vimeoId || item.videoId || ''));
  const video = isVideoAudio ? playback.video : null;
  const title = displayShiurTitle(item.title || item.name || (video && video.title), 'Untitled shiur');
  const sub = isVideoAudio ? `Audio · ${[video.showcase, video._speakerLabel, video._topicLabel].filter(Boolean).join(' - ')}` : isAudio ? [item.location, item.year].filter(Boolean).join(' - ') : (item.showcase || '');
  const thumb = isVideoAudio && video && video.thumbnail ? `<img class="compact-thumb" src="${esc(video.thumbnail)}" alt="" loading="lazy">` : isAudio ? logoArtworkHtml('compact-thumb') : `<img class="compact-thumb" src="${esc(item.thumbnail || '')}" alt="" loading="lazy">`;
  const actionAttr = isVideoAudio ? `data-listen-video="${esc(id)}"` : isAudio ? `data-listen-audio="${esc(id)}"` : `data-watch="${esc(id)}"`;
  return `<article class="compact-item">
    ${thumb}
    <div class="compact-main">
      <button class="compact-title" ${actionAttr}>${esc(title)}</button>
      <div class="compact-meta">${esc(sub)}</div>
      <div class="compact-actions">
        <button class="small-btn primary" ${actionAttr}>${isAudio ? tr('Listen') : tr('Watch')}</button>
        ${item.historyId ? `<button class="small-btn danger" data-remove-history="${esc(item.historyId)}">${tr('Remove')}</button>` : ''}
      </div>
    </div>
  </article>`;
}

function filterLabeler(key, value) {
  if (key === 'location') return value.includes('|') ? value.split('|')[1] : value;
  if (key === 'speaker') return speakerLabel(value);
  if (key === 'topic') return topicLabel(value);
  return value;
}

function filterButton(key, label) {
  const selected = state.filters[key] || [];
  const caption = selected.length === 0 ? `All ${label.toLowerCase()}`
    : selected.length === 1 ? filterLabeler(key, selected[0])
    : `${selected.length} selected`;
  return `<button class="filter-pill ${selected.length ? 'active' : ''}" data-open-filter="${key}"><span>${esc(label)}</span><strong>${esc(caption)}</strong><b>⌄</b></button>`;
}

function locationFilterOptionsHtml(values) {
  const ordered = [...values.map(String)].sort((a, b) => {
    const ap = a.split('|')[0];
    const bp = b.split('|')[0];
    if (ap === 'Boro Park' && bp !== 'Boro Park') return -1;
    if (bp === 'Boro Park' && ap !== 'Boro Park') return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
  const groups = new Map();
  for (const value of ordered) {
    const [parent, child = ''] = value.split('|');
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push({ value, child });
  }
  return [...groups.entries()].map(([parent, entries]) => {
    const childEntries = entries.filter(entry => entry.child);
    const hasChildren = childEntries.length > 0;
    if (!hasChildren) {
      const entry = entries[0];
      return `<label class="filter-option location-parent"><input type="checkbox" data-filter-option="${esc(entry.value)}" ${state.filterDraft.has(entry.value) ? 'checked' : ''}><span>${esc(parent)}</span></label>`;
    }
    const childOrder = { 'Daily Shiurim': 1, 'Sunday Shiurim': 2, 'Parsha': 3 };
    childEntries.sort((a, b) => (childOrder[a.child] || 50) - (childOrder[b.child] || 50) || a.child.localeCompare(b.child));
    const ids = entries.map(entry => entry.value);
    const checked = ids.length > 0 && ids.every(id => state.filterDraft.has(id));
    const children = childEntries.map(entry => `<label class="filter-option location-child"><input type="checkbox" data-filter-option="${esc(entry.value)}" ${state.filterDraft.has(entry.value) ? 'checked' : ''}><span>${esc(entry.child)}</span></label>`).join('');
    return `<div class="location-filter-branch"><label class="filter-option location-parent"><input type="checkbox" data-location-parent="${esc(parent)}" ${checked ? 'checked' : ''}><span>${esc(parent)}</span></label><div class="location-filter-children">${children}</div></div>`;
  }).join('');
}

function topicFilterOptionsHtml(values) {
  const available = new Set(values.map(String));
  const parents = (state.metadata.topics || []).filter(topic => !topic.parent);
  const rendered = [];
  const parentIds = new Set(parents.map(topic => String(topic.id)));

  for (const parent of parents) {
    const parentId = String(parent.id);
    const children = topicChildren(parentId).filter(id => available.has(id));
    const parentAvailable = available.has(parentId);
    if (!parentAvailable && !children.length) continue;
    const relevant = [...(parentAvailable ? [parentId] : []), ...children];
    const parentChecked = relevant.some(id => state.filterDraft.has(id));
    const childHtml = children.map(childId => `<label class="filter-option topic-child"><input type="checkbox" data-filter-option="${esc(childId)}" ${state.filterDraft.has(childId) ? 'checked' : ''}><span>${esc(topicLabel(childId))}</span></label>`).join('');
    rendered.push(`<div class="topic-filter-branch"><label class="filter-option topic-parent"><input type="checkbox" data-topic-parent="${esc(parentId)}" ${parentChecked ? 'checked' : ''}><span>${esc(topicLabel(parentId))}</span></label>${childHtml ? `<div class="topic-filter-children">${childHtml}</div>` : ''}</div>`);
  }

  for (const id of values.map(String)) {
    const topic = state.topicById.get(id);
    if (!topic || topic.parent || parentIds.has(id)) continue;
    rendered.push(`<div class="topic-filter-branch"><label class="filter-option topic-parent"><input type="checkbox" data-filter-option="${esc(id)}" ${state.filterDraft.has(id) ? 'checked' : ''}><span>${esc(topicLabel(id))}</span></label></div>`);
  }
  return rendered.join('');
}

function filterSheetHtml() {
  const key = state.filterDialog;
  if (!key) return '';
  const options = availableFilters();
  const values = key === 'location' ? options.locations
    : key === 'year' ? options.years
    : key === 'language' ? options.languages
    : key === 'speaker' ? options.speakers
    : options.topics;
  const title = key[0].toUpperCase() + key.slice(1);
  const allSelected = values.length > 0 && values.every(value => state.filterDraft.has(String(value)));
  const optionsHtml = key === 'topic'
    ? topicFilterOptionsHtml(values)
    : key === 'location'
      ? locationFilterOptionsHtml(values)
      : values.map(value => `<label class="filter-option"><input type="checkbox" data-filter-option="${esc(value)}" ${state.filterDraft.has(String(value)) ? 'checked' : ''}><span>${esc(filterLabeler(key, value))}</span></label>`).join('');
  return `<div class="filter-sheet-backdrop" data-close-filter="1">
    <section class="filter-sheet" data-filter-sheet="1">
      <div class="filter-sheet-head"><div><h2>${esc(title)}</h2><p>Select one or more.</p></div><button data-close-filter="1">×</button></div>
      <div class="filter-option-list">
        <label class="filter-option all-filter-option"><input type="checkbox" data-filter-all="${esc(key)}" ${allSelected ? 'checked' : ''}><span>${esc(allLabelForFilter(key))}</span></label>
        ${optionsHtml}
      </div>
      <div class="filter-sheet-footer"><button class="filter-clear" data-filter-clear="1">Clear</button><button class="filter-apply" data-filter-apply="1">Apply <span id="filterDraftCount">${state.filterDraft.size ? `(${state.filterDraft.size})` : ''}</span></button></div>
    </section>
  </div>`;
}

function donateFabHtml() {
  if (state.screen === 'donate') return '';
  return `<button class="donate-fab ${state.current ? 'with-player' : ''}" data-nav="donate">${svgIcon('donate')}<span>Donate</span></button>`;
}

function bottomNavHtml() {
  const items = [
    ['home', 'Home', 'home'],
    ['shiurim', 'Shiurim', 'play'],
    ['live', 'Live', 'live'],
    ['library', 'Library', 'library'],
    ['account', 'Account', 'account']
  ];
  const activeRoot = state.screen.startsWith('live') ? 'live' : state.screen;
  return `<nav class="bottom-nav">${items.map(([key, label, icon]) => `
    <button class="nav-btn ${activeRoot === key ? 'active' : ''}" data-nav="${key}">
      <span class="nav-icon">${svgIcon(icon)}</span><span>${tr(label)}</span>
    </button>`).join('')}</nav>`;
}

function shell(content) {
  return `<div class="app-shell ${state.sponsorRibbon?.enabled ? 'has-sponsor-ribbon' : ''}">
    ${sponsorRibbonHtml()}
    <header class="topbar">
      <div class="brand">
        <div class="brand-logo-frame"><img src="/logo.png" alt="Irgun Shiurai Torah"></div>
        <div class="brand-copy"><strong>Irgun Shiurai Torah</strong><span>Torah lectures worldwide</span></div>
        <div class="top-actions">
          <button class="top-store" data-nav="paid" aria-label="Purchase" title="Purchase">${svgIcon('store')}</button>
          <button class="top-contact" data-nav="contact" aria-label="Contact" title="Contact">${svgIcon('mail')}</button>
          <button class="app-language-button" data-language-toggle="1">${currentLanguage() === 'he' ? 'English' : 'עברית'}</button>
          <button class="top-account" data-nav="account">${state.user ? esc(state.user.name || 'Account') : tr('Sign In')}</button>
        </div>
      </div>
    </header>
    ${offlineBannerHtml()}
    <main class="content">${content}</main>
    ${state.current && !(state.watchVideo && state.watchMinimized && state.watchMode === 'video') ? miniPlayerHtml() : ''}
    ${donateFabHtml()}
    ${bottomNavHtml()}
    ${state.playerOpen && state.current ? fullPlayerHtml() : ''}
    ${state.watchVideo && !state.watchHostedExternally && !state.playerOpen ? watchHtml() : ''}
    <div id="downloadManagerMount">${downloadManagerHtml()}</div>
    ${filterSheetHtml()}
    ${deleteAccountDialogHtml()}
    ${adminEditorHtml()}
  </div>`;
}


function clearPersistentVideoMount() {
  if (!persistentVideoMount) return;
  persistentVideoMount.replaceChildren();
  persistentVideoMount.className = '';
  state.watchHostedExternally = false;
  document.body.classList.remove('irgun-watch-mini-hosted');
}

function refreshPersistentMiniVideoChrome() {
  if (!persistentVideoMount) return;
  const button = persistentVideoMount.querySelector('[data-mini-video-play-toggle]');
  if (!button) return;
  button.setAttribute('aria-label', state.watchVideoPlaying ? 'Pause' : 'Play');
  button.innerHTML = state.watchVideoPlaying ? '<span class="pause-mark">II</span>' : svgIcon('play');
}

async function togglePersistentMiniVideoPlayback(event) {
  if (event) event.stopPropagation();
  const player = state.watchVimeo;
  if (!player || !state.watchVimeoReady) return;
  try {
    const paused = await player.getPaused();
    if (paused) await PlaybackController.play();
    else await PlaybackController.pause();
  } catch (_) {}
}

function bindPersistentVideoChrome() {
  if (!persistentVideoMount) return;
  persistentVideoMount.querySelectorAll('[data-expand-watch]').forEach(expand => {
    if (expand.dataset.bound) return;
    expand.dataset.bound = '1';
    expand.addEventListener('click', expandPersistentWatch);
    expand.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); expandPersistentWatch(); } });
  });
  const close = persistentVideoMount.querySelector('[data-close-mini-video]');
  if (close && !close.dataset.bound) {
    close.dataset.bound = '1';
    close.addEventListener('click', event => { event.stopPropagation(); closeWatch(true); });
  }
  const playPause = persistentVideoMount.querySelector('[data-mini-video-play-toggle]');
  if (playPause && !playPause.dataset.bound) {
    playPause.dataset.bound = '1';
    playPause.addEventListener('click', togglePersistentMiniVideoPlayback);
  }
  // Once the watch overlay has been moved outside #app, later app renders do not
  // re-bind its top-bar buttons. Bind them here as part of the permanent host.
  const minimize = persistentVideoMount.querySelector('[data-minimize-watch]');
  if (minimize && !minimize.dataset.bound) {
    minimize.dataset.bound = '1';
    minimize.addEventListener('click', event => { event.stopPropagation(); minimizeWatchToPersistent(); });
  }
  const pip = persistentVideoMount.querySelector('[data-video-pip]');
  if (pip && !pip.dataset.bound) {
    pip.dataset.bound = '1';
    pip.addEventListener('click', event => { event.stopPropagation(); enterSystemPictureInPicture(); });
  }
  const back = persistentVideoMount.querySelector('[data-close-watch]');
  if (back && !back.dataset.bound) {
    back.dataset.bound = '1';
    back.addEventListener('click', event => { event.stopPropagation(); closeWatch(true); });
  }
  refreshPersistentMiniVideoChrome();
}

function hostCurrentWatchOverlay(mode = 'full') {
  if (!persistentVideoMount || !state.watchVideo || state.watchMode !== 'video') return false;
  let overlay = persistentVideoMount.querySelector('.watch-overlay');
  if (!overlay) {
    overlay = document.querySelector('#app .watch-overlay');
    if (!overlay) return false;
    persistentVideoMount.replaceChildren();
    // This happens BEFORE initWatchVimeo() on first open, so the iframe reaches
    // its permanent host before playback starts. After that it is never moved.
    persistentVideoMount.appendChild(overlay);
  }
  state.watchHostedExternally = true;
  const mini = mode === 'mini';
  state.watchMinimized = mini;
  persistentVideoMount.className = `persistent-video-mount watch-video-host ${mini ? 'watch-mini-host' : 'watch-full-host'}`;
  document.body.classList.toggle('irgun-watch-mini-hosted', mini);
  bindPersistentVideoChrome();
  PlaybackController.setPresentation(mini ? 'MINI' : 'FULL').catch(()=>{});
  return Boolean(persistentVideoMount.querySelector('#watchVimeoFrame'));
}

async function resetWatchVimeoPlayer() {
  const player = state.watchVimeo;
  state.watchVimeo = null;
  state.watchVimeoReady = false;
  state.watchVideoPlaying = false;
  state.watchVimeoGeneration += 1;
  if (!player) return;
  try {
    await Promise.race([Promise.resolve(player.destroy()).catch(()=>{}), new Promise(resolve=>setTimeout(resolve,250))]);
  } catch (_) {}
}

async function quickVimeoTime(fallback = 0, timeoutMs = 900) {
  const player = state.watchVimeo;
  const safeFallback = Math.max(0, Number(fallback) || 0);
  if (!player || typeof player.getCurrentTime !== 'function') return safeFallback;
  try {
    const value = await Promise.race([
      Promise.resolve(player.getCurrentTime()).catch(() => safeFallback),
      new Promise(resolve => setTimeout(() => resolve(safeFallback), timeoutMs))
    ]);
    return Math.max(0, Number(value) || safeFallback);
  } catch (_) { return safeFallback; }
}

async function minimizeWatchToPersistent() {
  if (!state.watchVideo || state.watchMode !== 'video' || state.watchMinimized) return;
  // Presentation changes happen immediately. Reading the Vimeo clock is async and
  // must never make the minimize button look dead. The iframe is not recreated.
  if (!state.watchHostedExternally && !hostCurrentWatchOverlay('mini')) return;
  state.watchMinimized = true;
  persistentVideoMount.classList.remove('watch-full-host');
  persistentVideoMount.classList.add('watch-mini-host');
  document.body.classList.add('irgun-watch-mini-hosted');
  bindPersistentVideoChrome();
  PlaybackController.setPresentation('MINI').catch(()=>{});
  state.watchResumeSeconds = await quickVimeoTime(state.watchResumeSeconds || 0, 300);
}

async function expandPersistentWatch() {
  if (!state.watchVideo || !state.watchMinimized) return;
  // Reverse of minimize: same DOM, same iframe, same Vimeo Player object.
  state.watchMinimized = false;
  if (persistentVideoMount) {
    persistentVideoMount.classList.remove('watch-mini-host');
    persistentVideoMount.classList.add('watch-full-host');
  }
  document.body.classList.remove('irgun-watch-mini-hosted');
  refreshPersistentMiniVideoChrome();
  PlaybackController.setPresentation('FULL').catch(()=>{});
  state.watchResumeSeconds = await quickVimeoTime(state.watchResumeSeconds || 0, 300);
}

function homeHtml() {
  const trending = homeTrending();
  const recent = recentItems();
  const upcoming = futureScheduleEvents(3);
  const live = liveScheduleEvents();
  const next = upcoming[0];
  return `<section class="hero pro-hero">
      <div class="hero-photo" aria-hidden="true"></div>
      <div class="hero-overlay" aria-hidden="true"></div>
      <div class="hero-content">
        <span class="hero-eyebrow">TORAH • LIVE • ON DEMAND</span>
        <h1>Torah, wherever you are.</h1>
        <p>Live shiurim, thousands of recordings, powerful search, schedules and your personal Torah library — in one app.</p>
        <div class="hero-actions"><button class="hero-btn primary" data-nav="shiurim">${svgIcon('play')} Browse Shiurim</button><button class="hero-btn glass" data-nav="live">${svgIcon('live')} Watch Live</button></div>
        <div class="counter-card pro-counter"><strong>${state.counter.toLocaleString()}</strong><span>Shiurim watched &amp; listened to</span></div>
      </div>
    </section>

    <section class="home-shortcuts" aria-label="Quick access">
      <button class="home-shortcut" data-nav="schedule"><span>${svgIcon('calendar')}</span><div class="home-shortcut-copy"><strong>Schedule</strong><small>Upcoming Shiurim</small></div></button>
      <button class="home-shortcut" data-nav="paid"><span>${svgIcon('store')}</span><div class="home-shortcut-copy"><strong>Purchase</strong><small>Premium collections</small></div></button>
      <button class="home-shortcut" data-nav="donate"><span>${svgIcon('donate')}</span><div class="home-shortcut-copy"><strong>Sponsor Torah</strong><small>Donate or dedicate</small></div></button>
      <button class="home-shortcut" data-nav="library"><span>${svgIcon('library')}</span><div class="home-shortcut-copy"><strong>Your Library</strong><small>Likes &amp; history</small></div></button>
    </section>

    ${homeDiscoveryHtml()}

    <section class="section live-now-section">
      <div class="section-head"><div><span class="section-kicker">LIVE &amp; NEXT</span><h2>${live.length ? 'Live Now' : 'Next Shiur'}</h2></div><button class="section-link" data-nav="live">View live page</button></div>
      ${live.length ? `<div class="live-now-grid">${live.slice(0,2).map(event => `<button class="live-now-card" data-nav="${event.location === 'Flatbush' ? 'live-flatbush' : 'live-boro'}"><span class="live-pill"><i></i> LIVE</span><strong>${esc(event.title || 'Live Broadcast')}</strong><span>${esc(event.speaker || event.location || '')}</span><small>${esc(event.location || '')}</small></button>`).join('')}</div>`
        : next ? scheduleEventCard(next, true)
        : `<div class="pro-empty"><strong>No upcoming shiur is posted yet.</strong><span>Open the schedule for the current flyers.</span><button data-nav="schedule">View Schedule</button></div>`}
    </section>

    <section class="section">
      <div class="section-head"><div><span class="section-kicker">COMING UP</span><h2>Upcoming Shiurim</h2></div><button class="section-link" data-nav="schedule">Full schedule</button></div>
      ${upcoming.length ? `<div class="upcoming-home-list">${upcoming.map(event => scheduleEventCard(event, true)).join('')}</div>` : '<div class="empty">Current upcoming schedule will appear here.</div>'}
    </section>

    <section class="section">
      <div class="section-head"><div><span class="section-kicker">POPULAR NOW</span><h2>Trending Shiurim</h2></div><div class="segmented"><button data-trend-period="week" class="${state.homeTrendPeriod === 'week' ? 'active' : ''}">This Week</button><button data-trend-period="month" class="${state.homeTrendPeriod === 'month' ? 'active' : ''}">This Month</button></div></div>
      ${trending.length ? `<div class="card-grid">${trending.map(x => itemCard(x.item, { trendCount: x.count })).join('')}</div>` : '<div class="empty">Trending shiurim will appear here.</div>'}
    </section>

    <section class="section">
      <div class="section-head"><div><span class="section-kicker">NEW</span><h2>Latest Shiurim</h2></div><button class="section-link" data-nav="shiurim">Browse all</button></div>
      <div class="card-grid">${recent.map(itemCard).join('')}</div>
    </section>`;
}

function liveHtml() {
  const live = liveScheduleEvents();
  const upcoming = futureScheduleEvents(5, ['Boro Park','Flatbush']);
  return `<div class="page-title pro-page-title"><span class="page-kicker">LIVE TORAH</span><h1>Listen &amp; Watch Live</h1><p>The player appears automatically around scheduled Boro Park and Flatbush shiurim. Direct access is always available below.</p></div>
    ${live.length ? `<section class="live-active-panel"><div class="live-active-head"><span class="live-pill"><i></i> LIVE NOW</span><span>${live.length} stream${live.length === 1 ? '' : 's'} available</span></div><div class="live-now-grid">${live.map(event => `<button class="live-now-card" data-nav="${event.location === 'Flatbush' ? 'live-flatbush' : 'live-boro'}"><strong>${esc(event.title || 'Live Broadcast')}</strong>${event.speaker ? `<span>${esc(event.speaker)}</span>` : ''}<small>${esc(event.location)}</small><b>Watch Live ${svgIcon('play')}</b></button>`).join('')}</div></section>` : `<div class="live-offline-note"><span>${svgIcon('live')}</span><div><strong>No scheduled stream is live right now.</strong><p>You can still open either recurring Vimeo event directly.</p></div></div>`}
    <div class="live-grid pro-live-grid">
      <button class="live-location-card" data-nav="live-boro"><div class="location-icon">BP</div><div><h2>Boro Park</h2><p>Karlin-Stolin • 1601 48th Street</p><span>Open Live Stream</span></div></button>
      <button class="live-location-card" data-nav="live-flatbush"><div class="location-icon">FB</div><div><h2>Flatbush</h2><p>Bostoner Bais Medrash • 2822 Avenue J</p><span>Open Live Stream</span></div></button>
    </div>
    <section class="section"><div class="section-head"><h2>Upcoming Live Shiurim</h2><button class="section-link" data-nav="schedule">Full Schedule</button></div>${upcoming.length ? `<div class="upcoming-home-list">${upcoming.map(event => scheduleEventCard(event,true)).join('')}</div>` : '<div class="empty">No upcoming live shiurim are posted yet.</div>'}</section>
    <div class="phone-panel section pro-phone-panel"><div><span class="section-kicker">PHONE</span><h2>Listen Live By Phone</h2><p>All locations</p></div><a href="tel:7189066427" class="phone-big">718-906-6427</a><div class="phone-note">Call and press <strong>*</strong>, then choose Irgun Shiurai Torah and your location.</div></div>
    <div class="phone-panel section"><h2>Listen Afterwards</h2><div class="phone-links"><a href="tel:7189066427"><strong>Main Line</strong><span>718-906-6427</span></a><a href="tel:7189066437"><strong>Flatbush Recordings</strong><span>718-906-6437</span></a></div></div>`;
}

function liveStreamHtml(location) {
  const boro = location === 'boro';
  const loc = boro ? 'Boro Park' : 'Flatbush';
  const title = boro ? 'Boro Park Shiurim' : 'Flatbush Shiurim';
  const stream = LIVE_STREAMS[loc];
  const active = liveScheduleEvents().find(event => event.location === loc);
  const address = boro ? 'Karlin-Stolin · 1601 48th Street, Brooklyn, NY' : 'Bostoner Bais Medrash · 2822 Avenue J, Brooklyn, NY';
  return `<div class="live-player-wrap pro-live-player-wrap"><div class="live-player-card"><iframe class="live-frame" src="${esc(stream)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>${active ? '<span class="player-live-badge"><i></i> LIVE</span>' : ''}</div>
    <div class="live-back-row"><button class="live-back-button" data-nav="live">← Back to Live</button></div>
    <div class="page-title live-stream-title"><span class="page-kicker">${active ? 'LIVE NOW' : 'RECURRING LIVE EVENT'}</span><h1>${esc(active?.title || title)}</h1>${active?.speaker ? `<strong class="live-speaker">${esc(active.speaker)}</strong>` : ''}<p>${esc(address)}</p></div>
    <div class="phone-panel section"><h2>Listen Live By Phone</h2><a href="tel:7189066427" class="phone-big">718-906-6427</a><div class="phone-note">Press <strong>*</strong> after connecting.</div></div>`;
}

function scheduleHtml() {
  const allEvents = futureScheduleEvents(100);
  const recentAll = recentScheduleEvents(30, 100);
  const locations = [...new Set((state.scheduleData?.events || []).map(event => event.location).filter(Boolean))];
  if (state.scheduleCityFilter !== 'all' && !locations.includes(state.scheduleCityFilter)) state.scheduleCityFilter = 'all';
  const events = state.scheduleCityFilter === 'all' ? allEvents : allEvents.filter(event => String(event.location || '') === state.scheduleCityFilter);
  const recent = state.scheduleCityFilter === 'all' ? recentAll : recentAll.filter(event => String(event.location || '') === state.scheduleCityFilter);
  const typed = state.scheduleDataLoading && !state.scheduleDataLoaded
    ? '<div class="loading">Loading upcoming shiurim...</div>'
    : state.scheduleDataError && !events.length && !recent.length
      ? `<div class="error">${esc(state.scheduleDataError)}</div>`
      : `${events.length
        ? `<div class="schedule-summary"><strong>${events.length}</strong><span>upcoming shiurim</span><small>${esc(locations.join(' • '))}</small></div><div class="schedule-event-list">${events.map(event => scheduleEventCard(event)).join('')}</div>`
        : '<div class="pro-empty"><strong>No upcoming typed shiurim are posted.</strong><span>Use Original Flyers to see the current notices.</span></div>'}
        <section class="schedule-recent-section"><div class="schedule-recent-head"><span class="section-kicker">RECENT LECTURES — LAST 30 DAYS</span><h2>Recent Lectures</h2><p>Showing lectures from the last 30 days.</p></div>${recent.length ? `<div class="schedule-event-list recent">${recent.map(event => scheduleEventCard(event)).join('')}</div>` : '<div class="pro-empty"><strong>No recent lectures found for this location.</strong><span>Recent schedule items from the last 30 days will appear here.</span></div>'}</section>`;
  return `<div class="page-title pro-page-title schedule-title"><span class="page-kicker">CURRENT SCHEDULE</span><h1>Upcoming Shiurim</h1><p>Clean typed schedule from the same system used by the website, with original flyers always available.</p>${state.isAdmin && state.adminMode ? '<button class="admin-inline-add" data-admin-schedule-add="1">+ Add Schedule Item</button>' : ''}</div>
    <div class="segmented schedule-view-tabs"><button data-schedule-view="upcoming" class="${state.scheduleView === 'upcoming' ? 'active' : ''}">${svgIcon('calendar')} Upcoming</button><button data-schedule-view="flyers" class="${state.scheduleView === 'flyers' ? 'active' : ''}">${svgIcon('library')} Original Flyers</button></div>
    ${state.scheduleView === 'upcoming' ? `<label class="schedule-city-filter"><span>${currentLanguage()==='he'?'עיר':'City'}</span><select id="scheduleCityFilter"><option value="all" ${state.scheduleCityFilter==='all'?'selected':''}>${currentLanguage()==='he'?'כל הערים':'All cities'}</option>${locations.map(city=>`<option value="${esc(city)}" ${state.scheduleCityFilter===city?'selected':''}>${esc(city)}</option>`).join('')}</select></label>` : ''}
    <div class="schedule-view-panel ${state.scheduleView === 'upcoming' ? 'active' : ''}" ${state.scheduleView === 'upcoming' ? '' : 'hidden'}>${typed}</div>
    <div class="schedule-view-panel ${state.scheduleView === 'flyers' ? 'active' : ''}" ${state.scheduleView === 'flyers' ? '' : 'hidden'}><div id="scheduleAds" class="schedule-ads">${state.scheduleLoading ? '<div class="loading">Loading original flyers...</div>' : state.scheduleError ? `<div class="error">${esc(state.scheduleError)}</div>` : '<div class="loading">Loading original flyers...</div>'}</div></div>`;
}

function paidProductImageUrls(item) {
  const raw = [...(Array.isArray(item.imageUrls) ? item.imageUrls : []), item.coverUrl].filter(Boolean).map(String);
  return [...new Set(raw)].map(apiUrl);
}

function paidProductPriceLabel(item) {
  return Number(item?.priceCents) > 0 ? money(item.priceCents,item.currency) : tr('Price to be announced');
}

function paidMaterialsHtml(item) {
  const files = Array.isArray(item.attachments) ? item.attachments : [];
  if (!item.owned || !files.length) return '';
  return `<div class="paid-materials"><div class="paid-materials-title">${svgIcon('library')} <strong>Included PDF downloads</strong></div><div class="paid-materials-list">${files.map(file=>`<article class="paid-material"><div><strong>${esc(file.title || file.fileName || 'PDF')}</strong><small>${esc(file.fileName || '')}${file.size ? ` • ${Math.max(1,Math.round(Number(file.size)/1024))} KB` : ''}</small></div><div class="paid-material-actions"><button type="button" data-paid-attachment-view="${esc(file.id)}" data-paid-product="${esc(item.id)}">View</button><button type="button" class="primary" data-paid-attachment-download="${esc(file.id)}" data-paid-product="${esc(item.id)}">Download</button></div></article>`).join('')}</div></div>`;
}

function paidProductCard(item) {
  const id = String(item.id || '');
  const expanded = state.paidExpandedId === id;
  const images = paidProductImageUrls(item);
  const status = item.owned ? tr('Purchased') : item.available ? tr('Available now') : tr('Coming Soon');
  const statusClass = item.owned ? 'owned' : item.available ? 'available' : 'coming';
  const coverHtml = images.length ? `<div class="paid-cover paid-cover-carousel" data-paid-carousel="${esc(id)}"><div class="paid-cover-track">${images.map((url,index)=>`<div class="paid-cover-slide" data-paid-slide="${index}"><img src="${esc(url)}" alt="${esc(paidProductTitle(item, 'Paid shiur'))}${images.length>1?` ${index+1}`:''}" loading="${index===0?'eager':'lazy'}" ${index===0?'fetchpriority="high"':''} decoding="async"></div>`).join('')}</div>${images.length>1?`<div class="paid-cover-dots">${images.map((_,index)=>`<button type="button" class="paid-cover-dot ${index===0?'active':''}" data-paid-image-dot="${index}" aria-label="Show picture ${index+1}"></button>`).join('')}</div>`:''}<button type="button" class="paid-cover-zoom" data-paid-image-open="${esc(id)}">View</button>${item.featured ? '<span class="paid-featured">FEATURED</span>' : ''}${item.owned ? '<span class="paid-owned">PURCHASED</span>' : ''}</div>` : `<div class="paid-cover">${logoArtworkHtml()}${item.featured ? '<span class="paid-featured">FEATURED</span>' : ''}${item.owned ? '<span class="paid-owned">PURCHASED</span>' : ''}</div>`;
  return `<article class="paid-card ${item.featured ? 'featured' : ''} ${item.owned ? 'owned' : ''}">
    ${coverHtml}
    <div class="paid-body"><div class="paid-card-topline"><span class="paid-category">${esc(item.category || 'Audio Collection')}</span><span class="paid-status-chip ${statusClass}">${esc(status)}</span></div><h2>${esc(paidProductTitle(item))}</h2>${item.speaker ? `<strong class="paid-speaker">${esc(item.speaker)}</strong>` : ''}<div class="paid-meta">${esc([item.catalogDetails, item.audience].filter(Boolean).join(' • '))}</div>
      <div class="paid-price-row"><strong>${esc(paidProductPriceLabel(item))}</strong><span>${item.trackCount ? `${Number(item.trackCount)} tracks` : ''}</span></div>
      <div class="paid-actions">${item.owned ? `<button class="paid-primary" data-paid-expand="${esc(id)}">${svgIcon('play')} ${expanded ? 'Close' : 'Listen'}</button>` : item.available ? `<button class="paid-primary" data-paid-purchase="${esc(id)}">${svgIcon('store')} Buy Securely</button>` : `<button class="paid-primary paid-coming-button" disabled>${tr('Coming Soon')}</button>`}<button class="paid-secondary" data-paid-description="${esc(id)}">Details</button></div>
      <div class="paid-description paid-description-rich" data-paid-description-panel="${esc(id)}" hidden>${paidRichDescription(item.description)}</div>
      ${item.owned ? `<div class="paid-album" ${expanded ? '' : 'hidden'}><div class="paid-track-head"><strong>Your Audio</strong><span>Protected personal listening</span></div>${(item.tracks || []).length ? `<div class="paid-track-list">${item.tracks.map((track,index)=>`<button class="paid-track" data-paid-track="${esc(track.id)}" data-paid-product="${esc(id)}"><span>${index+1}</span><div><strong>${esc(track.title || `Track ${index+1}`)}</strong><small>${track.size ? `${Math.round(Number(track.size)/1024/1024)} MB` : 'Secure streaming'}</small></div>${svgIcon('play')}</button>`).join('')}</div>` : '<div class="empty">This purchase is connected, but its tracks are not available right now.</div>'}${paidMaterialsHtml(item)}</div>` : ''}
      ${state.isAdmin && state.adminMode ? `<div class="admin-card-tools"><button data-admin-paid-edit="${esc(id)}">Edit Product</button><button class="danger" data-admin-paid-delete="${esc(id)}">Delete</button></div>` : ''}
    </div>
  </article>`;
}

function paidCheckoutModalHtml() {
  const item = state.paidCatalog.find(entry => String(entry.id) === String(state.paidCheckoutItemId));
  if (!item) return '';
  return `<div class="paid-modal-backdrop" data-paid-modal-backdrop="1"><section class="paid-modal" role="dialog" aria-modal="true"><div class="paid-modal-head"><div><span>SECURE PURCHASE</span><h2>${esc(paidProductTitle(item))}</h2><p>${money(item.priceCents,item.currency)}</p></div><button data-paid-checkout-close="1" aria-label="Close">×</button></div><div id="paidStripeElement" class="paid-stripe-element"></div><div id="paidCheckoutMessage" class="paid-checkout-message ${state.paidCheckoutMessage ? 'visible' : ''}">${esc(state.paidCheckoutMessage || 'Preparing secure payment...')}</div><button id="paidPayButton" class="paid-pay-button" disabled>Pay ${money(item.priceCents,item.currency)} securely</button><small class="paid-secure-note">Payment is processed securely by Stripe. Irgun does not receive your full card number.</small></section></div>`;
}

function paidShiurimHtml() {
  if (!state.paidLoaded && !state.paidError) return `<div class="page-title pro-page-title"><span class="page-kicker">PREMIUM TORAH AUDIO</span><h1>${currentLanguage()==='he'?'רכישה':'Purchase'}</h1><p>${currentLanguage()==='he'?'טוען את האוספים הזמינים ואת הרכישות שלכם…':'Loading available collections and your purchases…'}</p></div><div class="loading">${currentLanguage()==='he'?'טוען אוספים…':'Loading audio collections…'}</div>`;
  const owned = state.paidCatalog.filter(item => item.owned).length;
  const ordered = [...state.paidCatalog].sort((a,b)=>Number(Boolean(b.featured))-Number(Boolean(a.featured)) || paidProductTitle(a).localeCompare(paidProductTitle(b)));
  const available = ordered.filter(item => item.available || item.owned);
  const coming = ordered.filter(item => !item.available && !item.owned);
  const availableHtml = `<section class="paid-catalog-section"><div class="section-head paid-catalog-heading"><div><span class="section-kicker">${tr('Available Collections')}</span><h2>${tr('Available Collections')}</h2></div><small>${available.length ? `${available.length} ${available.length===1?'collection':'collections'}` : tr('More collections are being prepared')}</small></div>${available.length ? `<div class="paid-grid ${available.length===1?'single-featured':''}">${available.map(paidProductCard).join('')}</div>` : `<div class="empty">${tr('More collections are being prepared')}</div>`}</section>`;
  const comingHtml = coming.length ? `<details class="paid-coming-wrap"><summary><span>${tr('Coming Soon Collections')}</span><small>${coming.length}</small></summary><div class="paid-grid">${coming.map(paidProductCard).join('')}</div></details>` : '';
  return `<div class="page-title pro-page-title paid-page-title"><span class="page-kicker">PREMIUM TORAH AUDIO</span><h1>Purchase</h1><p>Purchase once and listen from your Irgun account. Purchased collections stay private and are streamed through protected access.</p>${state.isAdmin && state.adminMode ? '<button class="admin-inline-add" data-admin-paid-add="1">+ Add Paid Shiur</button>' : ''}</div>
    <div class="purchase-state-strip"><span>✓ ${currentLanguage()==='he'?'רכישה חד־פעמית':'One-time purchase'}</span><span>🔒 ${currentLanguage()==='he'?'גישה פרטית':'Private access'}</span><span>▶ ${currentLanguage()==='he'?'האזנה בתוך האפליקציה':'Listen in the app'}</span></div>
    ${state.user && owned ? `<div class="owned-summary"><span>${svgIcon('library')}</span><div><strong>${owned} purchased collection${owned === 1 ? '' : 's'}</strong><p>Available on this app and your Irgun account.</p></div><button data-nav="library" data-open-purchased="1">Your Purchases</button></div>` : ''}
    ${!state.user ? `<div class="store-login-note"><span>${svgIcon('account')}</span><div><strong>Sign in before purchasing</strong><p>Your purchase is tied securely to your Irgun account.</p></div><button data-nav="account">Sign In</button></div>` : ''}
    ${state.paidError ? `<div class="paid-retry-card"><strong>${currentLanguage()==='he'?'לא היה אפשר לטעון את החנות':'The purchase page could not load'}</strong><span>${esc(state.paidError)}</span><button data-paid-retry="1">${currentLanguage()==='he'?'נסה שוב':'Try Again'}</button></div>` : ''}
    ${state.paidCatalog.length ? availableHtml + comingHtml : '<div class="empty">Paid shiurim are not available right now.</div>'}
    ${paidCheckoutModalHtml()}`;
}

const SPONSOR_DEDICATION_HE = {
  'Select a dedication type':'בחרו סוג הקדשה','Leilui Nishmat / In Memory Of':'לעילוי נשמת / לזכר','In Honor Of':'לכבוד','Anonymous':'אנונימי',
  'Refuah Shelema / Speedy Recovery':'רפואה שלמה / רפואה מהירה','Shidduchim / Find a Soulmate':'שידוכים / מציאת זיווג','Blessing for Children':'ברכה לילדים',
  'Parnassah / Livelihood':'פרנסה','Hatzlacha / Success':'הצלחה','Shmira / Protection':'שמירה / הגנה','Yeshuot':'ישועות',
  'Successful Surgery':'ניתוח מוצלח','All the Brachot of the Torah':'כל ברכות התורה','Happy Birthday':'יום הולדת שמח','Happy Anniversary':'יום נישואין שמח','Mazal Tov':'מזל טוב','Thank You':'תודה'
};

const SPONSOR_NAME_COPY_HE = {
  'Leilui Nishmat / In Memory Of':{en:'שם הנפטר/ת באנגלית',he:'שם הנפטר/ת בעברית',enPlaceholder:'הזן את שם הנפטר/ת באנגלית',hePlaceholder:'הזן את שם הנפטר/ת בעברית',helper:'לזכר: בן עם שם האב • לנקבה: בת עם שם האב'},
  'Shidduchim / Find a Soulmate':{en:'שם באנגלית + שם האם',he:'שם בעברית + שם האם',enPlaceholder:'הזן שם + שם האם',hePlaceholder:'הזן שם + שם האם בעברית',helper:'לזכר: בן • לנקבה: בת'},
  'Blessing for Children':{en:'שם/שמות באנגלית + שם האם',he:'שם/שמות בעברית + שם האם',enPlaceholder:'הזן שם/שמות + שם האם',hePlaceholder:'הזן שם/שמות + שם האם בעברית',helper:'בן/בת לפי הצורך'},
  'Refuah Shelema / Speedy Recovery':{en:'שם באנגלית + שם האם',he:'שם בעברית + שם האם',enPlaceholder:'הזן שם + שם האם',hePlaceholder:'הזן שם + שם האם בעברית',helper:'לזכר: בן • לנקבה: בת'},
  'Hatzlacha / Success':{en:'שם באנגלית + שם האם',he:'שם בעברית + שם האם',enPlaceholder:'הזן שם + שם האם',hePlaceholder:'הזן שם + שם האם בעברית',helper:'לזכר: בן • לנקבה: בת'},
  'Parnassah / Livelihood':{en:'שם באנגלית + שם האם',he:'שם בעברית + שם האם',enPlaceholder:'הזן שם + שם האם',hePlaceholder:'הזן שם + שם האם בעברית',helper:'לזכר: בן • לנקבה: בת'},
  'Shmira / Protection':{en:'שם באנגלית + שם האם',he:'שם בעברית + שם האם',enPlaceholder:'הזן שם + שם האם',hePlaceholder:'הזן שם + שם האם בעברית',helper:'לזכר: בן • לנקבה: בת'},
  'Successful Surgery':{en:'שם באנגלית + שם האם',he:'שם בעברית + שם האם',enPlaceholder:'הזן שם + שם האם',hePlaceholder:'הזן שם + שם האם בעברית',helper:'לזכר: בן • לנקבה: בת'},
  'Yeshuot':{en:'שם באנגלית + שם האם',he:'שם בעברית + שם האם',enPlaceholder:'הזן שם + שם האם',hePlaceholder:'הזן שם + שם האם בעברית',helper:'לזכר: בן • לנקבה: בת'},
  'All the Brachot of the Torah':{en:'שם באנגלית + שם האם',he:'שם בעברית + שם האם',enPlaceholder:'הזן שם + שם האם',hePlaceholder:'הזן שם + שם האם בעברית',helper:'לזכר: בן • לנקבה: בת'},
  'In Honor Of':{en:'שם באנגלית',he:'שם בעברית',enPlaceholder:'הזן שם באנגלית',hePlaceholder:'הזן שם בעברית',helper:''},
  'Happy Birthday':{en:'שם בעל/ת יום ההולדת',he:'שם בעל/ת יום ההולדת',enPlaceholder:'הזן את שם בעל/ת יום ההולדת',hePlaceholder:'הזן את שם בעל/ת יום ההולדת',helper:''},
  'Happy Anniversary':{en:'שמות בני הזוג',he:'שמות בני הזוג',enPlaceholder:'הזן את שמות בני הזוג',hePlaceholder:'הזן את שמות בני הזוג',helper:''},
  'Mazal Tov':{en:'שם/שמות + האירוע',he:'שם/שמות + האירוע',enPlaceholder:'הזן שם/שמות ואת האירוע',hePlaceholder:'הזן שם/שמות ואת האירוע',helper:''},
  'Thank You':{en:'שם',he:'שם',enPlaceholder:'הזן שם',hePlaceholder:'הזן שם',helper:''}
};

function donationDedicationOptions() {
  const hebrew=currentLanguage()==='he';
  const groups = [
    [hebrew?'לעילוי נשמת / לכבוד':'In Memory / In Honor', ['Leilui Nishmat / In Memory Of','In Honor Of','Anonymous']],
    [hebrew?'תפילות וברכות':'Tefillah & Brachos', ['Refuah Shelema / Speedy Recovery','Shidduchim / Find a Soulmate','Blessing for Children','Parnassah / Livelihood','Hatzlacha / Success','Shmira / Protection','Yeshuot','Successful Surgery','All the Brachot of the Torah']],
    [hebrew?'שמחות ואירועים מיוחדים':'Simchas & Special Occasions', ['Happy Birthday','Happy Anniversary','Mazal Tov']],
    [hebrew?'אחר':'Other', ['Thank You']]
  ];
  const placeholder=hebrew?SPONSOR_DEDICATION_HE['Select a dedication type']:'Select a dedication type';
  return `<option value="">${esc(placeholder)}</option>${groups.map(([label,items])=>`<optgroup label="${esc(label)}">${items.map(item=>`<option value="${esc(item)}" ${state.donationDraft.dedicationType===item?'selected':''}>${esc(hebrew?(SPONSOR_DEDICATION_HE[item]||item):item)}</option>`).join('')}</optgroup>`).join('')}`;
}

function sponsorNameFieldCopy(type) {
  const hebrew=currentLanguage()==='he';
  const copy={enLabel:'English Name',heLabel:'Hebrew Name',enPlaceholder:'Enter name in English',hePlaceholder:'הזן שם בעברית',helperEn:'For a male, use “ben”; for a female, use “bas.”'};
  switch(type){
    case 'Leilui Nishmat / In Memory Of': Object.assign(copy,{enLabel:'English Name of the Niftar/Nifteres',heLabel:'Hebrew Name of the Niftar/Nifteres',enPlaceholder:'Enter the niftar/nifteres name in English',hePlaceholder:'הזן את שם הנפטר/ת בעברית',helperEn:'For a male, use “ben” with his father’s name; for a female, use “bas” with her father’s name.'}); break;
    case 'Shidduchim / Find a Soulmate': Object.assign(copy,{enLabel:'English Name + Mother’s Name',heLabel:'Hebrew Name + Mother’s Hebrew Name',enPlaceholder:'Enter the name and mother’s name',hePlaceholder:'הזן שם + שם האם בעברית',helperEn:'For a male, use “ben”; for a female, use “bas.”'}); break;
    case 'Blessing for Children': Object.assign(copy,{enLabel:'English Name(s) + Mother’s Name',heLabel:'Hebrew Name(s) + Mother’s Hebrew Name',enPlaceholder:'Enter the name(s) and mother’s name',hePlaceholder:'הזן שם/שמות + שם האם בעברית',helperEn:'Use “ben” or “bas” as appropriate.'}); break;
    case 'Refuah Shelema / Speedy Recovery': case 'Hatzlacha / Success': case 'Parnassah / Livelihood': case 'Shmira / Protection': case 'Successful Surgery': case 'Yeshuot': case 'All the Brachot of the Torah': Object.assign(copy,{enLabel:'English Name + Mother’s Name',heLabel:'Hebrew Name + Mother’s Hebrew Name',enPlaceholder:'Enter the name and mother’s name',hePlaceholder:'הזן שם + שם האם בעברית',helperEn:'For a male, use “ben”; for a female, use “bas.”'}); break;
    case 'In Honor Of': Object.assign(copy,{enLabel:'Name in English',heLabel:'Name in Hebrew',enPlaceholder:'Enter name in English',hePlaceholder:'הזן שם בעברית',helperEn:''}); break;
    case 'Happy Birthday': Object.assign(copy,{enLabel:'Birthday Celebrant’s Name',heLabel:'שם בעל/ת יום ההולדת',enPlaceholder:'Enter the birthday celebrant’s name',hePlaceholder:'הזן את שם בעל/ת יום ההולדת',helperEn:''}); break;
    case 'Happy Anniversary': Object.assign(copy,{enLabel:'Couple’s Names',heLabel:'שמות בני הזוג',enPlaceholder:'Enter the couple’s names',hePlaceholder:'הזן את שמות בני הזוג',helperEn:''}); break;
    case 'Mazal Tov': Object.assign(copy,{enLabel:'Name(s) + Occasion',heLabel:'שם/שמות + האירוע',enPlaceholder:'Enter the name(s) and occasion',hePlaceholder:'הזן שם/שמות ואת האירוע',helperEn:''}); break;
    case 'Thank You': Object.assign(copy,{enLabel:'Name',heLabel:'שם',enPlaceholder:'Enter name',hePlaceholder:'הזן שם',helperEn:''}); break;
  }
  const hc=SPONSOR_NAME_COPY_HE[type]||{en:'שם באנגלית',he:'שם בעברית',enPlaceholder:'הזן שם באנגלית',hePlaceholder:'הזן שם בעברית',helper:'לזכר: בן • לנקבה: בת'};
  return hebrew?{enLabel:hc.en,heLabel:hc.he,enPlaceholder:hc.enPlaceholder,hePlaceholder:hc.hePlaceholder,helper:hc.helper}:{enLabel:copy.enLabel,heLabel:copy.heLabel,enPlaceholder:copy.enPlaceholder,hePlaceholder:copy.hePlaceholder,helper:copy.helperEn};
}

function donationTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function ensureDonationDraft() {
  if (!state.donationDraft.sponsorStartDate) state.donationDraft.sponsorStartDate = donationTodayIso();
  if (!state.donationDraft.email && state.user?.email) state.donationDraft.email = String(state.user.email);
  if (!state.donationDraft.name && state.user?.name) state.donationDraft.name = String(state.user.name);
  if (!(Number(state.donationDraft.billingDay)>=1 && Number(state.donationDraft.billingDay)<=31)) state.donationDraft.billingDay = new Date().getDate();
}

function sponsorEndIso(start, plan) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start||''))) return '';
  const date = new Date(`${start}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  if (plan === 'week') date.setUTCDate(date.getUTCDate()+6);
  if (plan === 'month') {
    const day=date.getUTCDate(); const y=date.getUTCFullYear(); const m=date.getUTCMonth()+1;
    const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
    date.setTime(Date.UTC(y,m,Math.min(day,last))); date.setUTCDate(date.getUTCDate()-1);
  }
  return date.toISOString().slice(0,10);
}

function hebrewNumber(value, year=false) {
  let number=Math.floor(Number(value)||0); if(year&&number>=5000) number%=1000; if(number<=0)return '';
  if(number===15)return 'ט״ו'; if(number===16)return 'ט״ז';
  const letters=[[400,'ת'],[300,'ש'],[200,'ר'],[100,'ק'],[90,'צ'],[80,'פ'],[70,'ע'],[60,'ס'],[50,'נ'],[40,'מ'],[30,'ל'],[20,'כ'],[10,'י'],[9,'ט'],[8,'ח'],[7,'ז'],[6,'ו'],[5,'ה'],[4,'ד'],[3,'ג'],[2,'ב'],[1,'א']];
  const out=[]; for(const [amount,letter] of letters){while(number>=amount){out.push(letter);number-=amount;}}
  if(out.length===1)return `${out[0]}׳`; return `${out.slice(0,-1).join('')}״${out[out.length-1]}`;
}

let sponsorHebrewDateFormatter = null;
const sponsorGregorianDateFormatters = new Map();

function getSponsorHebrewDateFormatter() {
  if (sponsorHebrewDateFormatter) return sponsorHebrewDateFormatter;
  sponsorHebrewDateFormatter = new Intl.DateTimeFormat('he-u-ca-hebrew',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'});
  return sponsorHebrewDateFormatter;
}

function getSponsorGregorianDateFormatter() {
  const locale=currentLanguage()==='he'?'he-IL':'en-US';
  if (!sponsorGregorianDateFormatters.has(locale)) {
    sponsorGregorianDateFormatters.set(locale,new Intl.DateTimeFormat(locale,{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}));
  }
  return sponsorGregorianDateFormatters.get(locale);
}

function hebrewDateParts(date) {
  try {
    const parts=getSponsorHebrewDateFormatter().formatToParts(date);
    const day=parts.find(part=>part.type==='day')?.value; const month=String(parts.find(part=>part.type==='month')?.value||'').replace(/^ב(?=\S)/,''); const year=parts.find(part=>part.type==='year')?.value;
    if(!day||!month||!year)return null; return {day:hebrewNumber(day),month,year:hebrewNumber(year,true)};
  } catch (_) { return null; }
}

function hebrewDateForIso(iso) {
  const d=new Date(`${iso}T12:00:00Z`); if(Number.isNaN(d.getTime()))return '';
  const parts=hebrewDateParts(d); return parts?`${parts.day} ${parts.month} ${parts.year}`:'';
}

function gregorianDateLabel(iso) {
  const d=new Date(`${iso}T12:00:00Z`); if(Number.isNaN(d.getTime()))return '';
  try { return getSponsorGregorianDateFormatter().format(d); }
  catch (_) { return d.toLocaleDateString(currentLanguage()==='he'?'he-IL':'en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}); }
}

function sponsorHebrewDateOptions(selectedIso) {
  const current=selectedIso||donationTodayIso(); const base=new Date(`${current}T12:00:00Z`); if(Number.isNaN(base.getTime()))return '';
  const options=[];
  for(let offset=-365;offset<=1095;offset++){
    const d=new Date(base); d.setUTCDate(d.getUTCDate()+offset); const iso=d.toISOString().slice(0,10);
    options.push(`<option value="${iso}" ${iso===current?'selected':''}>${esc(hebrewDateForIso(iso)||iso)} — ${esc(gregorianDateLabel(iso))}</option>`);
  }
  return options.join('');
}

function ordinalDay(day) {
  const n=Number(day)||0; const mod100=n%100; const suffix=mod100>=11&&mod100<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th'); return `${n}${suffix}`;
}

async function loadSponsorPrices(force=false) {
  if (state.sponsorPricesLoading || (state.sponsorPricesLoaded && !force)) return;
  state.sponsorPricesLoading = true;
  try {
    const data = await publicJson('/sponsor-prices');
    const prices=data?.prices||{};
    state.sponsorPrices={
      day:Math.round(Number(prices.dayAmountCents ?? Number(prices.day)*100))||10000,
      week:Math.round(Number(prices.weekAmountCents ?? Number(prices.week)*100))||50000,
      month:Math.round(Number(prices.monthAmountCents ?? Number(prices.month)*100))||200000
    };
    state.sponsorPricesLoaded=true;
  } catch (_) { state.sponsorPricesLoaded=true; }
  finally { state.sponsorPricesLoading=false; if(state.screen==='donate') refreshDonationProviderPanelFast(); }
}

function saveDonationDraftFromDom() {
  const d=state.donationDraft;
  const val=id=>document.getElementById(id)?.value;
  if (val('donationAmount') != null) d.amount=val('donationAmount');
  if (val('donationName') != null) d.name=val('donationName');
  if (val('donationEmail') != null) d.email=val('donationEmail');
  if (val('donationPhone') != null) d.phone=val('donationPhone');
  if (val('donationNote') != null) d.note=val('donationNote');
  if (val('donationTermMonths') != null) d.termMonths=Number(val('donationTermMonths'))||12;
  if (val('donationBillingDay') != null) d.billingDay=Number(val('donationBillingDay'))||new Date().getDate();
  if (val('sponsorStartDate') != null) d.sponsorStartDate=val('sponsorStartDate');
  if (val('sponsorDedication') != null) d.dedicationType=val('sponsorDedication');
  if (val('sponsorNameEn') != null) d.nameEn=val('sponsorNameEn');
  if (val('sponsorNameHe') != null) d.nameHe=val('sponsorNameHe');
}

function closeDonationCheckout(renderNow=true) {
  try { state.donationPaymentElement?.unmount?.(); } catch (_) {}
  state.donationPaymentElement=null; state.donationCheckout=null; state.donationCheckoutActions=null;
  state.donationCheckoutBusy=false; state.donationCheckoutMessage=''; state.donationCheckoutSessionId=''; state.donationPaymentStage=false;
  if (renderNow) render();
}

function setDonationCheckoutMessage(message,error=false) {
  state.donationCheckoutMessage=String(message||'');
  const node=document.getElementById('donationCheckoutMessage');
  if(node){node.textContent=state.donationCheckoutMessage;node.className=`donation-checkout-message${error?' error':''}`;}
}

function donationSponsorSummary() {
  const d=state.donationDraft; const end=sponsorEndIso(d.sponsorStartDate,d.sponsorPlan); const heStart=hebrewDateForIso(d.sponsorStartDate); const heEnd=end?hebrewDateForIso(end):'';
  if(!d.sponsorStartDate)return '';
  const prefix=d.sponsorPlan==='day'?(currentLanguage()==='he'?'תאריך ההקדשה:':'Sponsorship Date:'):(currentLanguage()==='he'?'תקופת ההקדשה:':'Sponsorship Period:');
  const greg=d.sponsorPlan==='day'?gregorianDateLabel(d.sponsorStartDate):`${gregorianDateLabel(d.sponsorStartDate)} – ${gregorianDateLabel(end)}`;
  const he=d.sponsorPlan==='day'?heStart:(heEnd&&heEnd!==heStart?`${heStart} – ${heEnd}`:heStart);
  return `${prefix} ${greg}${he?` • ${he}`:''}`;
}

function donationRecurringChargeDate(day, fromDate = new Date()) {
  const selected = Math.max(1, Math.min(31, Number(day) || 1));
  const y = fromDate.getFullYear();
  const m = fromDate.getMonth();
  const make = (year, month) => {
    const last = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(selected, last), 12, 0, 0, 0);
  };
  let target = make(y, m);
  const today = new Date(y, m, fromDate.getDate(), 0, 0, 0, 0);
  if (target < today) target = make(y, m + 1);
  return target;
}

function donationRecurringSummaryHtml() {
  if (state.donationMode === 'sponsor' || state.donationFrequency !== 'monthly') return '';
  const d = state.donationDraft;
  const hebrew = currentLanguage() === 'he';
  const amount = Math.max(0, Number(d.amount) || 0);
  const day = Math.max(1, Math.min(31, Math.floor(Number(d.billingDay) || new Date().getDate())));
  const fixed = state.donationTermType === 'fixed';
  const months = fixed ? Math.max(2, Math.min(120, Math.floor(Number(d.termMonths) || 12))) : 0;
  const first = donationRecurringChargeDate(day);
  const firstText = first.toLocaleDateString(hebrew ? 'he-IL' : 'en-US', { year:'numeric', month:'long', day:'numeric' });
  const monthly = money(Math.round(amount * 100));
  const total = fixed ? money(Math.round(amount * 100 * months)) : '';
  const shortMonth = day > 28
    ? (hebrew ? ` אם בחודש מסוים אין יום ${day}, Stripe תחייב ביום האחרון הזמין באותו חודש.` : ` If a month has fewer than ${day} days, Stripe charges on the last available day of that month.`)
    : '';
  return hebrew
    ? `<strong>${esc(monthly)} לחודש</strong> • חיוב ראשון: ${esc(firstText)} • ${fixed ? `${months} חיובים • סך מתוכנן: ${esc(total)}` : 'עד לביטול'}.${esc(shortMonth)}`
    : `<strong>${esc(monthly)} per month</strong> • First charge: ${esc(firstText)} • ${fixed ? `${months} charges • Scheduled total: ${esc(total)}` : 'Until canceled'}.${esc(shortMonth)}`;
}

function refreshDonationRecurringSummaryInPlace() {
  saveDonationDraftFromDom();
  const node = document.getElementById('donationRecurringSummary');
  if (node) node.innerHTML = donationRecurringSummaryHtml();
}

function donationStripeSetupHtml() {
  ensureDonationDraft();
  const d=state.donationDraft; const sponsor=state.donationMode==='sponsor';
  const monthly=state.donationFrequency==='monthly'; const fixed=state.donationTermType==='fixed';
  const planPrice=state.sponsorPrices[d.sponsorPlan]||0; const hebrew=currentLanguage()==='he';
  if(state.donationPaymentStage){
    return `<div class="donation-payment-stage"><div class="payment-frame-header-app"><div><h2>${hebrew?'כרטיס אשראי מאובטח':'Secure Credit Card'}</h2><p>${hebrew?'בצעו תרומה מאובטחת באמצעות Stripe דרך אירגון שיעורי תורה.':'Make a secure donation with Stripe through Irgun Shiurai Torah.'}</p></div><strong class="stripe-wordmark">Stripe</strong></div><div class="donation-payment-summary"><strong>${sponsor?(hebrew?'הקדשת לימוד התורה':'Torah Learning Sponsorship'):(hebrew?'תרומה לאירגון':'Donation to Irgun')}</strong><span>${sponsor?money(planPrice):money(Math.round(Number(d.amount||0)*100))}</span></div><div id="donationStripeElement" class="paid-stripe-element donation-stripe-element"></div><div id="donationCheckoutMessage" class="donation-checkout-message">${esc(state.donationCheckoutMessage||tr('Preparing secure payment...'))}</div><button id="donationPayButton" class="stripe-inapp-primary" disabled>${hebrew?'תרמו באופן מאובטח':'Donate securely'}</button><button class="stripe-inapp-secondary" data-donation-back="1">${hebrew?'שינוי הסכום או הפרטים':'Change amount or details'}</button><small>${hebrew?'התשלום מעובד בצורה מאובטחת על ידי Stripe. אירגון אינו מקבל את מספר הכרטיס המלא שלכם.':'Payment is processed securely by Stripe. Irgun does not receive your full card number.'}</small></div>`;
  }
  const nameCopy=sponsorNameFieldCopy(d.dedicationType);
  const billingOptions=Array.from({length:31},(_,i)=>i+1).map(day=>`<option value="${day}" ${Number(d.billingDay)===day?'selected':''}>${hebrew?`ה־${day} בכל חודש`:`${ordinalDay(day)} of Each Month`}</option>`).join('');
  return `<div class="payment-frame-header-app"><div><h2>${hebrew?'כרטיס אשראי מאובטח':'Secure Credit Card'}</h2><p>${hebrew?'בצעו תרומה מאובטחת באמצעות Stripe דרך אירגון שיעורי תורה.':'Make a secure donation with Stripe through Irgun Shiurai Torah.'}</p></div><strong class="stripe-wordmark">Stripe</strong></div><form id="donationStripeForm" class="donation-stripe-form">
    <div class="donation-mode-tabs"><button type="button" data-donation-mode="donation" class="${!sponsor?'active':''}">${hebrew?'תרומה כללית':'General Donation'}</button><button type="button" data-donation-mode="sponsor" class="${sponsor?'active':''}">${hebrew?'הקדשת לימוד התורה':'Sponsor Online Learning'}</button></div>
    ${sponsor ? `<div class="sponsor-form-block"><h3>${hebrew?'הקדשת לימוד התורה':'Sponsor Online Learning'}</h3><p>${hebrew?'בחרו יום, שבוע או חודש להקדשת לימוד התורה. ההקדשה תיבדק לפני שתופיע ברצועת ההקדשות.':'Choose a day, week, or month to sponsor Irgun’s online Torah learning. Your dedication will be reviewed before appearing in the sponsorship ribbon.'}</p><div class="sponsor-plan-grid">${[['day',hebrew?'הקדשה ליום אחד':'Sponsor One Day'],['week',hebrew?'הקדשה לשבוע אחד':'Sponsor One Week'],['month',hebrew?'הקדשה לחודש אחד':'Sponsor One Month']].map(([key,label])=>`<button type="button" data-donation-plan="${key}" class="${d.sponsorPlan===key?'active':''}"><strong>${money(state.sponsorPrices[key])}</strong><span>${label}</span></button>`).join('')}</div><div class="sponsor-date-fields-app"><label>${hebrew?'תאריך לועזי':'Gregorian Date'}<input id="sponsorStartDate" type="date" value="${esc(d.sponsorStartDate)}" required></label><label>${hebrew?'תאריך עברי':'Hebrew Date'}<select id="sponsorJewishDate">${sponsorHebrewDateOptions(d.sponsorStartDate)}</select></label></div><div class="sponsor-date-summary">${esc(donationSponsorSummary())}</div><label>${hebrew?'סוג ההקדשה':'Dedication Type'}<select id="sponsorDedication" required>${donationDedicationOptions()}</select></label>${d.dedicationType==='Anonymous'?'':`<div class="donor-grid sponsor-name-fields"><label><span>${esc(nameCopy.enLabel)}</span><input id="sponsorNameEn" maxlength="180" value="${esc(d.nameEn)}" placeholder="${esc(nameCopy.enPlaceholder)}"></label><label><span>${esc(nameCopy.heLabel)}</span><input id="sponsorNameHe" dir="rtl" maxlength="180" value="${esc(d.nameHe)}" placeholder="${esc(nameCopy.hePlaceholder)}">${nameCopy.helper?`<small>${esc(nameCopy.helper)}</small>`:''}</label></div>`}</div>` : `<div class="donation-frequency-block"><span>${hebrew?'תדירות התרומה':'Donation Frequency'}</span><div class="donation-mode-tabs compact"><button type="button" data-donation-frequency="one_time" class="${!monthly?'active':''}">${hebrew?'תרומה חד-פעמית':'One-Time Donation'}</button><button type="button" data-donation-frequency="monthly" class="${monthly?'active':''}">${hebrew?'תרומה חודשית':'Monthly Donation'}${hebrew?' <small>חוזרת</small>':' <small>Recurring</small>'}</button></div><div class="stripe-frequency-note">${monthly?(hebrew?'תרומה חודשית חוזרת.':'Make a recurring monthly donation.'):(hebrew?'תרומה חד-פעמית.':'Make a one-time donation.')}</div>${monthly?`<div class="monthly-options"><span>${hebrew?'לכמה זמן תרצו להמשיך את התרומה החודשית?':'How long would you like your monthly donation to continue?'}</span><div class="donation-mode-tabs compact"><button type="button" data-donation-term="ongoing" class="${!fixed?'active':''}">${hebrew?'עד שאבטל':'Until I Cancel'}</button><button type="button" data-donation-term="fixed" class="${fixed?'active':''}">${hebrew?'למספר חודשים מוגדר':'For a Set Number of Months'}</button></div>${fixed?`<label>${hebrew?'מספר חודשים':'Number of Months'}<div class="months-inline"><input id="donationTermMonths" type="number" min="2" max="120" value="${esc(d.termMonths)}" required><span>${hebrew?'חודשים':'months'}</span></div><small>${hebrew?'בחרו בין 2 ל־120 חודשים. עבור חודש אחד, בחרו בתרומה חד-פעמית.':'Choose from 2 to 120 months. For one month, use a one-time donation.'}</small></label>`:''}<label>${hebrew?'תאריך החיוב החודשי':'Monthly Charge Date'}<select id="donationBillingDay">${billingOptions}</select><small>${hebrew?`התרומה תחויב בתאריך זה בכל חודש. אם התאריך כבר עבר החודש, החיוב החודשי הראשון יתחיל בחודש הבא.${Number(d.billingDay)>28?' בחודשים קצרים Stripe תחייב ביום האחרון הזמין.':''}`:`Your donation will be charged on this date each month. If that date has already passed this month, your first monthly charge will begin next month.${Number(d.billingDay)>28?' For shorter months, Stripe uses the last available day.':''}`}</small></label><div id="donationRecurringSummary" class="recurring-disclosure recurring-summary-app">${donationRecurringSummaryHtml()}</div></div>`:''}</div><label>${hebrew?'סכום התרומה':'Donation Amount'}</label><div class="donation-amount-presets">${[18,36,72,180].map(amount=>`<button type="button" data-donation-amount="${amount}" class="${Number(d.amount)===amount?'active':''}">$${amount}</button>`).join('')}<button type="button" data-donation-amount="other" class="${![18,36,72,180].includes(Number(d.amount))?'active':''}">${hebrew?'אחר':'Other'}</button></div><label class="money-field"><span>$</span><input id="donationAmount" type="number" min="1" max="50000" step="0.01" value="${esc(d.amount)}" placeholder="${hebrew?'כל סכום':'Any amount'}" required></label>`}
    <div class="donor-grid"><label>${hebrew?'שם מלא':'Full Name'}<input id="donationName" autocomplete="name" maxlength="160" required value="${esc(d.name)}" placeholder="${hebrew?'שם מלא':'Full name'}"></label><label>${hebrew?'אימייל':'Email'}<input id="donationEmail" autocomplete="email" type="email" required value="${esc(d.email)}" placeholder="you@example.com"></label><label>${hebrew?'טלפון (לא חובה)':'Phone (optional)'}<input id="donationPhone" autocomplete="tel" type="tel" maxlength="50" value="${esc(d.phone||'')}" placeholder="${hebrew?'לא חובה':'Optional'}"></label></div>
    <label class="donation-note-field">${hebrew?'הערה / תיאור (לא חובה)':'Note / Description (optional)'}<textarea id="donationNote" maxlength="1200" rows="3" placeholder="${hebrew?'הערה אופציונלית על התרומה':'Optional note for the donation'}">${esc(d.note||'')}</textarea></label>
    ${monthly?`<div class="recurring-disclosure">${fixed?(hebrew?`התרומה תחויב אוטומטית בכל חודש במשך ${Number(d.termMonths)||12} חודשים ולאחר מכן תיפסק אוטומטית.`:`Monthly donations are charged automatically for ${Number(d.termMonths)||12} months and then stop automatically.`):(hebrew?'תרומות חודשיות מחויבות אוטומטית בכל חודש עד לביטול.':'Monthly donations are charged automatically every month until canceled.')} ${state.user?(hebrew?'ניתן לנהל ולבטל את התרומה מתוך החשבון שלי.':'You can manage and cancel this recurring donation from My Account.'):(hebrew?'התחברו לפני התרומה כדי לנהל ולבטל אותה מתוך החשבון שלי.':'Sign in before donating to manage and cancel this recurring donation from My Account.')}</div>`:''}
    <button class="stripe-inapp-primary" type="submit">${hebrew?'המשך לתשלום מאובטח':'Continue to Secure Payment'}</button><div id="donationSetupMessage" class="donation-checkout-message"></div>
  </form>`;
}

function donationProviderPanelHtml() {
  const provider=state.donationProvider;
  if(provider==='stripe') return donationStripeSetupHtml();
  if(provider==='mail') return `<div class="mail-donation-card"><h2>Mail Donations</h2><p><strong>Irgun Shiurai Torah</strong><br>1235 47th St<br>Brooklyn, NY 11219<br><br><strong>Tax ID / EIN:</strong> 11-3407360</p></div>`;
  const url=DONATION_PROVIDER_URLS[provider];
  if(url) return `<div class="donate-card inapp-provider-frame"><div class="provider-frame-head"><strong>${provider==='card'?'Secure Credit Card':provider==='donorsfund'?'The Donors’ Fund':'Matbia'}</strong><button data-donation-open-external="${esc(provider)}">Open Full Page ↗</button></div><iframe class="donate-frame" src="${esc(url)}" title="Secure donation provider" allow="payment *; clipboard-write"></iframe></div>`;
  return '';
}

function donateHtml() {
  ensureDonationDraft();
  const hebrew=currentLanguage()==='he';
  return `<div class="page-title pro-page-title"><span class="page-kicker">SUPPORT TORAH</span><h1>${hebrew?'תמכו באירגון שיעורי תורה':'Support Irgun Shiurai Torah'}</h1><p>${hebrew?'תמיכתכם מסייעת לנו להמשיך להביא שיעורי תורה, שידורים חיים והקלטות ליהודים ברחבי העולם.':'Your support helps us continue bringing Torah shiurim, live broadcasts and recordings to Jews around the world.'}</p></div>
    ${state.donationSuccess?`<div class="donation-success-banner">${esc(state.donationSuccess)}</div>`:''}
    <section class="donation-primary-method-app"><button data-donation-provider="stripe" class="${state.donationProvider==='stripe'?'active':''}"><strong>${hebrew?'תרומה בכרטיס':'Donate by Card'}</strong><small>Stripe</small></button></section>
    <section id="donationProviderPanel" class="donation-provider-panel-app">${donationProviderPanelHtml()}</section>
    <details class="alternate-payment app-other-payment-methods"><summary>${hebrew?'אפשרויות תשלום נוספות':'Other payment methods'}</summary><div class="donation-provider-grid"><button data-donation-provider="card" class="${state.donationProvider==='card'?'active':''}"><strong>Cardknox</strong><small>${hebrew?'כרטיס אשראי מאובטח':'Secure Credit Card'}</small></button><button data-donation-open-external="paypal"><strong>PayPal</strong><small>${hebrew?'נפתח בחלון חיצוני':'Opens PayPal ↗'}</small></button><button data-donation-open-external="ojc"><strong>OJC Card</strong><small>${hebrew?'נפתח בחלון חיצוני':'Opens OJC ↗'}</small></button><button data-donation-provider="donorsfund" class="${state.donationProvider==='donorsfund'?'active':''}"><strong>The Donors’ Fund</strong></button><button data-donation-provider="matbia" class="${state.donationProvider==='matbia'?'active':''}"><strong>Matbia</strong></button><button data-donation-provider="mail" class="${state.donationProvider==='mail'?'active':''}"><strong>${hebrew?'תרומה בדואר':'Mail Donation'}</strong></button></div></details>`;
}

async function prepareDonationCheckout(event) {
  event?.preventDefault(); saveDonationDraftFromDom(); ensureDonationDraft();
  const d=state.donationDraft; const sponsor=state.donationMode==='sponsor';
  let amountCents=Math.round(Number(d.amount)*100);
  if(sponsor) amountCents=Number(state.sponsorPrices[d.sponsorPlan])||0;
  if(!sponsor && (!Number.isInteger(amountCents)||amountCents<100||amountCents>5000000)){ setDonationSetupMessage('Enter a donation between $1 and $50,000.',true); return; }
  if(!/^\S+@\S+\.\S+$/.test(String(d.email||'').trim())){ setDonationSetupMessage('Enter a valid email address.',true); return; }
  if(state.donationFrequency==='monthly' && state.donationTermType==='fixed' && !(Number(d.termMonths)>=2&&Number(d.termMonths)<=120)){ setDonationSetupMessage('Choose between 2 and 120 months.',true); return; }
  if(sponsor){
    if(!d.sponsorStartDate||!SPONSOR_DEDICATION_TYPES.includes(d.dedicationType)){ setDonationSetupMessage('Choose a sponsorship date and dedication type.',true); return; }
    if(d.dedicationType!=='Anonymous'&&!String(d.nameEn||'').trim()&&!String(d.nameHe||'').trim()){ setDonationSetupMessage('Enter the dedication name in English or Hebrew.',true); return; }
  }
  const body={amountCents,email:String(d.email).trim(),name:String(d.name||'').trim(),phone:String(d.phone||'').trim(),note:String(d.note||'').trim().slice(0,1200),frequency:sponsor?'one_time':state.donationFrequency};
  if(!sponsor && state.donationFrequency==='monthly') Object.assign(body,{termType:state.donationTermType,termMonths:state.donationTermType==='fixed'?Number(d.termMonths):0,billingDay:Number(d.billingDay)});
  if(sponsor) body.sponsor={plan:d.sponsorPlan,startDate:d.sponsorStartDate,hebrewDate:hebrewDateForIso(d.sponsorStartDate),dedicationType:d.dedicationType,nameEn:d.nameEn,nameHe:d.nameHe,donorName:d.name,donorEmail:d.email,donorPhone:d.phone,note:d.note};
  state.donationPaymentStage=true; state.donationCheckoutBusy=true; state.donationCheckoutMessage='Preparing secure payment...'; state.donationSuccess=''; render();
  try{
    const data=await apiJson('/stripe/donation-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!window.Stripe)throw new Error('Secure Stripe payment form could not load.');
    state.donationCheckoutSessionId=String(data.sessionId||'');
    const stripe=window.Stripe(data.publishableKey,{locale:currentLanguage()==='he'?'he':'en'});
    const checkout=stripe.initCheckoutElementsSdk({clientSecret:data.clientSecret,elementsOptions:{appearance:{theme:'stripe',variables:{colorPrimary:'#9b7438',colorText:'#0f1f35',borderRadius:'12px',fontFamily:'Arial, sans-serif'}}}});
    state.donationCheckout=checkout;
    checkout.on('change',session=>{const button=document.getElementById('donationPayButton');if(button){button.disabled=!session.canConfirm;const liveAmount=Number(session?.total?.total?.amount)||amountCents;button.textContent=`Pay ${money(liveAmount)} securely`;}});
    const payment=checkout.createPaymentElement();state.donationPaymentElement=payment;payment.mount('#donationStripeElement');
    const actionsResult=await checkout.loadActions();if(actionsResult.type==='error')throw new Error(actionsResult.error?.message||'Could not load secure payment.');
    state.donationCheckoutActions=actionsResult.actions;state.donationCheckoutBusy=false;setDonationCheckoutMessage('');
  }catch(error){state.donationCheckoutBusy=false;setDonationCheckoutMessage(error?.message||'Could not start secure payment.',true);}
}

function setDonationSetupMessage(message,error=false){const node=document.getElementById('donationSetupMessage');if(node){node.textContent=message||'';node.className=`donation-checkout-message${error?' error':''}`;}}

async function confirmDonationCheckout(){
  if(!state.donationCheckoutActions||state.donationCheckoutBusy)return;state.donationCheckoutBusy=true;const button=document.getElementById('donationPayButton');if(button)button.disabled=true;setDonationCheckoutMessage('Processing secure payment...');
  try{const result=await state.donationCheckoutActions.confirm();if(result?.type==='error'){state.donationCheckoutBusy=false;setDonationCheckoutMessage(result.error?.message||'Payment could not be completed.',true);if(button)button.disabled=false;}else if(state.donationCheckoutSessionId){setTimeout(()=>verifyDonationCheckout(state.donationCheckoutSessionId),1200);}}
  catch(error){state.donationCheckoutBusy=false;setDonationCheckoutMessage(error?.message||'Payment could not be completed.',true);if(button)button.disabled=false;}
}

async function verifyDonationCheckout(sessionId){
  try{const data=await apiJson(`/stripe/session-status?session_id=${encodeURIComponent(sessionId)}`);if(data.paymentStatus==='paid'){const wasSponsor=state.donationMode==='sponsor';closeDonationCheckout(false);state.donationSuccess=wasSponsor?'Thank you. Your sponsorship payment was received and is waiting for administrator approval.':'Thank you. Your donation was received successfully.';state.recurringLoaded=false;setToast('Thank you. Your donation was received.');render();}}
  catch(_){}
}

async function openPaidAttachment(productId, fileId, download=false) {
  const product=state.paidCatalog.find(item=>String(item.id)===String(productId));
  const file=(product?.attachments||[]).find(item=>String(item.id)===String(fileId));
  if(!file)return setToast('PDF is not available.');
  const sourceUrl=apiUrl(download?(file.downloadUrl||file.url):file.url);
  const filename=String(file.fileName||`${file.title||'Irgun-material'}.pdf`).replace(/[\\/:*?"<>|]+/g,'_');
  try {
    setToast(download?'Preparing PDF download...':'Opening PDF...');
    if(Capacitor.getPlatform()==='android'){
      if(download){
        await initNativeDownloader();
        const id=`paid-pdf-${String(productId).replace(/[^A-Za-z0-9_-]/g,'_')}-${String(fileId).replace(/[^A-Za-z0-9_-]/g,'_')}-${Date.now()}`;
        state.downloadJobs.set(id,{id,title:file.title||filename,filename,status:'queued',percent:0});
        refreshDownloadManager();
        await IrgunDownloader.start({id,url:sourceUrl,filename,title:file.title||filename,mimeType:'application/pdf',token:state.token||'',appHeader:true});
        setToast('PDF download started.');
        return;
      }
      await IrgunDownloader.openSecureFile({url:sourceUrl,filename,title:file.title||filename,mimeType:'application/pdf',token:state.token||'',appHeader:true});
      setToast('PDF opened.');
      return;
    }
    const response=await apiFetch(download?(file.downloadUrl||file.url):file.url);
    if(!response.ok)throw new Error('PDF could not be opened.');
    const blob=await response.blob(); const blobUrl=URL.createObjectURL(blob);
    if(download){const a=document.createElement('a');a.href=blobUrl;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(blobUrl),30000);setToast('PDF download ready.');return;}
    const modal=document.createElement('div');modal.className='paid-pdf-backdrop';modal.innerHTML=`<section class="paid-pdf-modal"><div class="paid-pdf-head"><strong>${esc(file.title||file.fileName||'PDF')}</strong><button type="button" data-paid-pdf-close>×</button></div><iframe src="${esc(blobUrl)}" title="${esc(file.title||'PDF')}"></iframe></section>`;document.body.appendChild(modal);
    const close=()=>{modal.remove();URL.revokeObjectURL(blobUrl);}; modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-paid-pdf-close]'))close();});
  } catch(error){setToast(error?.message||'PDF could not be opened.');}
}

function openPaidImageViewer(productId, preferredIndex = null) {
  const product=state.paidCatalog.find(item=>String(item.id)===String(productId));
  const images=paidProductImageUrls(product||{});
  if(!images.length)return;
  const carousel=document.querySelector(`[data-paid-carousel="${CSS.escape(String(productId))}"]`);
  const track=carousel?.querySelector('.paid-cover-track');
  let index=Number.isFinite(Number(preferredIndex)) ? Number(preferredIndex) : Math.round((track?.scrollLeft||0)/Math.max(1,track?.clientWidth||1));
  index=Math.max(0,Math.min(images.length-1,index));
  const modal=document.createElement('div');
  modal.className='paid-image-backdrop';
  modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
  const draw=()=>{modal.innerHTML=`<section class="paid-image-modal"><div class="paid-image-head"><strong>${esc(paidProductTitle(product,'Album picture'))}</strong><button type="button" data-paid-image-close aria-label="Close">×</button></div><div class="paid-image-stage">${images.length>1?'<button type="button" class="paid-image-prev" data-paid-image-prev aria-label="Previous picture">‹</button>':''}<img src="${esc(images[index])}" alt="${esc(paidProductTitle(product,'Album picture'))} ${index+1}">${images.length>1?'<button type="button" class="paid-image-next" data-paid-image-next aria-label="Next picture">›</button>':''}</div>${images.length>1?`<div class="paid-image-counter">${index+1} / ${images.length}</div>`:''}</section>`;};
  draw(); document.body.appendChild(modal);
  modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-paid-image-close]')){modal.remove();return;}if(event.target.closest('[data-paid-image-prev]')){index=(index-1+images.length)%images.length;draw();}if(event.target.closest('[data-paid-image-next]')){index=(index+1)%images.length;draw();}});
}

function contactHtml() {
  return `<div class="page-title"><h1>Contact Irgun Shiurai Torah</h1><p>Send us a message and we will get back to you.</p></div>
    <div class="account-card contact-card"><form id="contactForm" class="form-stack">
      <label>Name<input id="contactName" required value="${esc(state.user && state.user.name || '')}"></label>
      <label>Email<input id="contactEmail" type="email" required value="${esc(state.user && state.user.email || '')}"></label>
      <label>Phone Number<input id="contactPhone" type="tel"></label>
      <label>Subject<input id="contactSubject" required></label>
      <label>Message<textarea id="contactMessage" required></textarea></label>
      <button class="form-submit" id="contactSubmit" type="submit">Send Message</button>
      <div id="contactResult" class="contact-result"></div>
    </form></div>`;
}

function shiurimHtml() {
  if (!state.libraryReady) return `<div class="page-title"><h1>Torah Shiurim Library</h1><p>Loading library...</p></div><div class="loading">Loading shiurim...</div>`;
  const filtered = filteredLibraryItems();
  return `<div class="page-title"><h1>Torah Shiurim Library</h1><p>${state.videos.length} videos - ${state.audioItems.length} audio recordings</p></div>
    <div class="toolbar-card">
      <div class="segmented large">
        ${['all', 'video', 'audio'].map(mode => `<button data-library-mode="${mode}" class="${state.libraryMode === mode ? 'active' : ''}">${mode === 'all' ? 'All' : mode[0].toUpperCase() + mode.slice(1)}</button>`).join('')}
      </div>
      <div class="library-search"><input id="librarySearch" type="search" value="${esc(state.libraryQuery)}" placeholder="${currentLanguage()==='he'?'חיפוש כותרת, מרצה או קוד שיעור…':'Search title, speaker or lecture code…'}" autocomplete="off" autocapitalize="off" spellcheck="false"><select id="librarySearchMode" aria-label="Search mode"><option value="catalog" ${state.librarySearchMode === 'catalog' ? 'selected' : ''}>${currentLanguage()==='he'?'כותרת':'Title'}</option><option value="content" ${state.librarySearchMode === 'content' ? 'selected' : ''}>${currentLanguage()==='he'?'תוכן השיעור':'Shiur Content'}</option></select></div><div id="librarySearchAssist">${searchAssistHtml()}</div>${activeFilterChipsHtml()}
      <button class="library-filter-toggle ${state.filterPanelOpen ? 'open' : ''}" data-toggle-library-filters="1" aria-expanded="${state.filterPanelOpen ? 'true' : 'false'}"><span class="library-filter-toggle-label"><i class="fa-solid fa-sliders" aria-hidden="true"></i><span>Filters</span></span></button>
      <div class="library-filter-panel ${state.filterPanelOpen ? 'open' : ''}">
        ${sortChoiceHtml()}
        <div class="filter-grid modern-filters">
          ${filterButton('location', 'Locations')}
          ${filterButton('year', 'Years')}
          ${filterButton('language', 'Languages')}
          ${filterButton('speaker', 'Speakers')}
          ${filterButton('topic', 'Topics')}
        </div>
        <div class="filter-footer"><span id="shiurimFoundCount">Found ${filtered.length} shiurim</span><button class="text-btn" data-clear-filters="1">Clear filters</button></div>
      </div>
    </div>
    <div id="shiurimResults">${shiurimResultsHtml(filtered)}</div>`;
}

function searchHtml() {
  return shiurimHtml();
}

function libraryHtml() {
  const he = currentLanguage() === 'he';
  const localSection = state.librarySection === 'downloads';
  const feed = state.user ? followingFeed() : [];
  const follows = state.user ? [...state.follows.values()] : [];
  let items = [];
  if (state.user && state.librarySection === 'likes') items = [...state.myLikes].map(id => itemFromActionId(id)).filter(Boolean);
  else if (state.user && state.librarySection === 'later') items = [...state.watchLater].map(id => itemFromActionId(id)).filter(Boolean);
  else if (state.user && state.librarySection === 'history') items = state.history;
  const tabs = [
    ['likes',he?'אהבתי':'My Likes'],['later',he?'לשמירה':'Watch Later'],['history',he?'היסטוריה':'History'],
    ['following',he?'במעקב':'Following'],['downloads',he?'הורדות':'Downloads'],['playlists',he?'רשימות':'Playlists'],['purchased',he?'רכישות':'Purchased']
  ];
  const headerText = state.user ? (he?`מסונכרן עם ${state.user.email||'החשבון שלכם'}.`:`Synced with ${state.user.email || 'your account'}.`) : (he?'הורדות לא מקוונות נשמרות במכשיר. התחברו כדי לסנכרן רשימות, לייקים והיסטוריה.':'Offline downloads stay on this device. Sign in to sync playlists, likes, history and follows.');
  let body = '';
  if (!state.user && !localSection) body = signedOutCard();
  else if (state.librarySection === 'downloads') body = downloadsLibraryHtml();
  else if (state.librarySection === 'playlists') body = playlistLibraryHtml();
  else if (state.librarySection === 'purchased') body = `<div class="purchased-library"><div class="section-head"><div><h2>${he?'שיעורים שנרכשו':'Purchased Shiurim'}</h2><p>${he?'אוספי שמע פרטיים המחוברים לחשבון.':'Private audio collections connected to your account.'}</p></div><button class="section-link" data-nav="paid">${he?'לחנות':'Browse Store'}</button></div><div class="paid-grid">${state.paidCatalog.filter(item => item.owned).length ? state.paidCatalog.filter(item => item.owned).map(paidProductCard).join('') : `<div class="empty">${he?'אין עדיין שיעורים שנרכשו בחשבון הזה.':'You have no paid shiurim in this account yet.'}</div>`}</div></div>`;
  else if (state.librarySection === 'following') body = `<div class="account-card following-library"><h2>${he?'במעקב':'Following'}</h2>${follows.length ? `<div class="follow-chips">${follows.map(item => `<button class="follow-chip active" data-follow-type="${esc(item.type)}" data-follow-key="${esc(item.key)}" data-follow-label="${esc(item.labelEn || item.labelHe || item.key)}">${esc(item.labelEn || item.labelHe || item.key)} <span>${he?'הפסק מעקב':'Unfollow'}</span></button>`).join('')}</div>` : `<div class="empty">You are not following any speakers or topics yet.</div>`}<h2 class="subhead">${he?'חדש ממה שאתם עוקבים אחריו':'New From Speakers & Topics You Follow'}</h2><div class="list">${feed.length ? feed.map(v => compactItem({ ...v, _kind:'video' })).join('') : `<div class="empty">${he?'עקבו אחרי מרצה או נושא כדי לבנות את הפיד.':'Follow a speaker or topic from a shiur to build this feed.'}</div>`}</div></div>`;
  else body = `${state.librarySection === 'history' && state.history.length ? `<div class="history-toolbar"><button class="small-btn danger" data-clear-history="1">${he?'נקה היסטוריה':'Clear History'}</button></div>` : ''}<div class="list section">${items.length ? items.map(item => compactItem(item)).join('') : `<div class="empty">${he?'עדיין אין כאן כלום.':'Nothing here yet.'}</div>`}</div>`;
  return `<div class="page-title"><h1>${he?'הספרייה שלכם':'Your Library'}</h1><p>${esc(headerText)}</p></div><div class="segmented library-tabs library-tabs-scroll">${tabs.map(([key,label])=>`<button data-library-section="${key}" class="${state.librarySection===key?'active':''}">${label}</button>`).join('')}</div>${body}`;
}

function signedOutCard() {
  return `<div class="account-card"><h2>Sign In</h2><p>Sign in to use likes, Watch Later, history, comments and following.</p><button class="action primary" data-nav="account">Sign In</button></div>`;
}

function itemFromActionId(id) {
  const value = String(id || '');
  if (value.startsWith('audio:')) {
    const item = state.audioById.get(value.slice(6));
    return item ? { ...item, _kind: 'audio' } : null;
  }
  const item = state.videoById.get(value);
  return item ? { ...item, _kind: 'video' } : null;
}

function followingFeed() {
  if (!state.follows.size) return [];
  const speakerKeys = new Set();
  const topicKeys = new Set();
  for (const item of state.follows.values()) {
    if (item.type === 'speaker') speakerKeys.add(item.key);
    if (item.type === 'topic') topicKeys.add(item.key);
  }
  return state.videos
    .filter(v => (v._speakerIds || []).some(id => speakerKeys.has(id)) || topicKeys.has(v._topicId))
    .sort((a, b) => itemDate(b) - itemDate(a))
    .slice(0, 30);
}

function privacyHtml() {
  const hebrew = currentLanguage() === 'he';
  if (hebrew) return `<div class="page-title"><h1>מדיניות פרטיות</h1><p>כיצד אירגון שיעורי תורה מטפל במידע באפליקציה.</p></div>
    <div class="privacy-card" dir="rtl">
      <p class="privacy-updated"><strong>עודכן לאחרונה:</strong> 17 בספטמבר 2026</p>
      <p>מדיניות זו מסבירה כיצד <strong>אירגון שיעורי תורה</strong> מטפל במידע בעת שימוש באתר, באפליקציית Android או באפליקציית iOS.</p>
      <h2>מידע שאנו אוספים</h2>
      <p><strong>פרטי חשבון:</strong> שם, כתובת אימייל וסיסמה הנשמרת בצורה מוגנת כאשר נפתח חשבון.</p>
      <p><strong>פעילות בחשבון:</strong> לייקים, שמירה להמשך, היסטוריית צפייה והאזנה ומיקום המשך, מעקב אחר מגידי שיעור ונושאים, תגובות, העדפות התראות ורכישות דיגיטליות המקושרות לחשבון.</p>
      <p><strong>מידע שימושי וטכני:</strong> אירועי צפייה/האזנה, מזהה אקראי לצמצום ספירה כפולה, ולוגים רגילים של שירות ואבטחה שעשויים לכלול כתובת IP, פרטי דפדפן/אפליקציה, זמנים ושגיאות.</p>
      <h2>תרומות, תרומות חודשיות ורכישות</h2>
      <p>תרומות בכרטיס ותרומות חודשיות עשויות להיות מעובדות באמצעות <strong>Stripe</strong>. אפשרויות אחרות עשויות להשתמש ב־<strong>Cardknox</strong>, <strong>PayPal</strong>, <strong>OJC Card Payment Site</strong>, <strong>The Donors’ Fund</strong> או <strong>Matbia</strong>, לפי בחירתכם. רכישות דיגיטליות עשויות להשתמש גם במערכת הרכישות של חנות האפליקציות כאשר הדבר נדרש. אירגון שיעורי תורה אינו שומר מספרי כרטיס אשראי מלאים במסד הנתונים של החשבון.</p>
      <p>בתרומה חודשית אנו עשויים לשמור את הסכום, יום החיוב שנבחר, סוג התקופה, מספר החודשים כאשר התקופה קבועה, מזהי ספק התשלום, סטטוס והחשבון שמנהל את התרומה כאשר אתם מחוברים.</p>
      <h2>כיצד אנו משתמשים במידע</h2><p>המידע משמש להפעלת החשבון ואבטחתו, שמירת ספרייה והיסטוריית צפייה/האזנה, מעקבים ותגובות, התראות, עיבוד תרומות ורכישות, מתן גישה לתוכן שנרכש, מענה לפניות, שליחת הודעות חשבון שביקשתם, פתרון תקלות, ספירת שימוש ושיפור השירות.</p>
      <h2>ספקי שירות</h2><p>אנו עשויים להשתמש ב־<strong>Cloudflare</strong> לתשתיות, API, מסדי נתונים ואחסון; <strong>Vimeo</strong> לווידאו ושידורים חיים; <strong>Google Drive</strong> לקבצים מוגנים; <strong>Firebase</strong> לשירותי התחברות/Push נתמכים; <strong>Google</strong> ו־<strong>Apple</strong> לשירותי התחברות או אפליקציה; <strong>Stripe</strong> וספקי התשלום האחרים המפורטים לעיל; ו־<strong>Resend</strong> לשליחת אימייל.</p>
      <h2>אבטחה</h2><p>אנו משתמשים ב־HTTPS. סיסמאות אינן נשמרות כטקסט גלוי במסד הנתונים. גישה למדיה מוגנת ולפעולות ניהול מוגבלת באמצעות בדיקות חשבון והרשאה.</p>
      <h2>שמירת מידע ומחיקה</h2><p>פרטי חשבון ופעילות המקושרת אליו נשמרים בדרך כלל כל עוד החשבון פעיל. פניות, תרומות, רכישות ורישומי תשלום שהושלמו עשויים להישמר כאשר הדבר נדרש באופן סביר לצורכי הנהלת חשבונות, מניעת הונאה, טיפול במחלוקות, אבטחה, תמיכה או חובות חוקיות.</p>
      <p>אפשר לבקש מחיקת חשבון באזור החשבון באפליקציה. מחיקת חשבון מסירה את החשבון ונתונים המקושרים אליו במסד הנתונים של אירגון, כגון סשנים, לייקים, שמירה להמשך, היסטוריה, מעקבים, תגובות ונתוני איפוס סיסמה. רישומי עסקה נפרדים אינם בהכרח נמחקים כאשר יש צורך סביר לשמור אותם.</p>
      <h2>התראות מעקב</h2><p>אם בחרתם לקבל התראות, אנו עשויים לשמור אסימון Push והעדפות Push/אימייל. משלוח Push עשוי להשתמש ב־Firebase Cloud Messaging. אימיילי מעקב כוללים אפשרות ביטול הרשמה.</p>
      <h2>שאלות פרטיות</h2><p>לשאלות או בקשות פרטיות, השתמשו בעמוד יצירת הקשר באפליקציה.</p>
      <button class="privacy-back" data-nav="account">חזרה לחשבון</button>
    </div>`;
  return `<div class="page-title"><h1>Privacy Policy</h1><p>How Irgun Shiurai Torah handles information in the app.</p></div>
    <div class="privacy-card">
      <p class="privacy-updated"><strong>Last updated:</strong> September 17, 2026</p>
      <p>This Privacy Policy explains how <strong>Irgun Shiurai Torah</strong> handles information when you use our website, Android app, or iOS app.</p>
      <h2>Information we collect</h2>
      <p><strong>Account information:</strong> name, email address, and a protected password hash when you create an account.</p>
      <p><strong>Account activity:</strong> likes, Watch Later selections, watch/listen history and resume position, followed speakers/topics, comments, notification preferences, and account-linked digital purchases.</p>
      <p><strong>Usage and technical information:</strong> watch/listen events, a randomly generated visitor identifier used to reduce duplicate counting, and ordinary service/security logs that may include IP address, browser/app information, timestamps and errors.</p>
      <h2>Donations, recurring donations and purchases</h2>
      <p>Card donations and recurring donations may be processed by <strong>Stripe</strong>. Other donation methods may use <strong>Cardknox</strong>, <strong>PayPal</strong>, <strong>OJC Card Payment Site</strong>, <strong>The Donors’ Fund</strong>, or <strong>Matbia</strong>, depending on what you choose. Digital purchases may also use the applicable app-store purchase system where required. Irgun Shiurai Torah does not store full payment-card numbers in the Irgun account database.</p>
      <p>For recurring donations we may store the amount, selected billing day, term type, number of months when fixed, payment-provider identifiers, status, and the Irgun account that manages the donation when you are signed in.</p>
      <h2>How we use information</h2><p>We use information to operate and secure accounts; remember library, follows and playback history; provide comments, saved shiurim and notifications; process donations and digital purchases; provide purchased listening access; respond to messages; send requested account or follow emails; troubleshoot problems; count usage; and improve the service.</p>
      <h2>Service providers</h2><p>Our service providers may include <strong>Cloudflare</strong> for delivery, APIs, databases and storage; <strong>Vimeo</strong> for video and live playback; <strong>Google Drive</strong> for protected media/files; <strong>Firebase</strong> for supported sign-in/push services; <strong>Google</strong> and <strong>Apple</strong> for supported sign-in or app services; <strong>Stripe</strong> and the other payment providers listed above; and <strong>Resend</strong> for email delivery.</p>
      <h2>Security</h2><p>We use HTTPS for network connections. Passwords are not stored as plain text in the Irgun database. Access to protected media and administrative functions is restricted by account or authorization checks.</p>
      <h2>Retention and deletion</h2><p>Account information and account-linked activity are generally kept while your account remains active. Contact messages and completed donation, purchase or payment records may be retained when reasonably necessary for accounting, fraud prevention, dispute handling, security, support, or legal obligations.</p>
      <p>You can request deletion from the app's Account area. Deleting an Irgun account removes the account record and account-linked sessions, likes, Watch Later entries, history, follows, comments and password-reset data stored in the Irgun account database. Separate transaction or business records may be retained when reasonably necessary.</p>
      <h2>Following notifications</h2><p>If you opt in, we may store a browser/app push token and your push/email notification preferences. Push delivery may use Firebase Cloud Messaging. Follow emails include an unsubscribe option.</p>
      <h2>Privacy questions</h2><p>For privacy questions or requests, use the Contact page in this app.</p>
      <button class="privacy-back" data-nav="account">Back to Account</button>
    </div>`;
}

function deleteAccountDialogHtml() {
  if (!state.deleteDialog) return '';
  return `<div class="confirm-backdrop" data-delete-cancel="1">
    <section class="confirm-dialog" data-delete-dialog="1">
      <div class="confirm-icon">!</div>
      <h2>Delete Account?</h2>
      <p>This permanently deletes your Irgun account and its likes, Watch Later list, history, follows, comments and active sessions.</p>
      <p><strong>This cannot be undone.</strong> Type <strong>DELETE</strong> below to continue.</p>
      <input id="deleteConfirmText" class="confirm-input" autocomplete="off" autocapitalize="characters" placeholder="Type DELETE">
      <div class="confirm-actions">
        <button class="confirm-cancel" data-delete-cancel="1" ${state.deleteBusy ? 'disabled' : ''}>Cancel</button>
        <button class="confirm-delete" data-delete-confirm="1" ${state.deleteBusy ? 'disabled' : ''}>${state.deleteBusy ? 'Deleting…' : 'Delete Account'}</button>
      </div>
    </section>
  </div>`;
}

async function deleteCurrentAccount() {
  if (!state.user || state.deleteBusy) return;
  const field = document.getElementById('deleteConfirmText');
  if (!field || field.value.trim().toUpperCase() !== 'DELETE') {
    alert('Please type DELETE to confirm account deletion.');
    return;
  }
  state.deleteBusy = true;
  const button = document.querySelector('[data-delete-confirm]');
  if (button) { button.disabled = true; button.textContent = 'Deleting…'; }
  try {
    await apiJson('/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' })
    });
    setToken('');
    resetUserState();
    state.deleteDialog = false;
    state.deleteBusy = false;
    state.screen = 'home';
    state.accountSection = 'profile';
    render();
    setToast('Your account and associated app data were deleted.');
  } catch (error) {
    state.deleteBusy = false;
    alert(error.message || 'Could not delete your account. Please try again.');
    render();
  }
}

function accountFollowingHtml() {
  const follows = [...state.follows.values()];
  const feed = followingFeed();
  return `<div class="account-card"><h2>Following</h2>
    ${follows.length ? `<div class="follow-chips">${follows.map(item => `<button class="follow-chip active" data-follow-type="${esc(item.type)}" data-follow-key="${esc(item.key)}" data-follow-label="${esc(item.labelEn || item.labelHe || item.key)}">${esc(item.labelEn || item.labelHe || item.key)} <span>Unfollow</span></button>`).join('')}</div>` : '<div class="empty">You are not following any speakers or topics yet.</div>'}
    <h2 class="subhead">New From Speakers &amp; Topics You Follow</h2>
    <div class="list">${feed.length ? feed.map(v => compactItem({ ...v, _kind:'video' })).join('') : '<div class="empty">Follow a speaker or topic from a shiur to build this feed.</div>'}</div>
  </div>`;
}

function accountSettingsHtml() {
  const settings = state.notificationSettings || {};
  const pushDisabled = !settings.pushConfigured || state.notificationBusy;
  const emailDisabled = !settings.emailConfigured || state.notificationBusy;
  return `<div class="account-card notification-settings-card">
    <h2>Following Notifications</h2>
    <p class="account-setting-intro">Choose how you want to hear about new shiurim from speakers and topics you follow.</p>
    <label class="setting-row"><span><strong>Push Notifications</strong><small>Receive a push notification on this app.</small></span><input id="appPushToggle" type="checkbox" ${settings.pushEnabled ? 'checked' : ''} ${pushDisabled ? 'disabled' : ''}></label>
    <label class="setting-row"><span><strong>Email Notifications</strong><small>Send an email when a new shiur matches one of your follows.</small></span><input id="appEmailToggle" type="checkbox" ${settings.emailEnabled ? 'checked' : ''} ${emailDisabled ? 'disabled' : ''}></label>
    <label class="setting-row"><span><strong>${currentLanguage()==='he'?'תזכורת לפני שיעור קרוב':'Upcoming Shiur Reminder'}</strong><small>${currentLanguage()==='he'?'התראה מקומית לפני שיעור שמופיע בלוח הזמנים.':'A local notification before a scheduled shiur begins.'}</small></span><input id="upcomingReminderToggle" type="checkbox" ${state.upcomingRemindersEnabled?'checked':''}></label>
    <label class="setting-row"><span><strong>${currentLanguage()==='he'?'זמן התזכורת':'Reminder Time'}</strong><small>${currentLanguage()==='he'?'כמה זמן לפני תחילת השיעור.':'How long before the shiur starts.'}</small></span><select id="upcomingReminderMinutes" class="notification-reminder-select">${[[10,'10 min'],[30,'30 min'],[60,'1 hour']].map(([v,l])=>`<option value="${v}" ${Number(state.upcomingReminderMinutes)===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <div class="reminder-city-settings"><div class="reminder-city-heading"><strong>${currentLanguage()==='he'?'ערים לתזכורות':'Reminder Cities'}</strong><small>${currentLanguage()==='he'?'בחרו מאילו ערים לקבל תזכורות לשיעורים קרובים.':'Choose which cities should trigger upcoming-shiur reminders.'}</small></div><div class="reminder-city-grid"><label><input type="checkbox" data-reminder-all-cities="1" ${state.upcomingReminderLocations===null?'checked':''}><span>${currentLanguage()==='he'?'כל הערים':'All cities'}</span></label>${availableScheduleLocations().map(city=>`<label><input type="checkbox" data-reminder-city="${esc(city)}" ${state.upcomingReminderLocations===null||state.upcomingReminderLocations.has(city)?'checked':''}><span>${esc(city)}</span></label>`).join('')}</div></div>
    ${!settings.pushConfigured ? '<div class="settings-status">App push is not configured yet.</div>' : ''}
    ${!settings.emailConfigured ? '<div class="settings-status">Email notifications are not configured yet.</div>' : ''}
  </div>`;
}

function accountProfileHtml() {
  return `<div class="account-card">
      <div class="profile-line"><strong>Name:</strong><span>${esc(state.user.name || '')}</span></div>
      <div class="profile-line"><strong>Email:</strong><span>${esc(state.user.email || '')}</span></div>
      <form id="profileForm" class="form-stack">
        <label>Name<input id="profileName" value="${esc(state.user.name || '')}" required></label>
        <label>New Password<input id="profilePassword" type="password" placeholder="Leave empty to keep current password"></label>
        <button class="form-submit" type="submit">Save Changes</button>
      </form>
      <div class="account-policy-actions">
        <button class="policy-btn" data-nav="privacy">Privacy Policy</button>
        <button class="delete-account-btn" data-delete-open="1">Delete Account</button>
      </div>
      <button class="logout-btn" data-logout="1">Logout</button>
    </div>`;
}

function accountDateLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  try { return new Intl.DateTimeFormat(currentLanguage() === 'he' ? 'he-IL' : 'en-US', { month:'short', day:'numeric', year:'numeric' }).format(d); } catch (_) { return String(value); }
}

function recurringDonationCard(item) {
  const status = String(item?.status || 'pending');
  const ended = ['canceled','incomplete_expired'].includes(status);
  const stopping = Boolean(item?.cancelAtPeriodEnd || item?.userCancelScheduled);
  const fixed = item?.termType === 'fixed';
  const endDate = accountDateLabel(item?.plannedEndAt || (stopping ? item?.currentPeriodEnd : null));
  const nextDate = !ended && !stopping ? accountDateLabel(item?.currentPeriodEnd) : '';
  const badge = ended ? 'Canceled' : stopping ? 'Cancellation scheduled' : status === 'active' ? 'Active' : status.replace(/_/g,' ');
  const plan = fixed ? `${Number(item?.termMonths)||0} month${Number(item?.termMonths)===1?'':'s'}` : 'Ongoing monthly';
  const billing = Number(item?.billingDay) > 0 ? ` • Charges on day ${Number(item.billingDay)}` : '';
  const busy = state.recurringActionBusy === String(item?.id || '');
  return `<article class="recurring-card ${ended ? 'ended' : stopping ? 'stopping' : 'active'}"><div class="recurring-head"><div><strong>${money(item?.amountCents,item?.currency)} <small>per month</small></strong><span>${esc(plan)}${esc(billing)}</span></div><b>${esc(badge)}</b></div>${nextDate ? `<p><span>Next monthly charge</span><strong>${esc(nextDate)}</strong></p>` : ''}${endDate ? `<p><span>${ended ? 'Ended' : 'Ends'}</span><strong>${esc(endDate)}</strong></p>` : ''}<div class="recurring-actions">${item?.canCancel ? `<button data-recurring-action="cancel" data-recurring-id="${esc(item.id)}" ${busy?'disabled':''}>${busy?'Updating…':'Cancel monthly donation'}</button>` : ''}${item?.canResume ? `<button class="resume" data-recurring-action="resume" data-recurring-id="${esc(item.id)}" ${busy?'disabled':''}>${busy?'Updating…':'Keep monthly donation'}</button>` : ''}</div></article>`;
}

function accountPurchasesHtml() {
  const items = state.paidCatalog.filter(item => item.owned);
  const recurring = state.recurringDonations || [];
  const recurringHtml = state.recurringLoading && !state.recurringLoaded ? '<div class="loading">Loading recurring donations...</div>'
    : state.recurringError ? `<div class="error">${esc(state.recurringError)}</div>`
    : recurring.length ? `<div class="recurring-list">${recurring.map(recurringDonationCard).join('')}</div>`
    : `<div class="empty recurring-empty">You have no monthly Stripe donations in this account yet.<br><button data-nav="donate">Make a monthly donation</button></div>`;
  return `<div class="account-card account-purchases"><div class="section-head"><div><h2>Purchased Shiurim</h2><p>Listen to collections owned by this account.</p></div><button class="section-link" data-nav="paid">Browse Store</button></div>${items.length ? `<div class="paid-grid compact-paid-grid">${items.map(paidProductCard).join('')}</div>` : '<div class="empty">No paid shiurim have been purchased on this account yet.</div>'}<div class="recurring-donations-section"><div class="section-head"><div><h2>Recurring Donations</h2><p>Manage monthly Stripe donations made while signed in to this account.</p></div><button class="section-link" data-nav="donate">Donate</button></div>${recurringHtml}</div></div>`;
}


function scheduleAdminKey(event){
  return String(event?.adminOverrideBaseKey||[event?.date,event?.startTime,event?.location,event?.speaker,event?.title].map(v=>String(v||'').trim()).join('|').slice(0,1000));
}

function adminStatusText(){
  if(state.adminLoading)return '<div class="loading-small">Loading admin controls...</div>';
  if(state.adminError)return `<div class="error">${esc(state.adminError)}</div>`;
  return '';
}

async function loadAdminData(force=false){
  if(!state.isAdmin||state.adminLoading||(state.adminLoaded&&!force))return;
  state.adminLoading=true;state.adminError='';
  if(state.screen==='account'&&state.accountSection==='admin')render();
  try{
    const [status,live,ribbon,prices,sponsorships,counts,reviews,donations]=await Promise.all([
      apiJson('/admin/status'),apiJson('/admin/live-stream'),apiJson('/admin/sponsor-ribbon'),apiJson('/admin/sponsor-prices'),apiJson('/admin/sponsorships'),apiJson('/admin/view-counts'),apiJson('/schedule-review').catch(()=>({items:[]})),apiJson('/admin/donations').catch(()=>({items:[]}))
    ]);
    state.adminStatus=status;state.adminAdmins=status.admins||[];state.adminLive=live.locations||{};state.adminRibbon=ribbon.ribbon||state.adminRibbon;state.adminSponsorPrices=prices.prices||state.adminSponsorPrices;state.adminSponsorships=sponsorships.items||[];state.adminViewCounts=counts||state.adminViewCounts;state.adminReviewItems=reviews.items||[];state.adminDonations=donations.items||[];state.adminLoaded=true;
  }catch(error){state.adminError=error?.message||'Admin controls could not be loaded.';}
  finally{state.adminLoading=false;if(state.screen==='account'&&state.accountSection==='admin')render();}
}


async function loadAdminDropboxAds(force=false){
  if(!state.isAdmin||state.adminDropboxAdsLoading||(state.adminDropboxAds&&!force))return;
  state.adminDropboxAdsLoading=true;state.adminDropboxAdsError='';
  if(state.screen==='account'&&state.accountSection==='admin'&&state.adminScheduleAdsView==='dropbox')render();
  try{state.adminDropboxAds=await apiJson(`/admin/dropbox-ads?v=${Date.now()}`);}
  catch(error){state.adminDropboxAdsError=error?.message||'Dropbox Ads could not be loaded.';}
  finally{state.adminDropboxAdsLoading=false;if(state.screen==='account'&&state.accountSection==='admin'&&state.adminScheduleAdsView==='dropbox')render();}
}

function adminDropboxTime(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString();}

function adminDropboxAdsHtml(){
  if(state.adminDropboxAdsLoading&&!state.adminDropboxAds)return '<div class="loading-small">Loading Dropbox Ads...</div>';
  if(state.adminDropboxAdsError&&!state.adminDropboxAds)return `<div class="error">${esc(state.adminDropboxAdsError)}</div>`;
  const data=state.adminDropboxAds;
  if(!data)return '<div class="empty">Open Dropbox Ads to load the current ad source.</div>';
  const folders=Array.isArray(data.folders)?data.folders:[];
  const ads=Array.isArray(data.ads)?data.ads:[];
  const enabled=Boolean(data.enabled);
  const syncLabel=data.running?'Sync in progress':(data.lastSync?`Last sync: ${adminDropboxTime(data.lastSync)}`:'No completed Dropbox sync yet.');
  const folderHtml=folders.length?folders.map(folder=>`<label class="admin-dropbox-folder ${folder.permanent?'permanent':''}"><input type="checkbox" data-admin-dropbox-folder="${esc(folder.id)}" ${folder.enabled?'checked':''} ${folder.permanent?'disabled':''}><span><strong>${esc(folder.path||folder.name||'Folder')}</strong><small>${esc(folder.status||'')}${folder.permanent?' · Permanently ignored':''}</small></span></label>`).join(''):'<div class="empty">No Dropbox folders are available yet.</div>';
  const adsHtml=ads.length?ads.map(ad=>{const extraction=ad.extraction||{};const expiry=ad.customExpiresAt?new Date(Number(ad.customExpiresAt)||ad.customExpiresAt).toISOString().slice(0,10):'';const files=Array.isArray(ad.files)?ad.files:[];const image=files.find(file=>file.present&&file.kind==='image');const pdf=files.find(file=>file.present&&file.kind==='pdf');return `<article class="admin-dropbox-ad"><div class="admin-dropbox-ad-main"><div class="admin-dropbox-thumb">${image?'AD':'PDF'}</div><div><strong>${esc(ad.name||'Dropbox ad')}</strong><span>${esc(ad.status||'')} · ${esc(extraction.status||'pending')}</span>${image?`<button type="button" class="admin-dropbox-open" data-admin-dropbox-open="${esc(image.url)}" data-admin-dropbox-mime="image/*" data-admin-dropbox-name="${esc(image.name||'ad.jpg')}">Open image</button>`:''}${pdf?`<button type="button" class="admin-dropbox-open" data-admin-dropbox-open="${esc(pdf.url)}" data-admin-dropbox-mime="application/pdf" data-admin-dropbox-name="${esc(pdf.name||'ad.pdf')}">Open PDF</button>`:''}</div></div><div class="admin-dropbox-ad-controls"><button data-admin-dropbox-ad-hide="${esc(ad.id)}" data-hidden="${ad.hidden?'1':'0'}">${ad.hidden?'Show Again':'Hide'}</button><label>Expires <input type="date" data-admin-dropbox-expiry="${esc(ad.id)}" value="${esc(expiry)}"></label><button data-admin-dropbox-expiry-save="${esc(ad.id)}">Save Expiration</button></div></article>`;}).join(''):'<div class="empty">No Dropbox ads are available yet.</div>';
  return `<div class="admin-dropbox-toolbar"><div><strong>${enabled?'Dropbox is active on the website':'Preview mode · current website source unchanged'}</strong><small>${esc(syncLabel)}</small></div><div class="admin-card-tools"><button data-admin-dropbox-action="sync">Sync Dropbox Now</button><button data-admin-dropbox-action="refresh">Refresh status</button><button data-admin-dropbox-action="prepare">Queue next PDFs</button><button data-admin-dropbox-action="source" data-enabled="${enabled?'1':'0'}">${enabled?'Use legacy source':'Activate Dropbox on website'}</button></div></div><details class="admin-dropbox-folders"><summary>Source folders (${folders.length})</summary><div class="admin-dropbox-folder-list">${folderHtml}</div></details><div class="admin-dropbox-ads-list">${adsHtml}</div>`;
}

async function adminDropboxAction(action,element=null){
  try{
    if(action==='refresh'){await loadAdminDropboxAds(true);return;}
    if(action==='sync')await apiJson('/admin/dropbox-ads/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({restart:false})});
    if(action==='prepare')await apiJson('/admin/dropbox-ads/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(action==='source'){const enabled=element?.dataset.enabled==='1';await apiJson('/admin/dropbox-ads/source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!enabled})});}
    await loadAdminDropboxAds(true);setToast('Dropbox Ads updated.');
  }catch(error){setToast(error?.message||'Dropbox Ads update failed.');}
}

async function adminDropboxFolderToggle(input){try{await apiJson('/admin/dropbox-ads/folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:input.dataset.adminDropboxFolder,enabled:Boolean(input.checked)})});await loadAdminDropboxAds(true);}catch(error){input.checked=!input.checked;setToast(error?.message||'Could not update Dropbox folder.');}}
async function adminDropboxAdHide(button){try{await apiJson('/admin/dropbox-ads/ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:button.dataset.adminDropboxAdHide,hidden:button.dataset.hidden!=='1'})});await loadAdminDropboxAds(true);}catch(error){setToast(error?.message||'Could not update ad.');}}
async function openAdminDropboxFile(button){
  const url=String(button?.dataset.adminDropboxOpen||'');if(!url)return;
  const mime=String(button?.dataset.adminDropboxMime||'application/octet-stream');const filename=String(button?.dataset.adminDropboxName||'Irgun-ad');
  try{
    if(Capacitor.getPlatform()==='android'){await IrgunDownloader.openSecureFile({url,filename,mimeType:mime,token:state.token||'',appHeader:true});return;}
    const response=await fetch(url,{headers:authHeaders(),credentials:'include'});if(!response.ok)throw new Error(`File returned ${response.status}`);const blobUrl=URL.createObjectURL(await response.blob());window.open(blobUrl,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(blobUrl),60000);
  }catch(error){setToast(error?.message||'Could not open Dropbox ad file.');}
}
async function adminDropboxSaveExpiry(id){const input=document.querySelector(`[data-admin-dropbox-expiry="${CSS.escape(String(id))}"]`);const value=String(input?.value||'').trim();try{await apiJson('/admin/dropbox-ads/ad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,customExpiresAt:value?new Date(`${value}T23:59:59`).toISOString():null})});await loadAdminDropboxAds(true);setToast('Ad expiration saved.');}catch(error){setToast(error?.message||'Could not save expiration.');}}

function adminSponsorshipCards(){
  if(!state.adminSponsorships.length)return '<div class="empty">No sponsorships yet.</div>';
  return state.adminSponsorships.map(item=>`<article class="admin-sponsor-card"><div class="admin-sponsor-head"><div><strong>${esc(item.nameEn||item.nameHe||'Anonymous')}</strong><span>${esc(item.dedicationType||'')}</span></div><b class="status-${esc(item.status||'pending_review')}">${esc((item.status||'pending_review').replace(/_/g,' '))}</b></div><p>${esc(item.plan||'')} • ${esc(item.startDate||'')}${item.endDate&&item.endDate!==item.startDate?` – ${esc(item.endDate)}`:''} • ${money(item.amountCents||0)}</p><small>${esc(item.donorEmail||'')}</small><div class="admin-card-tools"><button data-admin-sponsor-action="edit" data-admin-sponsor-id="${esc(item.id)}">Edit</button>${item.status!=='approved'?`<button data-admin-sponsor-action="approve" data-admin-sponsor-id="${esc(item.id)}">Approve</button>`:''}${item.status!=='rejected'?`<button data-admin-sponsor-action="reject" data-admin-sponsor-id="${esc(item.id)}">Reject</button>`:''}<button class="danger" data-admin-sponsor-action="delete" data-admin-sponsor-id="${esc(item.id)}">Delete</button></div></article>`).join('');
}

function adminReviewCards(){
  if(!state.adminReviewItems.length)return '<div class="empty">Nothing is waiting for Schedule Review.</div>';
  return state.adminReviewItems.map(item=>`<article class="admin-review-card"><div><strong>${esc(item.fileName||'Schedule flyer')}</strong><span>${Number(item.candidateCount)||0} detected lecture${Number(item.candidateCount)===1?'':'s'}</span></div>${item.warning?`<p>${esc(item.warning)}</p>`:''}<div class="admin-card-tools"><button data-admin-review-action="edit" data-admin-review-fingerprint="${esc(item.fingerprint)}">Review &amp; Edit</button><button data-admin-review-action="retry" data-admin-review-fingerprint="${esc(item.fingerprint)}">Recheck</button><button class="danger" data-admin-review-action="empty" data-admin-review-fingerprint="${esc(item.fingerprint)}">Mark No Schedule</button></div></article>`).join('');
}

function adminDonationCards(){
  const items=Array.isArray(state.adminDonations)?state.adminDonations:[];
  if(!items.length)return '<div class="empty">No Stripe donations recorded yet.</div>';
  return items.map(item=>{const amount=(Number(item.amountCents||0)/100).toLocaleString('en-US',{style:'currency',currency:String(item.currency||'USD').toUpperCase()});const note=String(item.note||'').trim();return `<article class="admin-donation-card"><div class="admin-sponsor-head"><div><strong>${esc(item.donorName||'Donor')} · ${esc(amount)}</strong><span>${esc(item.donorEmail||'')}${item.donorPhone?` · ${esc(item.donorPhone)}`:''}</span></div><b>${esc(item.status||'')}</b></div><p>${esc(item.frequency||'one_time')} • ${esc(item.destination||'')} • ${esc(item.paidAt||item.createdAt||'')}</p>${note?`<div class="admin-donation-note"><strong>Note / Description</strong><div>${esc(note).replace(/\n/g,'<br>')}</div></div>`:''}</article>`;}).join('');
}

function accountAdminHtml(){
  const editSponsor=state.adminEditingSponsorshipId?state.adminSponsorships.find(x=>String(x.id)===String(state.adminEditingSponsorshipId)):null;
  const p=state.adminSponsorPrices||{};const r=state.adminRibbon||{};const live=state.adminLive||{};
  return `<div class="admin-account-wrap">${adminStatusText()}<section class="admin-panel-card admin-mode-card"><div><span class="section-kicker">PROTECTED</span><h2>Admin Mode</h2><p>Only accounts authorized by the Worker can see this section. Turn Admin Mode on to show edit controls on Schedule, Shiurim and Paid Shiurim.</p></div><label class="admin-toggle"><input id="adminModeToggle" type="checkbox" ${state.adminMode?'checked':''}><span></span></label></section>
  <section class="admin-panel-card admin-schedule-ads-card"><div class="section-head admin-schedule-ads-head"><div><h2>Schedule &amp; Ads</h2><p>Review schedule extraction or manage the Dropbox ad source.</p></div><select id="adminScheduleAdsView"><option value="review" ${state.adminScheduleAdsView==='review'?'selected':''}>Schedule Review</option><option value="dropbox" ${state.adminScheduleAdsView==='dropbox'?'selected':''}>Dropbox Ads</option></select></div>${state.adminScheduleAdsView==='review'?`<div class="admin-schedule-ads-subhead"><strong>Schedule Review</strong><button data-admin-refresh="1">Refresh</button></div>${adminReviewCards()}`:adminDropboxAdsHtml()}</section>
  <section class="admin-panel-card"><div class="section-head"><div><h2>Stripe Donations</h2><p>Recent donations and donor notes/descriptions.</p></div><button data-admin-donations-refresh="1">Refresh</button></div><div class="admin-sponsorship-list">${adminDonationCards()}</div></section>
  <section class="admin-panel-card"><h2>Live Stream Override</h2><p>Show a live player even when no schedule row is live.</p><div class="admin-check-row"><label><input id="adminLiveBoro" type="checkbox" ${live['Boro Park']?'checked':''}> Boro Park</label><label><input id="adminLiveFlatbush" type="checkbox" ${live.Flatbush?'checked':''}> Flatbush</label></div><button class="admin-save" data-admin-live-save="1">Save Live Settings</button></section>
  <section class="admin-panel-card"><h2>Sponsor Ribbon</h2><form id="adminRibbonForm" class="admin-form-grid"><label>Show Ribbon<select id="adminRibbonEnabled"><option value="1" ${r.enabled?'selected':''}>On</option><option value="0" ${!r.enabled?'selected':''}>Off</option></select></label><label>Link (optional)<input id="adminRibbonLink" type="url" value="${esc(r.linkUrl||'')}"></label><label class="full">Ribbon Text (English)<input id="adminRibbonTextEn" maxlength="600" value="${esc(r.textEn||'')}"></label><label class="full">Ribbon Text (Hebrew)<input id="adminRibbonTextHe" dir="rtl" maxlength="600" value="${esc(r.textHe||'')}"></label><button class="admin-save full" type="submit">Save Ribbon</button></form></section>
  <section class="admin-panel-card"><h2>Sponsorship Prices</h2><form id="adminSponsorPricesForm" class="admin-form-grid"><label>One Day ($)<input id="adminSponsorPriceDay" type="number" min="1" max="50000" step="0.01" value="${esc(p.day??100)}"></label><label>One Week ($)<input id="adminSponsorPriceWeek" type="number" min="1" max="50000" step="0.01" value="${esc(p.week??500)}"></label><label>One Month ($)<input id="adminSponsorPriceMonth" type="number" min="1" max="50000" step="0.01" value="${esc(p.month??2000)}"></label><button class="admin-save full" type="submit">Save Prices</button></form></section>
  <section class="admin-panel-card"><h2>${editSponsor?'Edit Sponsorship':'Add Sponsorship Manually'}</h2><form id="adminSponsorshipForm" class="admin-form-grid"><label>Plan<select id="adminSponsorPlan">${['day','week','month'].map(x=>`<option value="${x}" ${(editSponsor?.plan||'day')===x?'selected':''}>${x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select></label><label>Start Date<input id="adminSponsorDate" type="date" required value="${esc(editSponsor?.startDate||donationTodayIso())}"></label><label class="full">Dedication<select id="adminSponsorDedication" required><option value="">Choose dedication</option>${SPONSOR_DEDICATION_TYPES.map(x=>`<option ${editSponsor?.dedicationType===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label><label>Name in English<input id="adminSponsorNameEn" value="${esc(editSponsor?.nameEn||'')}"></label><label>Name in Hebrew<input id="adminSponsorNameHe" dir="rtl" value="${esc(editSponsor?.nameHe||'')}"></label><div class="admin-form-actions full"><button class="admin-save" type="submit">${editSponsor?'Save Changes':'Add Approved Sponsorship'}</button>${editSponsor?'<button type="button" data-admin-sponsor-cancel="1">Cancel</button>':''}</div></form><div class="admin-sponsorship-list">${adminSponsorshipCards()}</div></section>
  <section class="admin-panel-card"><h2>Shiur Play Counter</h2><form id="adminViewCountForm" class="admin-inline-form"><select id="adminViewCountPlatform"><option>website</option><option>youtube</option><option>app</option><option>vimeo</option><option>other</option></select><input id="adminViewCountValue" type="number" min="0" step="1" placeholder="Total" required><button class="admin-save" type="submit">Save</button></form><div class="admin-view-list"><small>Live website events: ${Number(state.adminViewCounts.actualWebsiteViews||0).toLocaleString()}</small>${(state.adminViewCounts.items||[]).map(x=>`<div><strong>${esc(x.platform)}</strong><span>${Number(x.count||0).toLocaleString()}</span></div>`).join('')}</div></section>
  <section class="admin-panel-card"><h2>Administrators</h2><form id="adminAddForm" class="admin-inline-form"><input id="adminAddEmail" type="email" placeholder="Account email" required><button class="admin-save" type="submit">Add Admin</button></form><div class="admin-list">${state.adminAdmins.length?state.adminAdmins.map(a=>`<div class="admin-list-row"><div><strong>${esc(a.name||a.email)}</strong><small>${esc(a.email)}${a.bootstrap?' • bootstrap':''}</small></div>${a.bootstrap?'':`<button class="danger" data-admin-remove="${esc(a.id)}">Remove</button>`}</div>`).join(''):'<div class="empty">No administrators configured.</div>'}</div></section>
  <section class="admin-panel-card"><h2>Content Editing</h2><p>With Admin Mode on, Schedule cards show Add/Edit/Delete, video shiur cards show Edit Shiur, and Paid Shiurim show Add/Edit/Delete. Every save is checked by the protected Worker endpoint.</p><div class="admin-nav-row"><button data-nav="schedule">Open Schedule</button><button data-nav="shiurim">Open Shiurim</button><button data-nav="paid">Open Paid Shiurim</button><button data-external="https://irgunshiuraitorah.com/account.html">Full Website Admin</button></div></section></div>`;
}

async function saveAdminLive(){
  try{const data=await apiJson('/admin/live-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({locations:{'Boro Park':Boolean(document.getElementById('adminLiveBoro')?.checked),Flatbush:Boolean(document.getElementById('adminLiveFlatbush')?.checked)}})});state.adminLive=data.locations||state.adminLive;state.liveStatusLoaded=false;await loadLiveStatus();setToast('Live stream settings saved.');render();}catch(error){setToast(error?.message||'Could not save live settings.');}
}
async function saveAdminRibbon(event){event.preventDefault();try{const data=await apiJson('/admin/sponsor-ribbon',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:document.getElementById('adminRibbonEnabled')?.value==='1',textEn:document.getElementById('adminRibbonTextEn')?.value||'',textHe:document.getElementById('adminRibbonTextHe')?.value||'',linkUrl:document.getElementById('adminRibbonLink')?.value||''})});state.adminRibbon=data.ribbon||state.adminRibbon;await loadSponsorRibbon();setToast('Sponsor ribbon saved.');render();}catch(error){setToast(error?.message||'Could not save ribbon.');}}
async function saveAdminSponsorPrices(event){event.preventDefault();try{const body={day:Number(document.getElementById('adminSponsorPriceDay')?.value),week:Number(document.getElementById('adminSponsorPriceWeek')?.value),month:Number(document.getElementById('adminSponsorPriceMonth')?.value)};const data=await apiJson('/admin/sponsor-prices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});state.adminSponsorPrices=data.prices||state.adminSponsorPrices;state.sponsorPricesLoaded=false;await loadSponsorPrices(true);setToast('Sponsorship prices saved.');render();}catch(error){setToast(error?.message||'Could not save prices.');}}
async function saveAdminSponsorship(event){event.preventDefault();const body={plan:document.getElementById('adminSponsorPlan')?.value||'day',startDate:document.getElementById('adminSponsorDate')?.value||'',dedicationType:document.getElementById('adminSponsorDedication')?.value||'',nameEn:document.getElementById('adminSponsorNameEn')?.value||'',nameHe:document.getElementById('adminSponsorNameHe')?.value||''};try{const id=state.adminEditingSponsorshipId;const data=await apiJson(id?`/admin/sponsorships/${encodeURIComponent(id)}`:'/admin/sponsorships',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(id?{...body,action:'edit'}:body)});state.adminSponsorships=data.items||state.adminSponsorships;state.adminEditingSponsorshipId='';await loadSponsorRibbon();setToast(id?'Sponsorship updated.':'Approved sponsorship added.');render();}catch(error){setToast(error?.message||'Could not save sponsorship.');}}
async function adminSponsorshipAction(id,action){const item=state.adminSponsorships.find(x=>String(x.id)===String(id));if(action==='edit'){state.adminEditingSponsorshipId=String(id);render();return;}if((action==='reject'||action==='delete')&&!confirm(action==='delete'?'Delete this sponsorship permanently?':'Reject this sponsorship?'))return;try{const data=await apiJson(`/admin/sponsorships/${encodeURIComponent(id)}`,{method:action==='delete'?'DELETE':'POST',headers:action==='delete'?{}:{'Content-Type':'application/json'},body:action==='delete'?undefined:JSON.stringify({action})});state.adminSponsorships=data.items||[];await loadSponsorRibbon();setToast(`Sponsorship ${action==='approve'?'approved':action==='delete'?'deleted':'rejected'}.`);render();}catch(error){setToast(error?.message||'Could not update sponsorship.');}}
async function saveAdminViewCount(event){event.preventDefault();try{await apiJson('/admin/view-counts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:document.getElementById('adminViewCountPlatform')?.value||'website',count:Math.floor(Number(document.getElementById('adminViewCountValue')?.value))})});state.adminLoaded=false;await loadAdminData(true);setToast('Counter saved.');}catch(error){setToast(error?.message||'Could not save counter.');}}
async function addAdmin(event){event.preventDefault();const email=String(document.getElementById('adminAddEmail')?.value||'').trim();try{const data=await apiJson('/admin/admins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});state.adminAdmins=data.admins||[];setToast('Administrator added.');render();}catch(error){setToast(error?.message||'Could not add administrator.');}}
async function removeAdmin(id){if(!confirm('Remove this administrator?'))return;try{const data=await apiJson(`/admin/admins/${encodeURIComponent(id)}`,{method:'DELETE'});state.adminAdmins=data.admins||[];setToast('Administrator removed.');render();}catch(error){setToast(error?.message||'Could not remove administrator.');}}
async function adminReviewAction(fingerprint,action){const item=state.adminReviewItems.find(x=>x.fingerprint===fingerprint);if(!item)return;if(action==='edit'){state.adminReviewEditor={fingerprint,events:(item.candidates||[]).map(x=>({...x})),note:item.reviewNote||''};render();return;}if(action==='empty'&&!confirm('Mark this flyer as having no schedule?'))return;try{if(action==='retry')await apiJson('/schedule-review/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fingerprint})});else await apiJson('/schedule-review/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fingerprint,events:[],markNoSchedule:true})});state.adminLoaded=false;await loadAdminData(true);setToast(action==='retry'?'Flyer queued for recheck.':'Marked as no schedule.');}catch(error){setToast(error?.message||'Schedule review update failed.');}}
function collectReviewEvents(){return [...document.querySelectorAll('[data-review-row]')].map(row=>{const get=name=>row.querySelector(`[data-review-field="${name}"]`)?.value||'';return {date:get('date'),dateLabel:get('dateLabel'),hebrewDate:get('hebrewDate'),startTime:get('startTime'),endTime:get('endTime'),location:get('location'),venue:get('venue'),speaker:get('speaker'),title:get('title'),program:get('program'),language:get('language'),year:get('year'),shiurCode:get('shiurCode')};});}
async function approveAdminReview(event){event.preventDefault();if(!state.adminReviewEditor)return;try{await apiJson('/schedule-review/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fingerprint:state.adminReviewEditor.fingerprint,events:collectReviewEvents(),note:document.getElementById('reviewNote')?.value||''})});state.adminReviewEditor=null;state.adminLoaded=false;state.scheduleDataLoaded=false;await Promise.all([loadAdminData(true),loadScheduleData()]);setToast('Schedule approved.');render();}catch(error){setToast(error?.message||'Could not approve schedule.');}}

async function openAdminPaidEditor(id=''){if(!state.isAdmin)return;try{if(!state.adminPaidCatalogLoaded){const data=await apiJson('/admin/paid-catalog');state.adminPaidCatalog=data.items||[];state.adminPaidCatalogLoaded=true;}const item=id?state.adminPaidCatalog.find(x=>String(x.id)===String(id)):null;state.adminPaidEditor=item?{...item,titleEn:item.titleEn||item.title||'',titleHe:item.titleHe||'',driveAliases:[...(item.driveAliases||[])]}:{id:'',title:'',titleEn:'',titleHe:'',speaker:'',description:'',priceCents:0,audience:'',category:'Audio Collections',catalogDetails:'',featured:false,driveAliases:[]};render();}catch(error){setToast(error?.message||'Could not load paid catalog.');}}
async function saveAdminPaid(event){event.preventDefault();const e=state.adminPaidEditor||{};const titleEn=document.getElementById('adminPaidTitleEn')?.value||'';const titleHe=document.getElementById('adminPaidTitleHe')?.value||'';const item={id:document.getElementById('adminPaidId')?.value||e.id,title:titleEn,titleEn,titleHe,speaker:document.getElementById('adminPaidSpeaker')?.value||'',description:document.getElementById('adminPaidDescription')?.value||'',price:Number(document.getElementById('adminPaidPrice')?.value)||0,audience:document.getElementById('adminPaidAudience')?.value||'',category:document.getElementById('adminPaidCategory')?.value||'',catalogDetails:document.getElementById('adminPaidDetails')?.value||'',featured:Boolean(document.getElementById('adminPaidFeatured')?.checked),driveAliases:String(document.getElementById('adminPaidAliases')?.value||'').split(/[\n,]/).map(x=>x.trim()).filter(Boolean)};try{const data=await apiJson('/admin/paid-catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'upsert',item})});state.adminPaidCatalog=data.items||[];state.adminPaidCatalogLoaded=true;state.adminPaidEditor=null;state.paidLoaded=false;await loadPaidCatalog(true);setToast('Paid shiur saved.');render();}catch(error){setToast(error?.message||'Could not save paid shiur.');}}
async function deleteAdminPaid(id){if(!confirm('Delete this paid catalog item?'))return;try{await apiJson('/admin/paid-catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',productId:id})});state.adminPaidCatalogLoaded=false;state.paidLoaded=false;await loadPaidCatalog(true);setToast('Paid catalog item deleted.');render();}catch(error){setToast(error?.message||'Could not delete paid item.');}}
function openAdminScheduleEditor(key=''){const event=key?futureScheduleEvents(200).find(x=>scheduleAdminKey(x)===key):null;state.adminScheduleEditor={baseKey:key||'',event:event?{...event}:{date:donationTodayIso(),startTime:'21:00',endTime:'22:00',location:'Boro Park',venue:'',speaker:'',title:'',speakerEn:'',speakerHe:'',topicEn:'',topicHe:'',titleEn:'',titleHe:'',language:'',year:'',program:'',shiurCode:''}};render();}
async function saveAdminSchedule(event){event.preventDefault();const ed=state.adminScheduleEditor;if(!ed)return;const get=n=>document.querySelector(`[data-admin-schedule-field="${n}"]`)?.value||'';const item={date:get('date'),dateLabel:get('dateLabel'),hebrewDate:get('hebrewDate'),startTime:get('startTime'),endTime:get('endTime'),location:get('location'),venue:get('venue'),speaker:get('speaker'),speakerEn:get('speakerEn'),speakerHe:get('speakerHe'),title:get('title'),titleEn:get('titleEn'),titleHe:get('titleHe'),topicEn:get('topicEn'),topicHe:get('topicHe'),language:get('language'),year:get('year'),program:get('program'),shiurCode:get('shiurCode')};try{await apiJson('/admin/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'upsert',baseKey:ed.baseKey,event:item})});state.adminScheduleEditor=null;state.scheduleDataLoaded=false;await loadScheduleData();setToast('Schedule item saved.');render();}catch(error){setToast(error?.message||'Could not save schedule item.');}}
async function deleteAdminSchedule(key){if(!confirm('Delete this schedule item?'))return;try{await apiJson('/admin/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',baseKey:key})});state.scheduleDataLoaded=false;await loadScheduleData();setToast('Schedule item deleted.');render();}catch(error){setToast(error?.message||'Could not delete schedule item.');}}
function adminLectureDateValue(item) {
  const explicit=String(item?.lectureDate||item?.date||'').trim(); const match=explicit.match(/^\d{4}-\d{2}-\d{2}/); if(match)return match[0];
  const fallback=String(item?.created||item?.modified||'').trim().match(/^\d{4}-\d{2}-\d{2}/); return fallback?fallback[0]:'';
}

function adminMediaOptionValues() {
  const keys=['title','titleEn','titleHe','speaker','speakerEn','speakerHe','rabbi','lecturer','topic','topicEn','topicHe','program','showcaseId','location','year','language','category','series','parsha','organization','shiurCode'];
  const values=Object.fromEntries(keys.map(k=>[k,new Set()]));
  const add=(k,v)=>{const x=String(v==null?'':v).trim();if(x&&x.length<=500&&values[k])values[k].add(x);};
  const addItem=item=>{if(!item)return; for(const k of keys)add(k,item[k]); add('title',item._displayTitle);add('speaker',item._speakerLabel);add('topic',item._topicLabel);add('location',item._location);add('year',item._year);add('language',item._language);add('program',item.showcase);add('series',item.showcase);add('shiurCode',shiurCatalogCode(item));};
  state.videos.forEach(addItem); state.audioItems.forEach(addItem);
  (state.metadata.speakers||[]).forEach(sp=>[sp.nameEn,sp.nameHe,sp.displayEn,sp.displayHe,...(sp.aliases||[])].forEach(v=>{add('speaker',v);add('speakerEn',v);add('speakerHe',v);}));
  (state.metadata.topics||[]).forEach(t=>[t.en,t.he,t.raw,...(t.aliases||[])].forEach(v=>{add('topic',v);add('topicEn',t.en);add('topicHe',t.he);}));
  add('language','English');add('language','Yiddish');
  return Object.fromEntries(Object.entries(values).map(([k,set])=>[k,[...set].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))]));
}

const ADMIN_MEDIA_ADD_LABELS={title:'+ Add New Title',titleEn:'+ Add New English Title',titleHe:'+ Add New Hebrew Title',speaker:'+ Add New Speaker',speakerEn:'+ Add New English Speaker',speakerHe:'+ Add New Hebrew Speaker',rabbi:'+ Add New Alternate Name',lecturer:'+ Add New Lecturer',topic:'+ Add New Topic',topicEn:'+ Add New English Topic',topicHe:'+ Add New Hebrew Topic',program:'+ Add New Program',showcaseId:'+ Add New Showcase ID',location:'+ Add New Location',year:'+ Add New Year',language:'+ Add New Language',category:'+ Add New Category',series:'+ Add New Series',parsha:'+ Add New Parsha',organization:'+ Add New Organization',shiurCode:'+ Add New Shiur Code'};

function adminMediaDatalistsHtml() {
  const values=adminMediaOptionValues();
  return Object.keys(ADMIN_MEDIA_ADD_LABELS).map(key=>`<datalist id="admin-${key}-options">${[...(values[key]||[]),ADMIN_MEDIA_ADD_LABELS[key]].map(v=>`<option value="${esc(v)}"></option>`).join('')}</datalist>`).join('');
}

function openAdminVideoEditor(id, kind='video', focusDate=false) {
  const isAudio=kind==='audio'; const media=isAudio?state.audioById.get(String(id)):state.videoById.get(String(id)); if(!media)return;
  state.adminVideoEditor={...media,shiurCode:String(media?.shiurCode||'').trim()||shiurCatalogCode(media),_adminMediaKind:isAudio?'audio':'video',lectureDate:adminLectureDateValue(media)}; render();
  if(focusDate){
    requestAnimationFrame(()=>{
      const input=document.querySelector('[data-admin-video-field="lectureDate"]');
      if(input){input.scrollIntoView({behavior:'smooth',block:'center'});input.focus();}
    });
  }
}

async function saveAdminVideo(event) {
  event.preventDefault(); const e=state.adminVideoEditor;if(!e)return; const get=n=>document.querySelector(`[data-admin-video-field="${n}"]`)?.value||'';
  const item={title:get('title'),titleEn:get('titleEn'),titleHe:get('titleHe'),speaker:get('speaker'),speakerEn:get('speakerEn'),speakerHe:get('speakerHe'),rabbi:get('rabbi'),lecturer:get('lecturer'),topic:get('topic'),topicEn:get('topicEn'),topicHe:get('topicHe'),description:get('description'),program:get('program'),showcaseId:get('showcaseId'),location:get('location'),lectureDate:get('lectureDate'),year:get('year'),language:get('language'),category:get('category'),series:get('series'),parsha:get('parsha'),organization:get('organization'),shiurCode:String(get('shiurCode')||'').trim()||shiurCatalogCode(e)};
  const isAudio=e._adminMediaKind==='audio'; const id=isAudio?rawAudioId(e):String(e.id||e.vimeoId);
  try {
    const data=await apiJson(isAudio?'/admin/audio':'/admin/video',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(isAudio?{audioId:id,item}:{videoId:id,item})});
    if(isAudio){
      const updated=enrichAudio({...e,...(data.item||item),_adminMediaKind:undefined});
      const aid=rawAudioId(updated);
      state.audioById.set(aid,updated);
      state.audioItems=state.audioItems.map(a=>rawAudioId(a)===aid?updated:a);
      // Confirm against the public endpoint immediately. The timestamp also bypasses
      // any stale WebView/browser entry left from an older Worker deployment.
      try {
        const fresh=await publicJson(`/audio-map?_admin_refresh=${Date.now()}`);
        state.audioItems=(fresh.items||[]).map(enrichAudio).sort((x,y)=>itemDate(y)-itemDate(x));
        state.audioById=new Map(state.audioItems.map(audio=>[rawAudioId(audio),audio]));
      } catch(refreshError) {
        console.warn('Audio edit saved; public refresh will retry on next load.',refreshError);
      }
    } else {
      const updated=enrichVideo({...e,...(data.item||item),_adminMediaKind:undefined});
      const vid=videoId(updated);state.videoById.set(vid,updated);state.videos=state.videos.map(v=>videoId(v)===vid?updated:v);
    }
    state.adminVideoEditor=null;setToast('Shiur updated and live.');render();
  } catch(error){setToast(error?.message||'Could not save shiur.');}
}

function adminEditorHtml(){
  let html='';
  if(state.adminScheduleEditor){const e=state.adminScheduleEditor.event||{};const f=(name,label,type='text',wide=false)=>`<label class="${wide?'full':''}">${label}<input data-admin-schedule-field="${name}" type="${type}" value="${esc(e[name]||'')}"></label>`;html+=`<div class="admin-editor-backdrop"><section class="admin-editor-sheet"><div class="admin-editor-head"><div><span>ADMIN</span><h2>${state.adminScheduleEditor.baseKey?'Edit Schedule Item':'Add Schedule Item'}</h2></div><button data-admin-editor-close="schedule">×</button></div><form id="adminScheduleEditorForm" class="admin-form-grid">${f('date','Date','date')}${f('startTime','Start Time','time')}${f('endTime','End Time','time')}${f('location','Location')}${f('venue','Venue')}${f('speaker','Speaker', 'text', true)}${f('speakerEn','Speaker (English)')}${f('speakerHe','Speaker (Hebrew)')}${f('title','Title','text',true)}${f('titleEn','Title (English)')}${f('titleHe','Title (Hebrew)')}${f('topicEn','Topic (English)')}${f('topicHe','Topic (Hebrew)')}${f('dateLabel','Date Label')}${f('hebrewDate','Hebrew Date')}${f('language','Language')}${f('year','Year')}${f('program','Program')}${f('shiurCode','Shiur Code')}<div class="admin-form-actions full"><button type="button" data-admin-editor-close="schedule">Cancel</button><button class="admin-save" type="submit">Save</button></div></form></section></div>`;}
  if(state.adminPaidEditor){const e=state.adminPaidEditor;html+=`<div class="admin-editor-backdrop"><section class="admin-editor-sheet"><div class="admin-editor-head"><div><span>ADMIN</span><h2>${e.id?'Edit Paid Shiur':'Add Paid Shiur'}</h2></div><button data-admin-editor-close="paid">×</button></div><form id="adminPaidEditorForm" class="admin-form-grid"><label>Product ID<input id="adminPaidId" value="${esc(e.id||'')}" ${e.id?'readonly':''} placeholder="Auto-generated if blank"></label><label>Price ($)<input id="adminPaidPrice" type="number" min="0" step="0.01" value="${esc((Number(e.priceCents||0)/100)||'')}"></label><label class="full">English Title<input id="adminPaidTitleEn" required value="${esc(e.titleEn||e.title||'')}"></label><label class="full">Hebrew Title<input id="adminPaidTitleHe" dir="rtl" required value="${esc(e.titleHe||'')}"></label><label class="full">Speaker<input id="adminPaidSpeaker" value="${esc(e.speaker||'')}"></label><label>Category<input id="adminPaidCategory" value="${esc(e.category||'')}"></label><label>Audience<input id="adminPaidAudience" value="${esc(e.audience||'')}"></label><label class="full">Catalog Details<input id="adminPaidDetails" value="${esc(e.catalogDetails||'')}"></label><label class="full">Description<textarea id="adminPaidDescription">${esc(e.description||'')}</textarea><small>Formatting: **bold**, _italic_, blank lines for spacing, and - item for bullets.</small></label><label class="full">Drive Matching Aliases<textarea id="adminPaidAliases" placeholder="One per line">${esc((e.driveAliases||[]).join('\n'))}</textarea></label><label class="admin-checkbox full"><input id="adminPaidFeatured" type="checkbox" ${e.featured?'checked':''}> Featured product</label><div class="admin-form-actions full"><button type="button" data-admin-editor-close="paid">Cancel</button><button class="admin-save" type="submit">Save</button></div></form></section></div>`;}
  if(state.adminVideoEditor){
    const e=state.adminVideoEditor; const isAudio=e._adminMediaKind==='audio'; const val=(...keys)=>keys.map(k=>e[k]).find(v=>v!=null&&String(v)!=='')||'';
    const field=(name,label,value,wide=false,type='text',suggest=true)=>`<label class="${wide?'full':''}">${label}<input data-admin-video-field="${name}" type="${type}" value="${esc(value)}" ${suggest&&ADMIN_MEDIA_ADD_LABELS[name]?`list="admin-${name}-options" data-admin-option-add="${esc(ADMIN_MEDIA_ADD_LABELS[name])}"`:''}></label>`;
    html+=`<div class="admin-editor-backdrop"><section class="admin-editor-sheet"><div class="admin-editor-head"><div><span>ADMIN</span><h2>Edit Shiur${isAudio?' · Audio':''}</h2></div><button data-admin-editor-close="video">×</button></div><form id="adminVideoEditorForm" class="admin-form-grid"><label class="admin-lecture-date-panel full"><div class="admin-lecture-date-copy"><strong>${currentLanguage()==='he'?'תאריך השיעור':'Lecture Date'}</strong><span>${currentLanguage()==='he'?'ערכו את התאריך שבו נמסר השיעור. תאריך זה נפרד מתאריך ההעלאה.':'Edit the date this shiur was given. This is separate from the upload date.'}</span></div><input data-admin-video-field="lectureDate" type="date" value="${esc(adminLectureDateValue(e))}" required></label>${field('title','Title',val('title'),true)}${field('titleEn','Title (English)',val('titleEn'))}${field('titleHe','Title (Hebrew)',val('titleHe'))}${field('speaker','Speaker',val('speaker','_speakerLabel'),true)}${field('speakerEn','Speaker (English)',val('speakerEn'))}${field('speakerHe','Speaker (Hebrew)',val('speakerHe'))}${field('rabbi','Alternate / Rabbi Name',val('rabbi'))}${field('lecturer','Lecturer',val('lecturer'))}${field('topic','Topic',val('topic','_topicLabel'),true)}${field('topicEn','Topic (English)',val('topicEn'))}${field('topicHe','Topic (Hebrew)',val('topicHe'))}<label class="full">Description<textarea data-admin-video-field="description">${esc(val('description'))}</textarea></label>${field('program','Program / Series',val('program','showcase'))}${!isAudio?field('showcaseId','Showcase ID',val('showcaseId')):''}${field('location','Location',val('location','_location'))}${field('year','Year',val('year','_year'))}${field('language','Language',val('language','_language'))}${field('category','Category',val('category'))}${field('series','Series',val('series'))}${field('parsha','Parsha',val('parsha'))}${field('organization','Organization',val('organization'))}${field('shiurCode','Shiur Code',val('shiurCode'))}${adminMediaDatalistsHtml()}<div class="admin-form-actions full"><button type="button" data-admin-editor-close="video">Cancel</button><button class="admin-save" type="submit">Save</button></div></form></section></div>`;
  }
  if(state.adminReviewEditor){const rows=state.adminReviewEditor.events||[];const rowHtml=(e,i)=>`<div class="review-event-row" data-review-row="${i}"><div class="review-row-head"><strong>Lecture ${i+1}</strong><button type="button" data-review-remove="${i}">Remove</button></div><div class="admin-form-grid"><label>Date<input data-review-field="date" type="date" value="${esc(e.date||'')}"></label><label>Start<input data-review-field="startTime" type="time" value="${esc(e.startTime||'')}"></label><label>End<input data-review-field="endTime" type="time" value="${esc(e.endTime||'')}"></label><label>Location<input data-review-field="location" value="${esc(e.location||'')}"></label><label class="full">Venue<input data-review-field="venue" value="${esc(e.venue||'')}"></label><label class="full">Speaker<input data-review-field="speaker" value="${esc(e.speaker||'')}"></label><label class="full">Title<input data-review-field="title" value="${esc(e.title||'')}"></label><label>Date Label<input data-review-field="dateLabel" value="${esc(e.dateLabel||'')}"></label><label>Hebrew Date<input data-review-field="hebrewDate" value="${esc(e.hebrewDate||'')}"></label><label>Program<input data-review-field="program" value="${esc(e.program||'')}"></label><label>Language<input data-review-field="language" value="${esc(e.language||'')}"></label><label>Year<input data-review-field="year" value="${esc(e.year||'')}"></label><label>Shiur Code<input data-review-field="shiurCode" value="${esc(e.shiurCode||'')}"></label></div></div>`;html+=`<div class="admin-editor-backdrop"><section class="admin-editor-sheet review-editor-sheet"><div class="admin-editor-head"><div><span>SCHEDULE REVIEW</span><h2>Edit Detected Lectures</h2></div><button data-admin-editor-close="review">×</button></div><form id="adminReviewEditorForm"><div class="review-events-wrap">${rows.length?rows.map(rowHtml).join(''):'<div class="empty">No candidate lectures were detected. Add one manually or use Mark No Schedule.</div>'}</div><button type="button" class="admin-inline-add" data-review-add="1">+ Add Lecture</button><label class="review-note">Review Note<textarea id="reviewNote">${esc(state.adminReviewEditor.note||'')}</textarea></label><div class="admin-form-actions"><button type="button" data-admin-editor-close="review">Cancel</button><button class="admin-save" type="submit">Approve Schedule</button></div></form></section></div>`;}
  return html;
}

function accountHtml() {
  if (!state.user) return authHtml();
  const body = state.accountSection === 'following' ? accountFollowingHtml()
    : state.accountSection === 'settings' ? accountSettingsHtml()
    : state.accountSection === 'purchases' ? accountPurchasesHtml()
    : state.accountSection === 'admin' && state.isAdmin ? accountAdminHtml()
    : accountProfileHtml();
  const adminTab=state.isAdmin?`<button data-account-section="admin" class="${state.accountSection==='admin'?'active':''}">Admin</button>`:'';
  return `<div class="page-title"><h1>My Account</h1><p>Manage your Irgun Shiurai Torah account.</p></div>
    <div class="segmented account-tabs"><button data-account-section="profile" class="${state.accountSection === 'profile' ? 'active' : ''}">${tr('Profile')}</button><button data-account-section="following" class="${state.accountSection === 'following' ? 'active' : ''}">Following</button><button data-account-section="settings" class="${state.accountSection === 'settings' ? 'active' : ''}">Settings</button><button data-account-section="purchases" class="${state.accountSection === 'purchases' ? 'active' : ''}">Purchased</button>${adminTab}</div>
    ${body}`;
}

function authHtml() {
  const forgotMode = state.authMode === 'forgot';
  const verifyMode = state.authMode === 'verify';
  const registerMode = state.authMode === 'register';

  if (forgotMode) {
    return `<div class="page-title"><h1>Forgot Password</h1><p>Enter the email address on your account.</p></div>
      <div class="account-card auth-card">
        ${state.authMessage ? `<div class="form-message">${esc(state.authMessage)}</div>` : ''}
        <form id="forgotPasswordForm" class="form-stack">
          <label>Email<input id="forgotEmail" type="email" autocomplete="email" required></label>
          <button class="form-submit" type="submit" ${state.authBusy ? 'disabled' : ''}>${state.authBusy ? 'Sending...' : 'Send Reset Link'}</button>
        </form>
        <button class="text-btn auth-switch" data-auth-mode="login">Back to Sign In</button>
        <button class="text-btn privacy-auth-link" data-nav="privacy">Privacy Policy</button>
      </div>`;
  }

  if (verifyMode) {
    return `<div class="page-title"><h1>Verify Email</h1><p>Enter the 6-digit code sent to your email.</p></div>
      <div class="account-card auth-card auth-code-card">
        ${state.authMessage ? `<div class="form-message">${esc(state.authMessage)}</div>` : ''}
        <p class="auth-code-email">Code sent to <strong>${esc(state.authVerifyEmail || '')}</strong></p>
        <form id="verifyEmailCodeForm" class="form-stack">
          <label>Verification Code<input id="authVerificationCode" class="auth-verification-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000" required></label>
          <button class="form-submit" type="submit" ${state.authBusy ? 'disabled' : ''}>${state.authBusy ? 'Please wait...' : 'Verify Email'}</button>
        </form>
        <button class="text-btn" data-resend-verification="1" ${state.authBusy ? 'disabled' : ''}>Resend Code</button>
        <button class="text-btn auth-switch" data-auth-mode="login">Back to Sign In</button>
      </div>`;
  }

  return `<div class="page-title"><h1>${registerMode ? 'Create Account' : 'Login'}</h1><p>${registerMode ? 'Create your Irgun Shiurai Torah account.' : 'Sign in to access your account.'}</p></div>
    <div class="account-card auth-card">
      ${state.authMessage ? `<div class="form-message">${esc(state.authMessage)}</div>` : ''}
      <form id="authForm" class="form-stack">
        ${registerMode ? '<label>Name<input id="authName" autocomplete="name" required></label>' : ''}
        <label>Email<input id="authEmail" type="email" autocomplete="email" required></label>
        <label>Password<input id="authPassword" type="password" autocomplete="current-password" minlength="6" required></label>
        <button class="form-submit" type="submit" ${state.authBusy ? 'disabled' : ''}>${state.authBusy ? 'Please wait...' : (registerMode ? 'Create Account' : 'Login')}</button>
      </form>
      <div class="auth-or"><span>or</span></div>
      ${typeof IS_IOS !== 'undefined' && IS_IOS ? `<button class="apple-auth-btn" data-apple-login="1" type="button" ${state.authBusy ? 'disabled' : ''}><svg class="apple-mark-svg" viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.5-26.5-46.5-41.1-83.7-43.9-35.2-2.8-73.7 20.5-87.8 20.5-14.9 0-49.1-19.5-72.2-19.5C63.3 142 4 191.8 4 293.8 4 324 9.5 355.2 20.5 387.5c14.7 42.3 67.8 145.8 123.3 144.1 29 .7 49.5-20.6 87.2-20.6 36.6 0 55.5 20.6 87.8 20.6 56 0 104.1-94.1 118.1-136.4-75-35.3-71-103.9-71-106.1zm-56.6-163.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 72 26.1 2 49.9-11.4 69.5-34.4z"/></svg><span>Continue with Apple</span></button>` : (typeof AppleSignIn !== 'undefined' ? `<button class="apple-auth-btn" data-apple-login="1" type="button" ${state.authBusy ? 'disabled' : ''}><svg class="apple-mark-svg" viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.5-26.5-46.5-41.1-83.7-43.9-35.2-2.8-73.7 20.5-87.8 20.5-14.9 0-49.1-19.5-72.2-19.5C63.3 142 4 191.8 4 293.8 4 324 9.5 355.2 20.5 387.5c14.7 42.3 67.8 145.8 123.3 144.1 29 .7 49.5-20.6 87.2-20.6 36.6 0 55.5 20.6 87.8 20.6 56 0 104.1-94.1 118.1-136.4-75-35.3-71-103.9-71-106.1zm-56.6-163.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 72 26.1 2 49.9-11.4 69.5-34.4z"/></svg><span>Continue with Apple</span></button>` : '')}
      <button class="google-auth-btn" data-google-login="1" type="button" ${state.authBusy ? 'disabled' : ''}>${googleGIcon()}<span>Continue with Google</span></button>
      ${!registerMode ? '<button class="text-btn forgot-link" data-auth-mode="forgot">Forgot password?</button>' : ''}
      <button class="text-btn auth-switch" data-auth-mode="${registerMode ? 'login' : 'register'}">${registerMode ? 'Already have an account? Sign in' : "Don't have an account? Create account"}</button>
      <button class="text-btn privacy-auth-link" data-nav="privacy">Privacy Policy</button>
    </div>`;
}

function relatedVideos(video) {
  if (!video) return [];
  const sameShowcase = state.videos.filter(v => videoId(v) !== videoId(video) && v.showcase && v.showcase === video.showcase);
  return sameShowcase.sort((a, b) => {
    const weekDiff = Number(state.trends.week.get(videoId(b)) || 0) - Number(state.trends.week.get(videoId(a)) || 0);
    if (weekDiff) return weekDiff;
    const monthDiff = Number(state.trends.month.get(videoId(b)) || 0) - Number(state.trends.month.get(videoId(a)) || 0);
    return monthDiff || itemDate(b) - itemDate(a);
  }).slice(0, 8);
}

function currentFollowButtons(video) {
  if (!video) return '';
  const buttons = [];
  for (const speakerId of video._speakerIds || []) {
    const label = speakerLabel(speakerId);
    if (!label) continue;
    const following = state.follows.has(`speaker:${speakerId}`);
    buttons.push(`<button class="follow-chip ${following ? 'active' : ''}" data-follow-type="speaker" data-follow-key="${esc(speakerId)}" data-follow-label="${esc(label)}">${following ? 'Following' : 'Follow'} ${esc(label)}</button>`);
  }
  if (video._topicId) {
    const label = topicLabel(video._topicId);
    if (label) {
      const following = state.follows.has(`topic:${video._topicId}`);
      buttons.push(`<button class="follow-chip ${following ? 'active' : ''}" data-follow-type="topic" data-follow-key="${esc(video._topicId)}" data-follow-label="${esc(label)}">${following ? 'Following' : 'Follow'} ${esc(label)}</button>`);
    }
  }
  return buttons.join('');
}

function commentsHtml() {
  if (state.watchCommentsLoading) return '<div class="loading-small">Loading comments...</div>';
  if (state.watchCommentsError) return `<div class="empty comment-error-state"><p>${esc(state.watchCommentsError)}</p><button type="button" class="small-btn primary" data-retry-comments="1">Try Again</button></div>`;
  if (!state.watchComments.length) return '<div class="empty">No comments yet. Be the first to share your thoughts!</div>';
  return state.watchComments.map(comment => {
    const owner = state.user && String(comment.user_id) === String(state.user.id);
    const editing = owner && String(state.editingCommentId) === String(comment.id);
    return `<article class="comment-card">
      <div class="comment-head"><strong>${esc(comment.author || 'Anonymous')}</strong><span>${esc(fmtDate(comment.created))}</span></div>
      ${editing
        ? `<div class="comment-edit-box"><textarea id="editCommentText-${esc(comment.id)}">${esc(comment.text || '')}</textarea><div class="comment-actions"><button class="comment-save" data-save-comment="${esc(comment.id)}">Save</button><button data-cancel-comment="${esc(comment.id)}">Cancel</button></div></div>`
        : `<p>${esc(comment.text || '')}</p>${owner ? `<div class="comment-actions"><button data-edit-comment="${esc(comment.id)}">Edit</button><button data-delete-comment="${esc(comment.id)}">Delete</button></div>` : ''}`}
    </article>`;
  }).join('');
}

function watchVimeoEmbedSrc(video, resumeSeconds = 0) {
  const id = encodeURIComponent(String(video?.vimeoId || video?.id || '').replace(/\D/g, ''));
  const seconds = Math.max(0, Math.floor(Number(resumeSeconds) || 0));
  const hash = seconds > 1 ? `#t=${seconds}s` : '';
  const muted = state.watchAudioToVideoHandoff ? '&muted=1' : '';
  return `https://player.vimeo.com/video/${id}?playsinline=1&autoplay=1&title=0&byline=0&portrait=0${muted}${hash}`;
}

async function setVimeoHandoffMuted(player, muted) {
  if (!player) return;
  try {
    if (typeof player.setMuted === 'function') {
      await Promise.race([
        Promise.resolve(player.setMuted(Boolean(muted))).catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 120))
      ]);
      return;
    }
  } catch (_) {}
  try {
    if (typeof player.setVolume === 'function') {
      await Promise.race([
        Promise.resolve(player.setVolume(muted ? 0 : 1)).catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 120))
      ]);
    }
  } catch (_) {}
}

async function finishAudioToVideoHandoff(videoKey, player = state.watchVimeo) {
  const key = String(videoKey || '');
  // Vimeo's play event and the readiness waiter can hit this simultaneously. If
  // they are finishing the same lecture, share the transaction. If an older
  // lecture is still winding down, wait for it before evaluating the new handoff
  // instead of borrowing the wrong promise.
  if (state.watchAudioToVideoCommitPromise) {
    if (String(state.watchAudioToVideoCommitPromiseId || '') === key) return state.watchAudioToVideoCommitPromise;
    try { await state.watchAudioToVideoCommitPromise; } catch (_) {}
  }
  if (!state.watchAudioToVideoHandoff) return state.watchMode === 'video';
  if (state.watchAudioToVideoHandoffId && String(state.watchAudioToVideoHandoffId) !== key) return false;

  state.watchAudioToVideoCommitBusy = true;
  state.watchAudioToVideoCommitPromiseId = key;
  const commitPromise = (async () => {
    try {
      if (usesNativeUnifiedAudio()) {
        const position = await Promise.resolve(player?.getCurrentTime?.()).catch(()=>state.watchResumeSeconds||0);
        const duration = await Promise.resolve(player?.getDuration?.()).catch(()=>Number(state.watchVideo?.duration)||0);
        // Keep Vimeo muted until Media3 confirms VIDEO authority. If native authority
        // cannot switch, native audio remains the only audible source and the caller
        // can safely restore Audio mode without ever producing double audio.
        await PlaybackController.switchAuthorityToVideo(position, duration, true);
        await setVimeoHandoffMuted(player, false);
      } else {
        // Web/iOS has no native authority transaction to confirm. Make the already-
        // synchronized Vimeo audible first, then pause HTML audio to avoid a gap.
        await setVimeoHandoffMuted(player, false);
        if (!audio.paused) audio.pause();
      }
      state.current = null;
      state.playerOpen = false;
      state.audioLastHistoryAt = 0;
      state.watchAudioToVideoHandoff = false;
      state.watchAudioToVideoHandoffId = '';
      state.watchAudioToVideoTargetSeconds = 0;
      console.debug('[Playback] AUDIO -> VIDEO handoff complete');
      return true;
    } catch (error) {
      // Do not hide a native authority failure. Re-mute Vimeo so the still-valid
      // audio source remains authoritative and let the caller abort/retry cleanly.
      await setVimeoHandoffMuted(player, true);
      console.warn('[Playback] AUDIO -> VIDEO authority commit failed', error);
      throw error;
    } finally {
      state.watchAudioToVideoCommitBusy = false;
      if (state.watchAudioToVideoCommitPromise === commitPromise) {
        state.watchAudioToVideoCommitPromise = null;
        state.watchAudioToVideoCommitPromiseId = '';
      }
    }
  })();
  state.watchAudioToVideoCommitPromise = commitPromise;
  return commitPromise;
}

async function waitForVimeoHandoffReady(player, videoKey, timeoutMs = 4000) {
  const deadline = Date.now() + Math.max(800, Number(timeoutMs) || 4000);
  let lastPosition = null;
  while (Date.now() < deadline) {
    if (!state.watchAudioToVideoHandoff || String(state.watchAudioToVideoHandoffId || '') !== String(videoKey || '')) {
      // The Vimeo 'play' event may have completed the transaction while this
      // waiter was sleeping. Treat that as success, not a handoff failure.
      const committedPosition = Number(await Promise.resolve(player?.getCurrentTime?.()).catch(()=>state.watchResumeSeconds||0));
      return Number.isFinite(committedPosition) ? committedPosition : Math.max(0, Number(state.watchResumeSeconds)||0);
    }
    const sourceNow = Math.max(0, playbackPositionSeconds() || Number(state.watchAudioToVideoTargetSeconds) || 0);
    const [paused, current] = await Promise.all([
      Promise.resolve(player?.getPaused?.()).catch(()=>true),
      Promise.resolve(player?.getCurrentTime?.()).catch(()=>null)
    ]);
    let videoNow = Number(current);
    if (Number.isFinite(videoNow) && Math.abs(videoNow - sourceNow) > 0.75) {
      const corrected = await Promise.race([
        Promise.resolve(player.setCurrentTime(sourceNow)).catch(()=>null),
        new Promise(resolve=>setTimeout(()=>resolve(null),900))
      ]);
      if (Number.isFinite(Number(corrected))) videoNow = Number(corrected);
    }
    if (!paused && Number.isFinite(videoNow) && Math.abs(videoNow - sourceNow) <= 0.75) {
      // Confirm the destination clock is live, not merely a resolved play() call.
      await new Promise(resolve=>setTimeout(resolve,120));
      const again = Number(await Promise.resolve(player.getCurrentTime()).catch(()=>videoNow));
      const stillSource = Math.max(0, playbackPositionSeconds() || sourceNow);
      if (Number.isFinite(again) && again >= videoNow - 0.10 && Math.abs(again - stillSource) <= 0.85) {
        return again;
      }
      lastPosition = again;
    } else {
      lastPosition = videoNow;
    }
    await new Promise(resolve=>setTimeout(resolve,90));
  }
  console.warn('[Playback] Vimeo destination did not become synchronized before timeout', lastPosition);
  return null;
}

function videoAudioPlaybackItem(video, id) {
  const sourceId = mediaApiId(video, id);
  return {
    kind: 'video-audio',
    id: String(id),
    sourceId,
    title: displayShiurTitle(video.title, 'Shiur'),
    subtitle: [video.showcase, video._speakerLabel, video._topicLabel].filter(Boolean).join(' - '),
    thumbnail: video.thumbnail || '',
    url: audioUrl(sourceId)
  };
}

function waitForMediaEvent(target, eventName, timeoutMs = 1200) {
  return new Promise(resolve => {
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      try { target.removeEventListener(eventName, onEvent); } catch (_) {}
      try { target.removeEventListener('error', onError); } catch (_) {}
      clearTimeout(timer);
      resolve(value);
    };
    const onEvent = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    target.addEventListener(eventName, onEvent, { once:true });
    target.addEventListener('error', onError, { once:true });
  });
}

function parkHostedVideoForAudio() {
  if (!persistentVideoMount || !state.watchVimeo || !persistentVideoMount.querySelector('#watchVimeoFrame')) return false;
  persistentVideoMount.className = 'persistent-video-mount watch-video-host watch-audio-parked';
  document.body.classList.remove('irgun-watch-mini-hosted');
  state.watchHostedExternally = false;
  state.watchMinimized = false;
  return true;
}

function restoreParkedHostedVideo() {
  if (!persistentVideoMount || !state.watchVimeo || !persistentVideoMount.querySelector('#watchVimeoFrame')) return false;
  persistentVideoMount.className = 'persistent-video-mount watch-video-host watch-full-host';
  document.body.classList.remove('irgun-watch-mini-hosted');
  state.watchHostedExternally = true;
  state.watchMinimized = false;
  return true;
}

async function switchVideoToAudioSeamlessly(video, id) {
  const player = state.watchVimeo;
  if (usesNativeUnifiedAudio()) {
    const previousCurrent = state.current;
    let exact = await quickVimeoTime(state.watchResumeSeconds || 0, 350);
    let wasPlaying = Boolean(state.watchVideoPlaying);
    if (player && typeof player.getPaused === 'function') {
      try {
        const paused = await Promise.race([
          Promise.resolve(player.getPaused()).catch(() => !wasPlaying),
          new Promise(resolve => setTimeout(() => resolve(!wasPlaying), 180))
        ]);
        wasPlaying = !Boolean(paused);
      } catch (_) {}
    }

    const base = videoAudioPlaybackItem(video, id);
    const offlineRecord = offlineRecordForAudioItem(base);
    const networkUrl = base.networkUrl || base.url;
    const localUrl = offlineFileUrl(offlineRecord);
    let item = localUrl
      ? { ...base, url:localUrl, networkUrl, nativeBackgroundUrl:offlineRecord?.uri || '', offline:true, offlineKey:offlineRecord.key }
      : { ...base, networkUrl, offline:false };

    try {
      console.debug(`[Playback] VIDEO -> AUDIO direct switch requested at ${exact.toFixed(2)}s`);
      setPlaybackAuthorityFence('AUDIO', id, 5000);
      state.watchVideoToAudioHandoff = true;

      // The normal Listen button already proves this direct Media3 path works on
      // the device. Use that same committed start here instead of the V15.1.4
      // muted prepare/play/commit transaction that could get stuck with no sound.
      // Pause Vimeo only when we are ready to start the native source; if startup
      // fails we immediately resume Vimeo below.
      if (player) {
        await Promise.race([
          Promise.resolve(player.pause()).catch(() => {}),
          new Promise(resolve => setTimeout(resolve, 220))
        ]);
      }

      state.current = item;
      await PlaybackController.loadLecture(item, exact, true);
      let started = await PlaybackController.startAudioAt(exact, wasPlaying, { volume:1, commit:true });

      // The bridge resolving means Media3 accepted the source. isPlaying can still
      // be false while the player is BUFFERING, so runtime errors (not an immediate
      // isPlaying snapshot) decide whether recovery is needed.
      state.nativePlayback = { ...state.nativePlayback, ...(started || {}), mode:'AUDIO', connected:true };
      state.watchResumeSeconds = Math.max(0, Number(started?.currentPositionMs) || Number(started?.audioPositionMs) || exact * 1000) / 1000;
      state.watchMode = 'audio';
      state.watchVideoPlaying = false;
      state.watchVideoToAudioHandoff = false;
      state.watchAudioToVideoHandoff = false;
      state.watchAudioToVideoHandoffId = '';
      state.watchAudioToVideoTargetSeconds = 0;
      parkHostedVideoForAudio();
      state.playerOpen = false;
      console.debug('[Playback] VIDEO -> AUDIO direct switch complete');
      render();
      updatePlayerUi();
      state.audioLastHistoryAt = 0;
      if (state.user) saveHistory(id, 'audio', state.watchResumeSeconds, nativeAudioDurationSeconds() || Number(video.duration)||0, false, { reconcile:true }).catch(()=>{});
      return true;
    } catch (error) {
      console.warn('[Playback] VIDEO -> AUDIO direct switch failed; restoring Vimeo', error);
      // If a local offline URI was the problem, retry the same proven direct path
      // once using the network URL before falling back to Vimeo.
      if (item?.offline && item?.networkUrl && navigator.onLine !== false) {
        try {
          item = { ...item, offline:false, url:item.networkUrl, nativeBackgroundUrl:'' };
          state.current = item;
          const started = await PlaybackController.loadLecture(item, exact, true)
            .then(() => PlaybackController.startAudioAt(exact, wasPlaying, { volume:1, commit:true }));
          state.nativePlayback = { ...state.nativePlayback, ...(started || {}), mode:'AUDIO', connected:true };
          state.watchResumeSeconds = Math.max(0, Number(started?.currentPositionMs) || Number(started?.audioPositionMs) || exact * 1000) / 1000;
          state.watchMode = 'audio';
          state.watchVideoPlaying = false;
          state.watchVideoToAudioHandoff = false;
          state.watchAudioToVideoHandoff = false;
          state.watchAudioToVideoHandoffId = '';
          state.watchAudioToVideoTargetSeconds = 0;
          parkHostedVideoForAudio();
          state.playerOpen = false;
          render();
          updatePlayerUi();
          state.audioLastHistoryAt = 0;
          if (state.user) saveHistory(id, 'audio', state.watchResumeSeconds, nativeAudioDurationSeconds() || Number(video.duration)||0, false, { reconcile:true }).catch(()=>{});
          setToast(currentLanguage()==='he'?'הקובץ השמור לא נפתח; עברנו להזרמה.':'Saved copy could not play; switched to streaming.');
          return true;
        } catch (_) {}
      }
      state.watchVideoToAudioHandoff = false;
      state.current = previousCurrent;
      setPlaybackAuthorityFence('VIDEO', id, 2500);
      try { await nativeMediaPlugin().stopAudio({ clearLecture:false }); } catch (_) {}
      if (wasPlaying && player) await player.play().catch(()=>{});
      return false;
    }
  }
  const previousCurrent = state.current;
  const previousMuted = Boolean(audio.muted);
  let exact = await quickVimeoTime(state.watchResumeSeconds || 0, 350);
  state.watchResumeSeconds = exact;
  let wasPlaying = Boolean(state.watchVideoPlaying);
  if (player && typeof player.getPaused === 'function') {
    try {
      const paused = await Promise.race([
        Promise.resolve(player.getPaused()).catch(() => !wasPlaying),
        new Promise(resolve => setTimeout(() => resolve(!wasPlaying), 180))
      ]);
      wasPlaying = !Boolean(paused);
    } catch (_) {}
  }

  const base = videoAudioPlaybackItem(video, id);
  const offlineRecord = offlineRecordForAudioItem(base);
  const networkUrl = base.networkUrl || base.url;
  const localUrl = offlineFileUrl(offlineRecord);
  const item = localUrl
    ? { ...base, url:localUrl, networkUrl, nativeBackgroundUrl:offlineRecord?.uri || '', offline:true, offlineKey:offlineRecord.key }
    : { ...base, networkUrl, offline:false };

  try {
    state.current = item;
    const sameSource = audio.src === item.url || audio.currentSrc === item.url;
    audio.preload = 'auto';
    audio.playbackRate = state.playbackSpeed;
    audio.muted = true;
    if (!sameSource) {
      audio.src = item.url;
      audio.load();
    }

    // IMPORTANT: do not call play() at 0:00 and seek afterward. Wait until the
    // MP3 metadata exists, seek the silent engine to the live Vimeo clock first,
    // and only then start playback. On a Range-capable source this lets the
    // browser request the correct part of the MP3 immediately.
    if (audio.readyState < 1) {
      const metadataReady = await waitForMediaEvent(audio, 'loadedmetadata', 3600);
      if (!metadataReady && audio.readyState < 1) throw new Error('Audio metadata did not load');
    }

    const seekToLiveVideoClock = () => {
      const live = Math.max(0, Number(state.watchResumeSeconds) || exact || 0);
      try {
        const cap = Number.isFinite(audio.duration) && audio.duration > 1 ? Math.max(0, audio.duration - 1) : live;
        audio.currentTime = Math.min(live, cap);
      } catch (_) {}
      return live;
    };

    exact = Math.max(0, Number(state.watchResumeSeconds) || exact || 0);
    if (Math.abs((Number(audio.currentTime) || 0) - exact) > 0.35) {
      const seeked = waitForMediaEvent(audio, 'seeked', 1800);
      seekToLiveVideoClock();
      await seeked;
    } else {
      seekToLiveVideoClock();
    }

    if (wasPlaying) {
      const playingWait = waitForMediaEvent(audio, 'playing', 4200);
      const playOk = await audio.play().then(() => true).catch(() => false);
      if (!playOk && audio.paused) throw new Error('Audio handoff did not start');
      if (audio.readyState < 3) await playingWait;

      // Vimeo deliberately kept playing while the MP3 became seekable. Make one
      // final small catch-up seek while the MP3 is still muted, then freeze Vimeo.
      exact = Math.max(0, Number(state.watchResumeSeconds) || exact || 0);
      if (Math.abs((Number(audio.currentTime) || 0) - exact) > 0.70) {
        const seeked = waitForMediaEvent(audio, 'seeked', 1200);
        seekToLiveVideoClock();
        await seeked;
      }
      if (audio.paused) {
        const restarted = await audio.play().then(() => true).catch(() => false);
        if (!restarted) throw new Error('Audio handoff could not resume');
      }
    } else {
      audio.pause();
    }

    // Freeze the video only after the replacement audio is ready at the same clock.
    exact = Math.max(0, Number(state.watchResumeSeconds) || exact || 0);
    if (player) {
      try {
        await Promise.race([
          Promise.resolve(player.pause()).catch(() => {}),
          new Promise(resolve => setTimeout(resolve, 140))
        ]);
      } catch (_) {}
    }
    audio.muted = previousMuted;
    setupMediaSession(item);
    state.watchResumeSeconds = Math.max(0, Number(audio.currentTime) || exact || 0);
    state.watchMode = 'audio';
    state.watchVideoPlaying = false;
    state.watchAudioToVideoHandoff = false;
    state.watchAudioToVideoHandoffId = '';
    state.watchAudioToVideoTargetSeconds = 0;
    parkHostedVideoForAudio();
    state.playerOpen = false;
    render();
    updatePlayerUi();
    state.audioLastHistoryAt = 0;
    if (state.user) saveHistory(id, 'audio', state.watchResumeSeconds, playbackDurationSeconds() || Number(video.duration) || 0, false, { reconcile:true }).catch(() => {});
    return true;
  } catch (error) {
    console.warn('Seamless Video -> Audio handoff failed', error);
    try { audio.pause(); } catch (_) {}
    audio.muted = previousMuted;
    state.current = previousCurrent;
    return false;
  }
}

async function resumeParkedVideoFromAudio(video, id, shouldPlay) {
  const player = state.watchVimeo;
  if (!player) return false;
  if (usesNativeUnifiedAudio()) {
    try {
      let target = playbackPositionSeconds() || Number(state.watchResumeSeconds) || 0;
      state.watchResumeSeconds = target;
      state.watchAudioToVideoHandoff = Boolean(shouldPlay);
      state.watchAudioToVideoHandoffId = shouldPlay ? id : '';
      state.watchAudioToVideoTargetSeconds = shouldPlay ? target : 0;
      console.debug(`[Playback] AUDIO -> VIDEO requested at ${target.toFixed(2)}s`);
      await setVimeoHandoffMuted(player, true);
      if (typeof player.setPlaybackRate === 'function') await player.setPlaybackRate(Number(state.playbackSpeed)||1).catch(()=>{});

      let current = await Promise.race([
        Promise.resolve(player.getCurrentTime()).catch(()=>null),
        new Promise(resolve=>setTimeout(()=>resolve(null),250))
      ]);
      if (!Number.isFinite(Number(current)) || Math.abs(Number(current)-target) > 0.75) {
        current = await Promise.race([
          Promise.resolve(player.setCurrentTime(target)).catch(()=>null),
          new Promise(resolve=>setTimeout(()=>resolve(null),1800))
        ]);
      }

      if (shouldPlay) {
        // Native audio remains audible while Vimeo seeks and starts muted. A
        // resolved Vimeo play() promise is not enough; confirm the destination
        // clock is actually running and within the drift allowance first.
        const played = await Promise.race([
          Promise.resolve(player.play()).then(()=>true).catch(()=>false),
          new Promise(resolve=>setTimeout(()=>resolve(false),2200))
        ]);
        if (!played) throw new Error('Vimeo did not accept play');
        const readyPosition = await waitForVimeoHandoffReady(player, id, 4200);
        if (!Number.isFinite(Number(readyPosition))) throw new Error('Vimeo did not become ready at the synchronized position');
        current = Number(readyPosition);
        const finished = await finishAudioToVideoHandoff(id, player);
        if (!finished && state.watchAudioToVideoHandoff) throw new Error('Video handoff did not commit');
        state.watchVideoPlaying = true;
      } else {
        await Promise.resolve(player.pause()).catch(()=>{});
        await setVimeoHandoffMuted(player, false);
        const duration = await Promise.resolve(player.getDuration()).catch(()=>Number(video.duration)||0);
        await PlaybackController.switchAuthorityToVideo(Number(current)||target, duration, false);
        clearCurrentAudioStateForVideo();
        state.watchAudioToVideoHandoff = false;
        state.watchAudioToVideoHandoffId = '';
        state.watchVideoPlaying = false;
      }
      state.watchResumeSeconds = Math.max(0, Number(current)||target);
      refreshPersistentMiniVideoChrome();
      return true;
    } catch (error) {
      console.warn('[Playback] AUDIO -> VIDEO aborted; native audio remains source', error);
      state.watchAudioToVideoHandoff = false;
      state.watchAudioToVideoHandoffId = '';
      state.watchAudioToVideoTargetSeconds = 0;
      // Keep Vimeo muted/paused on failure; native audio was never stopped.
      try { await player.pause(); } catch (_) {}
      return false;
    }
  }
  try {
    const target = Math.max(0, Number(audio.currentTime) || Number(state.watchResumeSeconds) || 0);
    state.watchResumeSeconds = target;
    state.watchAudioToVideoHandoff = Boolean(shouldPlay);
    state.watchAudioToVideoHandoffId = shouldPlay ? id : '';
    state.watchAudioToVideoTargetSeconds = shouldPlay ? target : 0;
    await setVimeoHandoffMuted(player, Boolean(shouldPlay));

    let current = await Promise.race([
      Promise.resolve(player.getCurrentTime()).catch(() => null),
      new Promise(resolve => setTimeout(() => resolve(null), 250))
    ]);
    let liveTarget = Math.max(0, Number(audio.currentTime) || target);
    if (!Number.isFinite(Number(current)) || Math.abs(Number(current) - liveTarget) > 0.65) {
      const actual = await Promise.race([
        Promise.resolve(player.setCurrentTime(liveTarget)).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 1700))
      ]);
      if (Number.isFinite(Number(actual))) current = Number(actual);
    }

    if (shouldPlay) {
      // Audio is still audible while Vimeo seeks/buffers. Refresh the target once
      // more immediately before play so a long audio-only stretch is not replayed.
      const newest = Math.max(0, Number(audio.currentTime) || liveTarget);
      if (Math.abs((Number(current) || 0) - newest) > 0.65) {
        const actual = await Promise.race([
          Promise.resolve(player.setCurrentTime(newest)).catch(() => null),
          new Promise(resolve => setTimeout(() => resolve(null), 1400))
        ]);
        if (Number.isFinite(Number(actual))) current = Number(actual);
        liveTarget = newest;
      }
      state.watchAudioToVideoTargetSeconds = liveTarget;
      const played = await Promise.race([
        Promise.resolve(player.play()).then(() => true).catch(() => false),
        new Promise(resolve => setTimeout(() => resolve(false), 1800))
      ]);
      if (!played) throw new Error('Video handoff did not start');
      state.watchVideoPlaying = true;
      await finishAudioToVideoHandoff(id, player);
    } else {
      await Promise.resolve(player.pause()).catch(() => {});
      await setVimeoHandoffMuted(player, false);
      state.watchVideoPlaying = false;
    }
    state.watchResumeSeconds = Math.max(0, Number(current) || liveTarget || target);
    refreshPersistentMiniVideoChrome();
    return true;
  } catch (error) {
    console.warn('Parked Audio -> Video handoff failed', error);
    state.watchAudioToVideoHandoff = false;
    state.watchAudioToVideoHandoffId = '';
    state.watchAudioToVideoTargetSeconds = 0;
    await setVimeoHandoffMuted(player, false);
    return false;
  }
}

function watchHtml() {
  const v = state.watchVideo;
  if (!v) return '';
  const id = videoId(v);
  const likeId = id;
  const liked = state.myLikes.has(likeId);
  const savePresentation = saveDestinationPresentation('video', id);
  const saved = savePresentation.savedForLater;
  const likeCount = Number(state.likeCounts[likeId]) || 0;
  const offlineState = v.hasAudio ? offlineActionState('video', id) : null;
  const related = relatedVideos(v);
  const miniSpeaker = v._speakerLabel || v.speaker || 'Irgun Shiurai Torah';
  return `<div class="watch-overlay">
    <div class="watch-host-mini-chrome" aria-hidden="true">
      <div class="watch-host-mini-video-hit" data-expand-watch="1" role="button" aria-label="Open video"></div>
      <div class="mini-video-copy" data-expand-watch="1" role="button" tabindex="0"><strong>${esc(displayShiurTitle(v.title, 'Shiur'))}</strong><span>${esc(miniSpeaker)}</span></div>
      <button class="mini-video-play" data-mini-video-play-toggle="1" aria-label="${state.watchVideoPlaying ? 'Pause' : 'Play'}">${state.watchVideoPlaying ? '<span class="pause-mark">II</span>' : svgIcon('play')}</button>
      <button class="mini-video-close" data-close-mini-video="1" aria-label="Close video">×</button>
    </div>
    <header class="watch-top"><button data-close-watch="1">Back</button><strong>${esc(displayShiurTitle(v.title, 'Shiur'))}</strong>${state.watchMode === 'video' ? `<div class="watch-top-media-actions"><button class="watch-minimize" data-minimize-watch="1" aria-label="Keep playing at bottom of app" title="Mini player">${svgIcon('minimize')}</button>${nativePipPlugin() ? `<button class="watch-pip" data-video-pip="1" aria-label="Picture in Picture" title="Picture in Picture">${svgIcon('pip')}</button>` : ''}</div>` : ''}</header>
    <div class="watch-scroll">
      <div class="watch-player-card">
        <div class="media-switch"><button data-watch-mode="video" class="${state.watchMode === 'video' ? 'active' : ''}">Video</button>${v.hasAudio ? `<button data-watch-mode="audio" class="${state.watchMode === 'audio' ? 'active' : ''}">Audio</button>` : ''}</div>
        ${state.watchMode === 'video'
          ? `<iframe id="watchVimeoFrame" class="watch-frame" data-start-seconds="${Math.max(0, Number(state.watchResumeSeconds) || 0)}" src="${watchVimeoEmbedSrc(v, state.watchResumeSeconds)}" loading="eager" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`
          : `<div class="watch-audio-panel">${logoArtworkHtml('large')}<input id="watchAudioSeek" class="seek" type="range" min="0" max="${playbackDurationSeconds()}" value="${playbackPositionSeconds()}" step="1"><div class="watch-audio-controls"><button class="skip-control" data-skip="-15">${svgIcon('back15')}</button><button class="watch-audio-play" data-play-toggle="1">${playbackIsPaused() ? svgIcon('play') + ' Play' : '<span class="pause-mark">II</span> Pause'}</button><button class="skip-control" data-skip="15">${svgIcon('forward15')}</button></div><div id="watchAudioTime" class="watch-audio-time">${fmtTime(playbackPositionSeconds())} / ${fmtDurationOrUnknown(playbackDurationSeconds())}</div></div>`}
      </div>
      <section class="watch-details">
        <h1>${esc(displayShiurTitle(v.title, ''))}</h1>
        <div class="watch-meta">${esc([v.showcase, fmtDate(v.lectureDate || v.date || v.created), v.duration ? fmtTime(v.duration) : '', v._speakerLabel, v._topicLabel].filter(Boolean).join(' - '))}</div>
        <div class="watch-actions compact-watch-actions">
          <button class="watch-action ${liked ? 'active' : ''}" data-like="${esc(likeId)}">${svgIcon('heart')}<span class="watch-action-text">${likeCount}</span></button>
          <button class="watch-action ${savePresentation.cls}" data-open-playlist-picker="1" data-playlist-kind="video" data-playlist-id="${esc(id)}">${svgIcon('bookmark')}<span class="watch-action-text">${tr(savePresentation.label)}</span></button>
          ${v.hasAudio ? (state.watchMode === 'audio' ? `<button class="watch-action" data-switch-video="${esc(id)}">${svgIcon('video')}<span class="watch-action-text">Video</span></button>` : `<button class="watch-action" data-switch-audio="${esc(id)}">${svgIcon('audio')}<span class="watch-action-text">Audio</span></button>`) : ''}
          <button class="watch-action" data-share-kind="video" data-share-id="${esc(id)}">${svgIcon('share')}<span class="watch-action-text">Share</span></button>
          <button class="watch-action" data-download-kind="video" data-download-id="${esc(id)}">${svgIcon('download')}<span class="watch-action-text">Download</span></button>
          ${offlineState ? `<button class="watch-action ${offlineState.cls}" data-save-offline-kind="video" data-save-offline-id="${esc(id)}">${offlineIconHtml('watch-offline-icon')}<span class="watch-action-text">${esc(offlineState.label)}</span>${offlineState.status==='downloading'?`<span class="offline-progress-badge">${Number(offlineState.job?.percent)>0?`${Number(offlineState.job.percent)}%`:'…'}</span>`:''}</button>` : ''}
        </div>
        ${currentFollowButtons(v) ? `<div class="follow-bar">${currentFollowButtons(v)}</div>` : ''}
        ${v.description ? `<p class="watch-description">${esc(v.description)}</p>` : ''}
      </section>
      <section class="watch-section">
        <div class="section-head"><h2 id="commentsHeading">Comments (${state.watchComments.length})</h2></div>
        <form id="commentForm" class="comment-form"><textarea id="commentText" placeholder="Leave a comment about this shiur..."></textarea><button type="submit">Post Comment</button></form>
        <div class="comments-list">${commentsHtml()}</div>
      </section>
      <section class="watch-section">
        <div class="section-head"><h2>Popular in This Series</h2></div>
        <div class="list">${related.length ? related.map(r => compactItem({ ...r, _kind: 'video' })).join('') : '<div class="empty">No other shiurim in this series.</div>'}</div>
      </section>
    </div>
  </div>`;
}

function miniVideoHtml(includeFrame = true) {
  const v = state.watchVideo;
  if (!v || state.watchMode !== 'video') return '';
  const speaker = v._speakerLabel || v.speaker || 'Irgun Shiurai Torah';
  const frameHtml = includeFrame ? `<iframe id="watchVimeoFrame" class="mini-video-frame" data-start-seconds="${Math.max(0, Number(state.watchResumeSeconds) || 0)}" src="${watchVimeoEmbedSrc(v, state.watchResumeSeconds)}" loading="eager" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>` : '';
  return `<div class="mini-video-player">
    <div class="mini-video-frame-wrap" data-expand-watch="1" role="button" aria-label="Open video">${frameHtml}</div>
    <div class="mini-video-copy" data-expand-watch="1" role="button" tabindex="0"><strong>${esc(displayShiurTitle(v.title, 'Shiur'))}</strong><span>${esc(speaker)}</span></div>
    <button class="mini-video-play" data-mini-video-play-toggle="1" aria-label="${state.watchVideoPlaying ? 'Pause' : 'Play'}">${state.watchVideoPlaying ? '<span class="pause-mark">II</span>' : svgIcon('play')}</button>
    <button class="mini-video-close" data-close-mini-video="1" aria-label="Close video">×</button>
  </div>`;
}

function miniPlayerHtml() {
  const c = state.current;
  return `<div class="mini-player" data-open-player="1">
    <div class="mini-progress"><span id="miniProgress"></span></div>
    <div class="mini-main">
      <button class="circle-btn" data-skip="-${state.skipSeconds}">-${state.skipSeconds}</button>
      <div class="mini-copy"><strong>${esc(c.title || 'Shiur')}</strong><span id="miniTime">${fmtTime(playbackPositionSeconds())} / ${fmtDurationOrUnknown(playbackDurationSeconds())}</span></div>
      <button class="circle-btn play" data-play-toggle="1">${playbackIsPaused() ? '&#9654;' : 'II'}</button>
      <button class="circle-btn" data-skip="${state.skipSeconds}">+${state.skipSeconds}</button>
    </div>
  </div>`;
}

function fullPlayerHtml() {
  const c = state.current;
  const isPaid = c.kind === 'paid-audio';
  const canWatch = c.kind === 'video-audio' && state.videoById.has(c.id);
  const likeId = c.kind === 'library-audio' ? `audio:${c.id}` : c.id;
  const liked = !isPaid && state.myLikes.has(likeId);
  const savePresentation = isPaid ? null : saveDestinationPresentation(c.kind === 'library-audio' ? 'audio' : 'video', c.id);
  const saved = Boolean(savePresentation?.savedForLater);
  const sourceItem = isPaid ? null : (c.kind === 'library-audio' ? state.audioById.get(String(c.id)) : state.videoById.get(String(c.id)));
  const offlineState = !isPaid ? offlineActionState(c.kind === 'library-audio' ? 'audio' : 'video', c.id) : null;
  const followButtons = currentFollowButtons(sourceItem);
  return `<div class="sheet-backdrop" data-close-player-backdrop="1">
    <section class="player-sheet" data-player-sheet="1">
      <div class="grabber"></div>
      <div class="player-art ${c.thumbnail ? '' : 'audio-logo'}">${c.thumbnail ? `<img src="${esc(c.thumbnail)}" alt="">` : '<img src="/logo.png" alt="Irgun Shiurai Torah">'}</div>
      <div class="player-heading"><h2>${esc(c.title || '')}</h2><p>${esc(c.subtitle || '')}</p></div>
      ${followButtons ? `<div class="follow-bar player-follow-bar">${followButtons}</div>` : ''}
      <input id="fullSeek" class="seek" type="range" min="0" max="${playbackDurationSeconds()}" value="${playbackPositionSeconds()}" step="1">
      <div class="time-row"><span id="fullCurrent">${fmtTime(playbackPositionSeconds())}</span><span id="fullDuration">${fmtDurationOrUnknown(playbackDurationSeconds())}</span></div>
      <div class="big-controls"><button class="skip-control" data-skip="-${state.skipSeconds}" aria-label="Back ${state.skipSeconds} seconds">${svgIcon('back15')}</button><button class="main-play" data-play-toggle="1">${playbackIsPaused() ? svgIcon('play') : '<span class="pause-mark">II</span>'}</button><button class="skip-control" data-skip="${state.skipSeconds}" aria-label="Forward ${state.skipSeconds} seconds">${svgIcon('forward15')}</button></div>
      <div class="player-action-grid">
        ${isPaid ? `<button data-paid-bookmark-current="1">${svgIcon('bookmark')}<span>Bookmark</span></button>${Number(c.bookmarkSeconds) > 0 ? `<button data-paid-go-bookmark="1">${svgIcon('back15')}<span>Go to ${fmtTime(c.bookmarkSeconds)}</span></button>` : ''}<button data-nav="paid">${svgIcon('store')}<span>Purchase</span></button>` : `${canWatch ? `<button data-player-watch="${esc(c.id)}">${svgIcon('video')}<span>Watch</span></button>` : ''}<button class="${liked ? 'active' : ''}" data-like="${esc(likeId)}">${svgIcon('heart')}<span>${liked ? 'Liked' : 'Like'}</span></button><button class="${savePresentation?.cls || ''}" data-open-playlist-picker="1" data-playlist-kind="${c.kind === 'library-audio' ? 'audio' : 'video'}" data-playlist-id="${esc(c.id)}">${svgIcon('bookmark')}<span>${tr(savePresentation?.label || 'Save')}</span></button><button data-share-kind="${c.kind === 'library-audio' ? 'audio' : 'video'}" data-share-id="${esc(c.id)}">${svgIcon('share')}<span>Share</span></button><button data-download-kind="${c.kind === 'library-audio' ? 'audio' : 'video-audio'}" data-download-id="${esc(c.id)}">${svgIcon('download')}<span>Download</span></button><button data-save-offline-kind="${c.kind === 'library-audio' ? 'audio' : 'video'}" data-save-offline-id="${esc(c.id)}" class="${offlineState?.cls || ''}">${offlineIconHtml()}<span>${esc(offlineState?.label || (currentLanguage()==='he'?'האזנה ללא אינטרנט':'Listen Offline'))}</span>${offlineState?.status==='downloading'?`<span class="offline-progress-badge">${Number(offlineState.job?.percent)>0?`${Number(offlineState.job.percent)}%`:'…'}</span>`:''}</button>`}
      </div>
      ${c.offline ? `<div class="offline-player-badge">✓ ${currentLanguage()==='he'?'מתנגן מהקובץ השמור':'Playing offline copy'}</div>` : ''}
      ${state.playQueue.length>1?`<div class="queue-controls"><button data-queue-prev="1" ${state.playQueueIndex<=0?'disabled':''}>← ${currentLanguage()==='he'?'הקודם':'Previous'}</button><button data-queue-next="1" ${state.playQueueIndex>=state.playQueue.length-1?'disabled':''}>${currentLanguage()==='he'?'הבא':'Next'} →</button></div>`:''}
      <div class="player-setting-block"><span class="player-setting-title">${currentLanguage()==='he'?'דילוג קדימה/אחורה':'Skip buttons'}</span><div class="player-setting-chips">${[10,15,30].map(x=>`<button data-skip-choice="${x}" class="${state.skipSeconds===x?'active':''}">${x} sec</button>`).join('')}</div></div>
      <div class="player-setting-block"><span class="player-setting-title">Playback speed</span><div class="player-setting-chips">${[0.75, 1, 1.25, 1.5, 1.75, 2].map(x => `<button data-speed-choice="${x}" class="${state.playbackSpeed === x ? 'active' : ''}">${x}×</button>`).join('')}</div></div>
      <div class="player-setting-block"><span class="player-setting-title">Sleep timer</span><div class="player-setting-chips">${[['off','Off'],['15','15 min'],['30','30 min'],['45','45 min'],['60','60 min'],['end','End']].map(([value,label]) => `<button data-sleep-choice="${value}" class="${state.sleepMode === value ? 'active' : ''}">${label}</button>`).join('')}</div></div>
      <button class="close-player" data-close-player="1">Close full player</button>
    </section>
  </div>`;
}

async function currentNativePushEnabled() {
  if (!Capacitor.isNativePlatform() || !state.user || !state.notificationSettings.pushConfigured) return false;
  try {
    const permission = await IrgunPush.checkNotificationPermission();
    if (!permission.granted) return false;
    // Use the current FCM token from this app installation, not an account-wide
    // preference or only a saved local value.
    const tokenResult = await IrgunPush.getToken();
    const token = String(tokenResult.token || '');
    if (!token) return false;
    const status = await apiJson('/push-devices/status', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ token })
    });
    if (status.registered) localStorage.setItem(APP_PUSH_TOKEN_KEY, token);
    else localStorage.removeItem(APP_PUSH_TOKEN_KEY);
    return Boolean(status.registered);
  } catch (error) {
    console.warn('Could not check this app push registration', error);
    return false;
  }
}

async function reloadNotificationSettings() {
  if (!state.user) return;
  try {
    state.notificationSettings = { ...state.notificationSettings, ...(await apiJson('/notification-settings')) };
    state.notificationSettings.pushEnabled = await currentNativePushEnabled();
  }
  catch (error) { console.warn('Notification settings unavailable', error); }
}

async function refreshNativePushRegistration(requestPermission) {
  if (!Capacitor.isNativePlatform() || !state.user || !state.notificationSettings.pushConfigured) return '';
  try {
    if (requestPermission) {
      const permission = await IrgunPush.requestNotificationPermission();
      if (!permission.granted) throw new Error('Notification permission was not granted.');
    } else {
      const permission = await IrgunPush.checkNotificationPermission();
      if (!permission.granted) return '';
    }
    const tokenResult = await IrgunPush.getToken();
    const token = String(tokenResult.token || '');
    if (!token) throw new Error('Firebase did not return a push token.');
    await apiJson('/push-devices/register', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ token, platform:'android' }) });
    localStorage.setItem(APP_PUSH_TOKEN_KEY, token);
    return token;
  } catch (error) {
    if (requestPermission) throw error;
    console.warn('Could not refresh app push token', error);
    return '';
  }
}

async function setAppPushEnabled(enabled) {
  if (!state.user || state.notificationBusy) return;
  state.notificationBusy = true;
  render();
  try {
    if (enabled) {
      await refreshNativePushRegistration(true);
      state.notificationSettings.pushEnabled = true;
      setToast('Push notifications enabled on this app.');
    } else {
      let token = localStorage.getItem(APP_PUSH_TOKEN_KEY) || '';
      if (!token) {
        try { token = String((await IrgunPush.getToken()).token || ''); } catch (_) {}
      }
      if (token) await apiJson('/push-devices/unregister', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ token }) }).catch(() => ({}));
      localStorage.removeItem(APP_PUSH_TOKEN_KEY);
      state.notificationSettings.pushEnabled = false;
      setToast('Push notifications disabled on this app.');
    }
  } catch (error) {
    alert(error.message || 'Could not update push notifications.');
    await reloadNotificationSettings();
  } finally {
    state.notificationBusy = false;
    render();
  }
}

async function setAppEmailEnabled(enabled) {
  if (!state.user || state.notificationBusy) return;
  state.notificationBusy = true;
  render();
  try {
    const localPushEnabled = Boolean(state.notificationSettings.pushEnabled);
    const updated = await apiJson('/notification-settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ emailEnabled:enabled }) });
    state.notificationSettings = { ...state.notificationSettings, ...updated, pushEnabled:localPushEnabled };
    setToast(enabled ? 'Email notifications enabled.' : 'Email notifications disabled.');
  } catch (error) {
    alert(error.message || 'Could not update email notifications.');
    await reloadNotificationSettings();
  } finally {
    state.notificationBusy = false;
    render();
  }
}

async function handlePendingPushOpen() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const result = await IrgunPush.getPendingUrl();
    const url = String(result.url || '');
    if (!url) return;
    await IrgunPush.clearPendingUrl().catch(() => {});
    const parsed = new URL(url, WEBSITE);
    const videoIdParam = parsed.searchParams.get('v');
    const audioIdParam = parsed.searchParams.get('audio');
    if (parsed.pathname.endsWith('/watch.html') && videoIdParam) openWatch(videoIdParam);
    else if (audioIdParam) playLibraryAudio(audioIdParam);
  } catch (_) {}
}


async function loadSponsorRibbon() {
  try {
    const data = await publicJson(`/sponsor-ribbon?v=${Date.now()}`);
    state.sponsorRibbon = data && typeof data === 'object' ? data : null;
  } catch (_) {
    state.sponsorRibbon = null;
  }
}

async function loadScheduleData(force = false) {
  if (state.scheduleDataLoading) return;
  if (state.scheduleDataLoaded && !force) return;
  state.scheduleDataLoading = true;
  state.scheduleDataError = '';
  const manual = window.IRGUN_MANUAL_SCHEDULE && Array.isArray(window.IRGUN_MANUAL_SCHEDULE.events)
    ? window.IRGUN_MANUAL_SCHEDULE
    : { events: [], sources: [] };
  try {
    // Mirror the public website's source-selection rules. After the Dropbox
    // cutover, do not mix the old static schedule back into the current feed.
    const [sourceResult, candidate] = await Promise.all([
      publicJson(`/ads-source?v=${Date.now()}`).catch(() => null),
      publicJson(`/schedule-data?v=${Date.now()}`)
    ]);
    const confirmedSource = String(sourceResult?.source || candidate?.adsSource || '').trim() || null;
    const automaticPublic = candidate && Array.isArray(candidate.events) && (
      candidate.websitePublishing === true || candidate.adminScheduleOverridesPublic === true
    );
    if (confirmedSource !== 'legacy') {
      state.scheduleData = automaticPublic
        ? mergePublicScheduleOverlay({ events:[], sources:[] }, candidate)
        : { events:[], sources:[], adsSource:confirmedSource || 'dropbox', websitePublishing:true };
    } else {
      state.scheduleData = mergePublicScheduleOverlay(manual, candidate);
    }
    state.scheduleDataLoaded = true;
  } catch (error) {
    // Website parity: only the explicitly confirmed legacy feed may use the
    // bundled manual schedule. Unknown/current Dropbox failures fail closed.
    let legacy = false;
    try {
      const source = await publicJson(`/ads-source?v=${Date.now()}`);
      legacy = source?.source === 'legacy';
    } catch (_) {}
    state.scheduleData = legacy ? mergePublicScheduleOverlay(manual, null) : { events:[], sources:[], adsSource:'dropbox', websitePublishing:true };
    state.scheduleDataLoaded = true;
    state.scheduleDataError = legacy && manual.events.length ? '' : 'Could not load the current typed schedule.';
  } finally {
    state.scheduleDataLoading = false;
    if (state.upcomingRemindersEnabled) scheduleUpcomingReminders().catch(() => {});
    if (['home','schedule','live','live-boro','live-flatbush'].includes(state.screen) && !(state.screen === 'schedule' && state.scheduleView === 'flyers' && state.scheduleLoading)) render();
  }
}

async function loadLiveStatus(force = false) {
  if (state.liveStatusLoaded && !force) return;
  try {
    const data = await publicJson(`/live-stream-status?v=${Date.now()}`);
    state.liveOverrides = new Set((data.enabledLocations || []).filter(location => LIVE_STREAMS[location]));
  } catch (_) {
    state.liveOverrides = new Set();
  }
  state.liveStatusLoaded = true;
  if (state.screen.startsWith('live') || state.screen === 'home') render();
}

async function loadRecurringDonations(force = false) {
  if (!state.user || state.recurringLoading) return;
  if (state.recurringLoaded && !force) return;
  state.recurringLoading = true;
  state.recurringError = '';
  if (state.screen === 'account' && state.accountSection === 'purchases') render();
  try {
    const data = await apiJson(`/stripe/my-subscriptions?v=${Date.now()}`);
    state.recurringDonations = Array.isArray(data.items) ? data.items : [];
    state.recurringLoaded = true;
  } catch (error) {
    state.recurringError = error.message || 'Unable to load recurring donations.';
  } finally {
    state.recurringLoading = false;
    if (state.screen === 'account' && state.accountSection === 'purchases') render();
  }
}

async function updateRecurringDonation(id, action) {
  const item = state.recurringDonations.find(entry => String(entry.id) === String(id));
  if (!item || !['cancel','resume'].includes(action) || state.recurringActionBusy) return;
  if (action === 'cancel') {
    const prompt = item.termType === 'fixed'
      ? 'Cancel this monthly donation? Stripe will not make another monthly charge. The donation remains active only through the period already covered.'
      : 'Cancel this monthly donation? You will not be charged again after the current monthly period.';
    if (!window.confirm(prompt)) return;
  }
  state.recurringActionBusy = String(id);
  render();
  try {
    await apiJson(`/stripe/subscriptions/${encodeURIComponent(id)}/${action}`, { method:'POST' });
    state.recurringLoaded = false;
    await loadRecurringDonations(true);
    setToast(action === 'cancel' ? 'Monthly donation cancellation updated.' : 'Monthly donation will stay active.');
  } catch (error) {
    alert(error.message || (action === 'cancel' ? 'Could not cancel this monthly donation.' : 'Could not keep this monthly donation active.'));
  } finally {
    state.recurringActionBusy = '';
    render();
  }
}

async function loadPaidCatalog(force = false, options = {}) {
  const silent = Boolean(options?.silent);
  if (state.paidLoading) return;
  if (state.paidLoaded && !force) return;
  state.paidLoading = true;
  state.paidError = '';
  if (!silent && ['paid','library','account'].includes(state.screen)) render();
  try {
    const paidRequest = state.user
      ? apiJson(`/paid-audio?v=${Date.now()}`)
      : publicJson(`/paid-audio?v=${Date.now()}`);
    const data = await promiseWithTimeout(paidRequest, 12000, currentLanguage()==='he' ? 'טעינת החנות ארכה זמן רב מדי. נסו שוב.' : 'The purchase page took too long to load. Please try again.');
    state.paidCatalog = Array.isArray(data.items) ? data.items : [];
    state.paidLoaded = true;
    if (Capacitor.isNativePlatform() && state.user) setTimeout(warmPaidPurchases, 120);
  } catch (error) {
    state.paidError = error.message || 'Could not load paid shiurim.';
  } finally {
    state.paidLoading = false;
    const paidSurfaceVisible = state.screen === 'paid'
      || (state.screen === 'library' && state.librarySection === 'purchased')
      || (state.screen === 'account' && state.accountSection === 'purchases');
    if (paidSurfaceVisible) render();
  }
}

function warmNativePaidCatalog() {
  if (!Capacitor.isNativePlatform() || !state.user) return;
  setTimeout(() => loadPaidCatalog(false, { silent:true }).catch(() => {}), 80);
}

function setPaidCheckoutMessage(message, error = false) {
  state.paidCheckoutMessage = String(message || '');
  const node = document.getElementById('paidCheckoutMessage');
  if (node) {
    node.textContent = state.paidCheckoutMessage;
    node.className = `paid-checkout-message visible${error ? ' error' : ''}`;
  }
}

function closePaidCheckout() {
  try { state.paidPaymentElement?.unmount?.(); } catch (_) {}
  state.paidPaymentElement = null;
  state.paidCheckout = null;
  state.paidCheckoutActions = null;
  state.paidCheckoutItemId = '';
  state.paidCheckoutBusy = false;
  state.paidCheckoutMessage = '';
  render();
}

async function initPaidCheckout(productId) {
  const item = state.paidCatalog.find(entry => String(entry.id) === String(productId));
  if (!item || !item.available) return;
  if (!state.user) {
    state.screen = 'account';
    state.authMessage = 'Please sign in to purchase this audio collection.';
    render();
    return;
  }
  if (item.owned) {
    state.paidExpandedId = String(item.id);
    render();
    return;
  }
  state.paidCheckoutItemId = String(item.id);
  state.paidCheckoutBusy = true;
  state.paidCheckoutMessage = 'Preparing secure payment...';
  render();
  try {
    const data = await apiJson('/paid-audio/create-session', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ paidAudioId:item.id })
    });
    if (data.alreadyOwned) {
      closePaidCheckout();
      await loadPaidCatalog(true);
      state.paidExpandedId = String(item.id);
      render();
      return;
    }
    if (!window.Stripe) throw new Error('Secure Stripe payment form could not load.');
    const stripe = window.Stripe(data.publishableKey, { locale: currentLanguage() === 'he' ? 'he' : 'en' });
    const checkout = stripe.initCheckoutElementsSdk({
      clientSecret:data.clientSecret,
      elementsOptions:{ appearance:{ theme:'stripe', variables:{ colorPrimary:'#9b7438', colorText:'#0f1f35', borderRadius:'12px', fontFamily:'Arial, sans-serif' } } }
    });
    state.paidCheckout = checkout;
    checkout.on('change', session => {
      const button = document.getElementById('paidPayButton');
      if (!button) return;
      button.disabled = !session.canConfirm;
      const liveAmount = Number(session?.total?.total?.amount);
      button.textContent = `Pay ${money(liveAmount > 0 ? liveAmount : item.priceCents, item.currency)} securely`;
    });
    const payment = checkout.createPaymentElement();
    state.paidPaymentElement = payment;
    payment.mount('#paidStripeElement');
    const actionsResult = await checkout.loadActions();
    if (actionsResult.type === 'error') throw new Error(actionsResult.error?.message || 'Could not load payment form.');
    state.paidCheckoutActions = actionsResult.actions;
    state.paidCheckoutBusy = false;
    setPaidCheckoutMessage('');
  } catch (error) {
    state.paidCheckoutBusy = false;
    setPaidCheckoutMessage(error.message || 'Could not start secure payment.', true);
  }
}

async function confirmPaidCheckout() {
  if (!state.paidCheckoutActions || state.paidCheckoutBusy) return;
  state.paidCheckoutBusy = true;
  const button = document.getElementById('paidPayButton');
  if (button) button.disabled = true;
  setPaidCheckoutMessage('Processing secure payment...');
  try {
    const result = await state.paidCheckoutActions.confirm();
    if (result?.type === 'error') {
      state.paidCheckoutBusy = false;
      setPaidCheckoutMessage(result.error?.message || 'Payment could not be completed.', true);
      if (button) button.disabled = false;
    }
  } catch (error) {
    state.paidCheckoutBusy = false;
    setPaidCheckoutMessage(error.message || 'Payment could not be completed.', true);
    if (button) button.disabled = false;
  }
}

function paidPlaySessionKey(productId, trackId) {
  return `${String(productId)}:${String(trackId)}`;
}

function cachedPaidPlaySession(productId, trackId) {
  const key=paidPlaySessionKey(productId,trackId);
  const cached=state.paidPlaySessionCache.get(key);
  if(!cached)return null;
  if(Date.now()-Number(cached.cachedAt||0)>60000){state.paidPlaySessionCache.delete(key);return null;}
  return cached.data||null;
}

async function requestPaidPlaySession(productId, trackId, prefetch=false) {
  const cached=cachedPaidPlaySession(productId,trackId);
  if(cached)return cached;
  const key=paidPlaySessionKey(productId,trackId);
  if(state.paidPlaySessionPrefetch.has(key))return state.paidPlaySessionPrefetch.get(key);
  const promise=apiJson('/paid-audio/play-session', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ paidAudioId:productId, trackId })
  }).then(data=>{
    if(data?.playbackUrl)state.paidPlaySessionCache.set(key,{cachedAt:Date.now(),data});
    return data;
  }).finally(()=>state.paidPlaySessionPrefetch.delete(key));
  state.paidPlaySessionPrefetch.set(key,promise);
  if(prefetch)promise.catch(()=>{});
  return promise;
}

function prefetchPaidTrack(productId, trackId) {
  if(!Capacitor.isNativePlatform()||!state.user||!productId||!trackId)return;
  requestPaidPlaySession(productId,trackId,true).catch(()=>{});
}

function warmPaidPurchases() {
  if(!Capacitor.isNativePlatform()||!state.user)return;
  const owned=state.paidCatalog.filter(item=>item.owned&&Array.isArray(item.tracks)&&item.tracks.length).slice(0,3);
  owned.forEach((product,index)=>setTimeout(()=>prefetchPaidTrack(product.id,product.tracks[0]?.id),150+index*250));
}

async function playPaidTrack(productId, trackId) {
  if (!state.user) {
    state.screen = 'account';
    state.authMessage = 'Please sign in to listen to your purchased shiurim.';
    render();
    return;
  }
  resetWatchPresentationForStandaloneAudio();
  const product = state.paidCatalog.find(item => String(item.id) === String(productId));
  const track = product?.tracks?.find(item => String(item.id) === String(trackId));
  if (!product?.owned || !track) return;
  try {
    setToast('Preparing secure playback...');
    const data = await requestPaidPlaySession(productId, trackId, false);
    state.paidPlaySessionCache.delete(paidPlaySessionKey(productId, trackId));
    audio.crossOrigin = 'use-credentials';
    await startAudio({
      kind:'paid-audio',
      id:`${productId}:${trackId}`,
      sourceId:trackId,
      paidAudioId:String(productId),
      trackId:String(trackId),
      title:String(track.title || paidProductTitle(product, 'Purchased shiur')),
      subtitle:[paidProductTitle(product, 'Purchased shiur'), product.speaker].filter(Boolean).join(' • '),
      thumbnail:product.coverUrl ? apiUrl(product.coverUrl) : '',
      url:String(data.playbackUrl || ''),
      bookmarkSeconds:Number(data.progress?.bookmarkSeconds)||0
    }, Number(data.progress?.positionSeconds)||0);
  } catch (error) {
    alert(error.message || 'Could not start protected playback.');
  }
}

async function savePaidAudioProgress(bookmark = false, force = false) {
  const current = state.current;
  if (!current || current.kind !== 'paid-audio' || !state.user) return;
  const now = Date.now();
  if (!bookmark && !force && now - state.paidProgressLastAt < 20000) return;
  state.paidProgressLastAt = now;
  const payload = {
    paidAudioId:current.paidAudioId,
    trackId:current.trackId,
    positionSeconds:playbackPositionSeconds(),
    durationSeconds:playbackDurationSeconds()
  };
  try {
    const data = await apiJson(bookmark ? '/paid-audio/bookmark' : '/paid-audio/progress', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), keepalive:Boolean(force)
    });
    if (bookmark && data.progress) {
      current.bookmarkSeconds = Number(data.progress.bookmarkSeconds)||0;
      setToast(`Bookmark saved at ${fmtTime(current.bookmarkSeconds)}.`);
      render();
    }
  } catch (_) {}
}

function goToPaidBookmark() {
  const current = state.current;
  if (!current || current.kind !== 'paid-audio' || !(Number(current.bookmarkSeconds) > 0)) return;
  PlaybackController.seekTo(Number(current.bookmarkSeconds)).then(()=>PlaybackController.play()).catch(()=>{});
}

async function handleAppReturn() {
  const params = new URLSearchParams(location.search);
  const kind = params.get('app_return');
  const sessionId = params.get('stripe_session_id');
  if (!kind) return;
  try {
    if (sessionId) {
      const data = await apiJson(`/stripe/session-status?session_id=${encodeURIComponent(sessionId)}`);
      if (data.paymentStatus === 'paid') setToast(kind === 'paid' ? 'Payment received. Your purchased shiur is ready.' : 'Thank you. Your donation was received.');
      else setToast('Payment is still processing.');
    }
  } catch (_) {
    setToast('Payment return received. Account status will refresh shortly.');
  }
  if (kind === 'paid') {
    state.screen = 'paid';
    state.paidLoaded = false;
    await loadPaidCatalog(true);
  } else if (kind === 'donation') { state.screen = 'donate'; closeDonationCheckout(false); state.donationSuccess = 'Thank you. Your donation was received.'; state.recurringLoaded = false; }
  try { history.replaceState(null, '', location.pathname); } catch (_) {}
  render();
}

function analyticsScreenLabel() {
  if (state.watchVideo) return 'Watch page';
  const names = { home:'Home', shiurim:'Search', live:'Live', 'live-boro':'Live', 'live-flatbush':'Live', schedule:'Schedule', paid:'Purchases', donate:'Donate', contact:'Contact', privacy:'Privacy', library:'Library', account:'Account' };
  return names[String(state.screen || '')] || String(state.screen || 'Home');
}

function render() {
  usageAnalytics.setScreen(analyticsScreenLabel());
  if (['live','live-boro','live-flatbush'].includes(state.screen)) usageAnalytics.event('livestream_opened', { dedupeKey:'livestream-open', cooldownMs:60000 });
  if (state.loading) {
    app.innerHTML = shell('<div class="loading">Loading the Torah library...</div>');
    bind();
    return;
  }
  if (state.error) {
    const headline = navigator.onLine === false ? 'You’re offline.' : 'The Torah library could not load yet.';
    app.innerHTML = shell(`<div class="offline-error-card"><strong>${headline}</strong><span>Check your internet connection. The app will retry automatically when the connection returns.</span><button type="button" data-retry-library>Try Again</button></div>`);
    bind();
    return;
  }
  const content = state.screen === 'home' ? homeHtml()
    : state.screen === 'shiurim' ? shiurimHtml()
    : state.screen === 'live' ? liveHtml()
    : state.screen === 'live-boro' ? liveStreamHtml('boro')
    : state.screen === 'live-flatbush' ? liveStreamHtml('flatbush')
    : state.screen === 'schedule' ? scheduleHtml()
    : state.screen === 'paid' ? paidShiurimHtml()
    : state.screen === 'donate' ? donateHtml()
    : state.screen === 'contact' ? contactHtml()
    : state.screen === 'privacy' ? privacyHtml()
    : state.screen === 'library' ? libraryHtml()
    : accountHtml();
  app.innerHTML = shell(content + playlistPickerHtml());
  bind();
  updatePlayerUi();
  refreshOfflineButtonsForKey();
  if (state.watchVideo && state.watchMode === 'video') setTimeout(initWatchVimeo, 0);
  if (['home','schedule','live','live-boro','live-flatbush'].includes(state.screen) && !state.scheduleDataLoaded && !state.scheduleDataLoading) setTimeout(loadScheduleData, 0);
  if (['home','live','live-boro','live-flatbush'].includes(state.screen) && !state.liveStatusLoaded) setTimeout(loadLiveStatus, 0);
  if (state.screen === 'schedule' && state.scheduleView === 'flyers') setTimeout(loadSchedule, 0);
  if ((state.screen === 'paid' || (state.screen === 'library' && state.librarySection === 'purchased') || (state.screen === 'account' && state.accountSection === 'purchases')) && !state.paidLoaded && !state.paidLoading) setTimeout(loadPaidCatalog, 0);
  if (state.screen === 'account' && state.accountSection === 'purchases' && state.user && !state.recurringLoaded && !state.recurringLoading) setTimeout(loadRecurringDonations, 0);
  if (state.screen === 'account' && state.accountSection === 'admin' && state.isAdmin && !state.adminLoaded && !state.adminLoading) setTimeout(loadAdminData, 0);
  if (state.screen === 'donate' && !state.sponsorPricesLoaded && !state.sponsorPricesLoading) setTimeout(loadSponsorPrices, 0);
}


function syncOpenFilterChecks(key, values) {
  const normalized = values.map(String);
  document.querySelectorAll('[data-filter-option]').forEach(box => { box.checked = state.filterDraft.has(String(box.dataset.filterOption)); });
  const allBox = document.querySelector(`[data-filter-all="${CSS.escape(key)}"]`);
  if (allBox) allBox.checked = normalized.length > 0 && normalized.every(value => state.filterDraft.has(value));
  if (key === 'topic') {
    document.querySelectorAll('[data-topic-parent]').forEach(box => {
      const parentId = String(box.dataset.topicParent || '');
      const available = new Set(normalized);
      const relevant = [...topicChildren(parentId).filter(id => available.has(id)), ...(available.has(parentId) ? [parentId] : [])];
      box.checked = relevant.length > 0 && relevant.every(id => state.filterDraft.has(id));
    });
  }
  if (key === 'location') {
    document.querySelectorAll('[data-location-parent]').forEach(box => {
      const parent = String(box.dataset.locationParent || '');
      const relevant = normalized.filter(value => value === parent || value.startsWith(`${parent}|`));
      box.checked = relevant.length > 0 && relevant.every(id => state.filterDraft.has(id));
    });
  }
  const count = document.getElementById('filterDraftCount');
  if (count) count.textContent = state.filterDraft.size ? `(${state.filterDraft.size})` : '';
}

function bindPlayerSwipeToClose(sheet) {
  let startY = 0;
  let startX = 0;
  let startAt = 0;
  let dragging = false;
  let distance = 0;
  const reset = () => {
    sheet.classList.remove('dragging');
    sheet.style.transform = '';
  };
  sheet.addEventListener('touchstart', event => {
    if (event.touches.length !== 1 || sheet.scrollTop > 0) return;
    const touch = event.touches[0];
    startY = touch.clientY;
    startX = touch.clientX;
    startAt = performance.now();
    distance = 0;
    dragging = false;
  }, { passive: true });
  sheet.addEventListener('touchmove', event => {
    if (event.touches.length !== 1 || sheet.scrollTop > 0) return reset();
    const touch = event.touches[0];
    const dy = touch.clientY - startY;
    const dx = Math.abs(touch.clientX - startX);
    if (dy <= 0 || dy < dx) return;
    if (dy > 10) dragging = true;
    if (!dragging) return;
    distance = dy;
    sheet.classList.add('dragging');
    sheet.style.transform = `translateY(${Math.min(dy, window.innerHeight * 0.7)}px)`;
    event.preventDefault();
  }, { passive: false });
  sheet.addEventListener('touchend', () => {
    if (!dragging) return reset();
    const elapsed = Math.max(1, performance.now() - startAt);
    const velocity = distance / elapsed;
    if (distance > 105 || velocity > 0.65) {
      state.playerOpen = false;
      render();
    } else reset();
  }, { passive: true });
  sheet.addEventListener('touchcancel', reset, { passive: true });
}

function refreshDonationProviderPanelFast() {
  const panel=document.getElementById('donationProviderPanel');
  if (!panel || state.screen!=='donate') { render(); return; }
  panel.innerHTML=donationProviderPanelHtml();
  bindDonationControls(panel);
}

function bindDonationControls(root=document) {
  const qsa=selector=>root.querySelectorAll(selector);
  const qs=selector=>root.querySelector(selector);

  qsa('[data-donation-provider]').forEach(el => el.addEventListener('click', () => {
    saveDonationDraftFromDom(); closeDonationCheckout(false); state.donationProvider=el.dataset.donationProvider||'stripe'; state.donationSuccess=''; render();
  }));
  qsa('[data-donation-provider-jump]').forEach(el => el.addEventListener('click', () => {
    saveDonationDraftFromDom(); closeDonationCheckout(false); state.donationProvider='stripe'; state.donationMode=el.dataset.donationMode||'donation'; state.donationFrequency=state.donationMode==='sponsor'?'one_time':state.donationFrequency; render(); setTimeout(()=>document.getElementById('donationProviderPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),30);
  }));
  qsa('[data-donation-open-external]').forEach(el => el.addEventListener('click', () => { const key=el.dataset.donationOpenExternal; if(DONATION_PROVIDER_URLS[key]) openExternal(DONATION_PROVIDER_URLS[key]); }));
  qsa('[data-donation-mode]').forEach(el => el.addEventListener('click', () => {
    saveDonationDraftFromDom(); closeDonationCheckout(false);
    state.donationMode=el.dataset.donationMode==='sponsor'?'sponsor':'donation';
    if(state.donationMode==='sponsor')state.donationFrequency='one_time';
    // Give slower Android devices immediate visual feedback before rebuilding only the donation panel.
    qsa('[data-donation-mode]').forEach(btn => btn.classList.toggle('active', (btn.dataset.donationMode==='sponsor'?'sponsor':'donation')===state.donationMode));
    const refresh=()=>refreshDonationProviderPanelFast();
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(refresh); else setTimeout(refresh,0);
  }));
  qsa('[data-donation-frequency]').forEach(el => el.addEventListener('click', () => { saveDonationDraftFromDom(); state.donationFrequency=el.dataset.donationFrequency==='monthly'?'monthly':'one_time'; refreshDonationProviderPanelFast(); }));
  qsa('[data-donation-term]').forEach(el => el.addEventListener('click', () => { saveDonationDraftFromDom(); state.donationTermType=el.dataset.donationTerm==='fixed'?'fixed':'ongoing'; refreshDonationProviderPanelFast(); }));
  qsa('[data-donation-plan]').forEach(el => el.addEventListener('click', () => { saveDonationDraftFromDom(); state.donationDraft.sponsorPlan=el.dataset.donationPlan||'day'; refreshDonationProviderPanelFast(); }));
  qsa('[data-donation-amount]').forEach(el => el.addEventListener('click', () => { saveDonationDraftFromDom(); const value=el.dataset.donationAmount||'36'; if(value==='other'){ if([18,36,72,180].includes(Number(state.donationDraft.amount))) state.donationDraft.amount=''; refreshDonationProviderPanelFast(); setTimeout(()=>{const input=document.getElementById('donationAmount'); input?.focus(); input?.select?.();},0); return;} state.donationDraft.amount=value; refreshDonationProviderPanelFast(); }));
  qs('#donationAmount')?.addEventListener('input', () => refreshDonationRecurringSummaryInPlace());
  qs('#donationTermMonths')?.addEventListener('input', () => refreshDonationRecurringSummaryInPlace());
  qs('#donationBillingDay')?.addEventListener('change', () => refreshDonationRecurringSummaryInPlace());
  qs('#sponsorDedication')?.addEventListener('change', event => { saveDonationDraftFromDom(); state.donationDraft.dedicationType=event.target.value; refreshDonationProviderPanelFast(); });
  qs('#sponsorStartDate')?.addEventListener('change', event => { state.donationDraft.sponsorStartDate=event.target.value; refreshDonationProviderPanelFast(); });
  qs('#sponsorJewishDate')?.addEventListener('change', event => { state.donationDraft.sponsorStartDate=event.target.value; refreshDonationProviderPanelFast(); });
  qs('#donationStripeForm')?.addEventListener('submit', prepareDonationCheckout);
  qs('#donationPayButton')?.addEventListener('click', confirmDonationCheckout);
  qsa('[data-donation-back]').forEach(el => el.addEventListener('click', () => closeDonationCheckout(true)));
}

function bind() {
  document.querySelectorAll('[data-retry-library]').forEach(el => el.addEventListener('click', () => bootstrap({ manual:true })));
  document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => {
    state.screen = el.dataset.nav;
    if (el.dataset.openPurchased) state.librarySection = 'purchased';
    if (el.dataset.openHistory) state.librarySection = 'history';
    if (state.screen === 'schedule') state.scheduleDataLoaded = false;
    if (state.screen === 'donate') { state.donationProvider = 'stripe'; closeDonationCheckout(false); }
    if (state.screen.startsWith('live')) { state.scheduleDataLoaded = false; state.liveStatusLoaded = false; }
    state.libraryLimit = 48;
    state.filterDialog = '';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

  document.querySelectorAll('[data-language-toggle]').forEach(el => el.addEventListener('click', async () => {
    if (state.watchVideo) await preserveWatchTime();
    if (window.IST_I18N && window.IST_I18N.setLanguage) window.IST_I18N.setLanguage(currentLanguage() === 'he' ? 'en' : 'he');
    state.videos.forEach(enrichVideo);
    state.audioItems.forEach(enrichAudio);
    render();
  }));

  document.querySelectorAll('[data-external]').forEach(el => el.addEventListener('click', () => openExternal(el.dataset.external)));

  bindDonationControls(document);

  document.getElementById('homeLibrarySearchGo')?.addEventListener('click', () => { const input=document.getElementById('homeLibrarySearch'); state.libraryQuery=String(input?.value||'').trim(); if(state.libraryQuery) usageAnalytics.event('search',{dedupeKey:'app-search',cooldownMs:2000}); rememberLibrarySearch(state.libraryQuery); state.screen='shiurim'; state.libraryLimit=48; render(); });
  document.getElementById('homeLibrarySearch')?.addEventListener('keydown', event => { if(event.key==='Enter'){ event.preventDefault(); document.getElementById('homeLibrarySearchGo')?.click(); } });
  document.querySelectorAll('[data-home-speaker]').forEach(el=>el.addEventListener('click',()=>{ state.filters={ location:[],year:[],language:[],speaker:[String(el.dataset.homeSpeaker)],topic:[] }; state.libraryQuery=''; state.screen='shiurim'; state.filterPanelOpen=true; render(); }));
  document.querySelectorAll('[data-shuffle-speakers]').forEach(el=>el.addEventListener('click',()=>{ state.speakerDiscoveryShuffle += 1; render(); }));
  document.querySelectorAll('[data-home-all-speakers]').forEach(el=>el.addEventListener('click',()=>{
    state.screen='shiurim';
    state.libraryQuery='';
    state.filterPanelOpen=true;
    state.filterDialog='speaker';
    state.filterDraft=new Set();
    render();
  }));
  document.querySelectorAll('[data-save-offline-kind]').forEach(el=>el.addEventListener('click',event=>{event.stopPropagation();saveOffline(el.dataset.saveOfflineKind,el.dataset.saveOfflineId);}));
  document.querySelectorAll('[data-offline-play]').forEach(el=>el.addEventListener('click',()=>playOfflineRecord(el.dataset.offlinePlay)));
  document.querySelectorAll('[data-offline-delete]').forEach(el=>el.addEventListener('click',()=>deleteOffline(el.dataset.offlineDelete)));
  document.querySelectorAll('[data-open-playlist-picker]').forEach(el=>el.addEventListener('click',event=>{event.stopPropagation();openPlaylistPicker(el.dataset.playlistKind,el.dataset.playlistId);}));
  document.querySelectorAll('[data-playlist-picker-close]').forEach(el=>el.addEventListener('click',event=>{if(event.target.closest('[data-playlist-picker-panel]') && event.target!==el)return;state.playlistPickerItem=null;render();}));
  document.querySelectorAll('[data-playlist-picker-panel]').forEach(el=>el.addEventListener('click',event=>event.stopPropagation()));
  document.querySelectorAll('[data-playlist-add-target]').forEach(el=>el.addEventListener('click',async()=>{await addToPlaylist(el.dataset.playlistAddTarget,state.playlistPickerItem);}));
  document.getElementById('playlistCreateForm')?.addEventListener('submit',async event=>{event.preventDefault();const name=document.getElementById('playlistCreateName')?.value||'';const pl=await createPlaylist(name,state.playlistPickerItem);if(pl){state.playlistPickerItem=null;setToast(currentLanguage()==='he'?'הרשימה נוצרה והשיעור נוסף.':'Playlist created and shiur added.');render();}});
  document.getElementById('libraryPlaylistCreateForm')?.addEventListener('submit',async event=>{event.preventDefault();const name=document.getElementById('libraryPlaylistCreateName')?.value||'';const pl=await createPlaylist(name);if(pl){state.activePlaylistId=pl.id;render();}});
  document.querySelectorAll('[data-playlist-open]').forEach(el=>el.addEventListener('click',()=>{state.activePlaylistId=el.dataset.playlistOpen;render();}));
  document.querySelectorAll('[data-playlist-back]').forEach(el=>el.addEventListener('click',()=>{state.activePlaylistId='';render();}));
  document.querySelectorAll('[data-playlist-delete]').forEach(el=>el.addEventListener('click',()=>deletePlaylist(el.dataset.playlistDelete)));
  document.querySelectorAll('[data-playlist-remove]').forEach(el=>el.addEventListener('click',()=>removeFromPlaylist(el.dataset.playlistRemove,el.dataset.playlistKey)));
  document.querySelectorAll('[data-playlist-play]').forEach(el=>el.addEventListener('click',()=>{const pl=state.playlists.find(row=>row.id===String(el.dataset.playlistPlay));const index=Number(el.dataset.playlistIndex)||0;if(pl?.items?.length)playMediaReference(pl.items[index],pl.items,index);}));
  document.querySelectorAll('[data-queue-prev]').forEach(el=>el.addEventListener('click',()=>advanceQueue(-1)));
  document.querySelectorAll('[data-queue-next]').forEach(el=>el.addEventListener('click',()=>advanceQueue(1)));
  document.querySelectorAll('[data-skip-choice]').forEach(el=>el.addEventListener('click',()=>{const value=Number(el.dataset.skipChoice)||15;state.skipSeconds=value;localStorage.setItem(SKIP_SECONDS_KEY,String(value));render();}));
  document.querySelectorAll('[data-paid-retry]').forEach(el=>el.addEventListener('click',()=>{state.paidLoaded=false;state.paidError='';loadPaidCatalog(true);}));

  document.getElementById('adminModeToggle')?.addEventListener('change', event => { state.adminMode=Boolean(event.target.checked); localStorage.setItem(ADMIN_MODE_KEY,state.adminMode?'1':'0'); setToast(state.adminMode?'Admin Mode enabled.':'Admin Mode hidden.'); render(); });
  document.querySelectorAll('[data-admin-refresh]').forEach(el=>el.addEventListener('click',async()=>{state.adminLoaded=false;await loadAdminData(true);}));
  document.querySelectorAll('[data-admin-live-save]').forEach(el=>el.addEventListener('click',saveAdminLive));
  document.getElementById('adminRibbonForm')?.addEventListener('submit',saveAdminRibbon);
  document.querySelectorAll('[data-admin-donations-refresh]').forEach(el=>el.addEventListener('click',async()=>{state.adminLoaded=false;await loadAdminData(true);setToast('Donations refreshed.');}));
  document.getElementById('adminSponsorPricesForm')?.addEventListener('submit',saveAdminSponsorPrices);
  document.getElementById('adminSponsorshipForm')?.addEventListener('submit',saveAdminSponsorship);
  document.getElementById('adminViewCountForm')?.addEventListener('submit',saveAdminViewCount);
  document.getElementById('adminAddForm')?.addEventListener('submit',addAdmin);
  document.querySelectorAll('[data-admin-remove]').forEach(el=>el.addEventListener('click',()=>removeAdmin(el.dataset.adminRemove)));
  document.querySelectorAll('[data-admin-sponsor-action]').forEach(el=>el.addEventListener('click',()=>adminSponsorshipAction(el.dataset.adminSponsorId,el.dataset.adminSponsorAction)));
  document.querySelectorAll('[data-admin-sponsor-cancel]').forEach(el=>el.addEventListener('click',()=>{state.adminEditingSponsorshipId='';render();}));
  document.querySelectorAll('[data-admin-review-action]').forEach(el=>el.addEventListener('click',()=>adminReviewAction(el.dataset.adminReviewFingerprint,el.dataset.adminReviewAction)));
  document.getElementById('adminScheduleAdsView')?.addEventListener('change',event=>{state.adminScheduleAdsView=event.target.value==='dropbox'?'dropbox':'review';if(state.adminScheduleAdsView==='dropbox')loadAdminDropboxAds(false);render();});
  document.querySelectorAll('[data-admin-dropbox-action]').forEach(el=>el.addEventListener('click',()=>adminDropboxAction(el.dataset.adminDropboxAction,el)));
  document.querySelectorAll('[data-admin-dropbox-folder]').forEach(el=>el.addEventListener('change',()=>adminDropboxFolderToggle(el)));
  document.querySelectorAll('[data-admin-dropbox-ad-hide]').forEach(el=>el.addEventListener('click',()=>adminDropboxAdHide(el)));
  document.querySelectorAll('[data-admin-dropbox-open]').forEach(el=>el.addEventListener('click',()=>openAdminDropboxFile(el)));
  document.querySelectorAll('[data-admin-dropbox-expiry-save]').forEach(el=>el.addEventListener('click',()=>adminDropboxSaveExpiry(el.dataset.adminDropboxExpirySave)));
  document.querySelectorAll('[data-admin-schedule-add]').forEach(el=>el.addEventListener('click',()=>openAdminScheduleEditor('')));
  document.querySelectorAll('[data-admin-schedule-edit]').forEach(el=>el.addEventListener('click',()=>openAdminScheduleEditor(el.dataset.adminScheduleEdit)));
  document.querySelectorAll('[data-admin-schedule-delete]').forEach(el=>el.addEventListener('click',()=>deleteAdminSchedule(el.dataset.adminScheduleDelete)));
  document.querySelectorAll('[data-admin-paid-add]').forEach(el=>el.addEventListener('click',()=>openAdminPaidEditor('')));
  document.querySelectorAll('[data-admin-paid-edit]').forEach(el=>el.addEventListener('click',()=>openAdminPaidEditor(el.dataset.adminPaidEdit)));
  document.querySelectorAll('[data-admin-paid-delete]').forEach(el=>el.addEventListener('click',()=>deleteAdminPaid(el.dataset.adminPaidDelete)));
  document.querySelectorAll('[data-admin-video-edit]').forEach(el=>el.addEventListener('click',event=>{event.stopPropagation();openAdminVideoEditor(el.dataset.adminVideoEdit,el.dataset.adminMediaKind==='audio'?'audio':'video');}));
  document.querySelectorAll('[data-admin-editor-close]').forEach(el=>el.addEventListener('click',()=>{const kind=el.dataset.adminEditorClose;if(kind==='schedule')state.adminScheduleEditor=null;if(kind==='paid')state.adminPaidEditor=null;if(kind==='video')state.adminVideoEditor=null;if(kind==='review')state.adminReviewEditor=null;render();}));
  document.getElementById('adminScheduleEditorForm')?.addEventListener('submit',saveAdminSchedule);
  document.getElementById('adminPaidEditorForm')?.addEventListener('submit',saveAdminPaid);
  document.getElementById('adminVideoEditorForm')?.addEventListener('submit',saveAdminVideo);
  document.querySelectorAll('[data-admin-option-add]').forEach(input=>input.addEventListener('change',()=>{if(input.value.trim()===(input.dataset.adminOptionAdd||'')){input.value='';input.placeholder=`Type a new ${input.getAttribute('data-admin-video-field')||'value'}…`;input.focus();}}));
  document.getElementById('adminReviewEditorForm')?.addEventListener('submit',approveAdminReview);
  document.querySelectorAll('[data-review-remove]').forEach(el=>el.addEventListener('click',()=>{const i=Number(el.dataset.reviewRemove);state.adminReviewEditor.events=collectReviewEvents();state.adminReviewEditor.events.splice(i,1);render();}));
  document.querySelectorAll('[data-review-add]').forEach(el=>el.addEventListener('click',()=>{state.adminReviewEditor.events=collectReviewEvents();state.adminReviewEditor.events.push({date:donationTodayIso(),startTime:'',endTime:'',location:'',venue:'',speaker:'',title:''});render();}));


  document.getElementById('scheduleCityFilter')?.addEventListener('change', event => { state.scheduleCityFilter = event.target.value || 'all'; localStorage.setItem(SCHEDULE_CITY_FILTER_KEY, state.scheduleCityFilter); render(); });
  document.querySelectorAll('[data-schedule-view]').forEach(el => el.addEventListener('click', () => {
    state.scheduleView = el.dataset.scheduleView === 'flyers' ? 'flyers' : 'upcoming';
    render();
  }));

  document.querySelectorAll('[data-paid-expand]').forEach(el => el.addEventListener('click', () => {
    const id = String(el.dataset.paidExpand || '');
    state.paidExpandedId = state.paidExpandedId === id ? '' : id;
    if(state.paidExpandedId){const product=state.paidCatalog.find(item=>String(item.id)===id);const first=product?.tracks?.[0];if(first)prefetchPaidTrack(id,first.id);}
    render();
  }));
  document.querySelectorAll('[data-paid-description]').forEach(el => el.addEventListener('click', () => {
    const id = String(el.dataset.paidDescription || '');
    const panel = document.querySelector(`[data-paid-description-panel="${CSS.escape(id)}"]`);
    if (panel) panel.hidden = !panel.hidden;
  }));
  document.querySelectorAll('[data-paid-image-dot]').forEach(dot=>dot.addEventListener('click',()=>{const carousel=dot.closest('[data-paid-carousel]');const track=carousel?.querySelector('.paid-cover-track');const index=Number(dot.dataset.paidImageDot)||0;if(track)track.scrollTo({left:index*track.clientWidth,behavior:'smooth'});}));
  document.querySelectorAll('[data-paid-image-open]').forEach(el=>el.addEventListener('click',event=>{event.stopPropagation();openPaidImageViewer(el.dataset.paidImageOpen);}));
  document.querySelectorAll('[data-paid-carousel]').forEach(carousel=>{const track=carousel.querySelector('.paid-cover-track');if(!track||track.dataset.boundScroll)return;track.dataset.boundScroll='1';track.addEventListener('scroll',()=>{const index=Math.round(track.scrollLeft/Math.max(1,track.clientWidth));carousel.querySelectorAll('[data-paid-image-dot]').forEach((dot,i)=>dot.classList.toggle('active',i===index));},{passive:true});});
  document.querySelectorAll('[data-paid-attachment-view]').forEach(el=>el.addEventListener('click',()=>openPaidAttachment(el.dataset.paidProduct,el.dataset.paidAttachmentView,false)));
  document.querySelectorAll('[data-paid-attachment-download]').forEach(el=>el.addEventListener('click',()=>openPaidAttachment(el.dataset.paidProduct,el.dataset.paidAttachmentDownload,true)));
  document.querySelectorAll('[data-paid-track]').forEach(el => { el.addEventListener('pointerdown', () => prefetchPaidTrack(el.dataset.paidProduct, el.dataset.paidTrack), {passive:true}); el.addEventListener('click', () => playPaidTrack(el.dataset.paidProduct, el.dataset.paidTrack)); });
  document.querySelectorAll('[data-paid-purchase]').forEach(el => el.addEventListener('click', () => initPaidCheckout(el.dataset.paidPurchase)));
  document.querySelectorAll('[data-paid-checkout-close]').forEach(el => el.addEventListener('click', closePaidCheckout));
  document.querySelectorAll('[data-paid-modal-backdrop]').forEach(el => el.addEventListener('click', event => { if (event.target === el) closePaidCheckout(); }));
  document.getElementById('paidPayButton')?.addEventListener('click', confirmPaidCheckout);
  document.querySelectorAll('[data-paid-bookmark-current]').forEach(el => el.addEventListener('click', () => savePaidAudioProgress(true, true)));
  document.querySelectorAll('[data-paid-go-bookmark]').forEach(el => el.addEventListener('click', goToPaidBookmark));
  document.querySelectorAll('[data-recurring-action]').forEach(el => el.addEventListener('click', () => updateRecurringDonation(el.dataset.recurringId, el.dataset.recurringAction)));

  document.querySelectorAll('[data-trend-period]').forEach(el => el.addEventListener('click', () => {
    state.homeTrendPeriod = el.dataset.trendPeriod;
    render();
  }));

  document.querySelectorAll('[data-library-mode]').forEach(el => el.addEventListener('click', () => {
    state.libraryMode = el.dataset.libraryMode;
    // Changing All / Video / Audio always starts with every filter included.
    // In the app an empty filter array means "All" for that filter.
    state.filters = { location: [], year: [], language: [], speaker: [], topic: [] };
    state.filterDialog = '';
    state.filterDraft = new Set();
    state.libraryLimit = 48;
    render();
  }));

  document.querySelectorAll('[data-library-section]').forEach(el => el.addEventListener('click', async () => {
    state.librarySection = el.dataset.librarySection;
    if (state.librarySection === 'history') await reloadHistory();
    if (state.librarySection !== 'playlists') state.activePlaylistId = '';
    render();
  }));

  document.querySelectorAll('[data-auth-mode]').forEach(el => el.addEventListener('click', () => {
    state.authMode = el.dataset.authMode;
    state.authMessage = '';
    render();
  }));

  document.querySelectorAll('[data-google-login]').forEach(el => el.addEventListener('click', () => loginWithGoogle()));
  document.querySelectorAll('[data-apple-login]').forEach(el => el.addEventListener('click', () => loginWithApple()));
  document.getElementById('verifyEmailCodeForm')?.addEventListener('submit',event=>{event.preventDefault();verifyEmailCode(document.getElementById('authVerificationCode')?.value||'');});
  document.querySelectorAll('[data-resend-verification]').forEach(el=>el.addEventListener('click',()=>resendEmailVerificationCode()));
  document.getElementById('authVerificationCode')?.addEventListener('input',event=>{event.target.value=String(event.target.value||'').replace(/\D/g,'').slice(0,6);});

  const authForm = document.getElementById('authForm');
  if (authForm) authForm.addEventListener('submit', event => {
    event.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (state.authMode === 'register') register(document.getElementById('authName').value.trim(), email, password);
    else login(email, password);
  });

  const forgotPasswordForm = document.getElementById('forgotPasswordForm');
  if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', event => {
    event.preventDefault();
    requestPasswordReset(document.getElementById('forgotEmail').value.trim());
  });


  document.querySelectorAll('[data-account-section]').forEach(el => el.addEventListener('click', () => {
    state.accountSection = el.dataset.accountSection || 'profile';
    if (state.accountSection === 'purchases') { state.recurringLoaded = false; }
    if (state.accountSection === 'admin' && state.isAdmin) { state.adminLoaded = false; loadAdminData(true); }
    if (state.accountSection === 'settings') {
      // Open Settings immediately. Push permission/token/server checks can be slow
      // on Android and must not block the tab from becoming visible.
      render();
      reloadNotificationSettings().finally(() => {
        if (state.screen === 'account' && state.accountSection === 'settings') render();
      });
    } else render();
  }));
  document.getElementById('appPushToggle')?.addEventListener('change', event => setAppPushEnabled(event.target.checked));
  document.getElementById('appEmailToggle')?.addEventListener('change', event => setAppEmailEnabled(event.target.checked));
  document.getElementById('upcomingReminderToggle')?.addEventListener('change', event => setUpcomingReminders(event.target.checked));
  document.getElementById('upcomingReminderMinutes')?.addEventListener('change', event => { state.upcomingReminderMinutes=Number(event.target.value)||30; localStorage.setItem(UPCOMING_REMINDER_MINUTES_KEY,String(state.upcomingReminderMinutes)); if(state.upcomingRemindersEnabled) scheduleUpcomingReminders().catch(()=>{}); });
  document.querySelectorAll('[data-reminder-city]').forEach(el=>el.addEventListener('change',event=>updateReminderLocation(event.target.dataset.reminderCity,event.target.checked)));
  document.querySelectorAll('[data-reminder-all-cities]').forEach(el=>el.addEventListener('change',event=>setAllReminderLocations(event.target.checked)));

  const profileForm = document.getElementById('profileForm');
  if (profileForm) profileForm.addEventListener('submit', event => {
    event.preventDefault();
    updateProfile(document.getElementById('profileName').value.trim(), document.getElementById('profilePassword').value);
  });

  document.querySelectorAll('[data-logout]').forEach(el => el.addEventListener('click', logout));
  document.querySelectorAll('[data-delete-open]').forEach(el => el.addEventListener('click', () => { state.deleteDialog = true; render(); }));
  document.querySelectorAll('[data-delete-cancel]').forEach(el => el.addEventListener('click', event => {
    if (state.deleteBusy) return;
    if (event.target.closest('[data-delete-dialog]')) return;
    state.deleteDialog = false;
    render();
  }));
  document.querySelectorAll('.confirm-cancel[data-delete-cancel]').forEach(el => el.addEventListener('click', event => { event.stopPropagation(); if (!state.deleteBusy) { state.deleteDialog = false; render(); } }));
  document.querySelectorAll('[data-delete-dialog]').forEach(el => el.addEventListener('click', event => event.stopPropagation()));
  document.querySelectorAll('[data-delete-confirm]').forEach(el => el.addEventListener('click', deleteCurrentAccount));

  const librarySearch = document.getElementById('librarySearch');
  if (librarySearch) librarySearch.addEventListener('input', () => {
    state.libraryQuery = librarySearch.value;
    state.libraryLimit = 48;
    refreshSearchAssist();
    clearTimeout(librarySearch._timer);
    librarySearch._timer = setTimeout(runLibrarySearch, 110);
  });


  if (librarySearch) librarySearch.addEventListener('keydown', event => { if(event.key==='Enter'){ if(String(librarySearch.value||'').trim()) usageAnalytics.event('search',{dedupeKey:'app-search',cooldownMs:2000}); rememberLibrarySearch(librarySearch.value); refreshSearchAssist(); librarySearch.blur(); } });
  bindSearchAssist(document);

  const librarySearchMode = document.getElementById('librarySearchMode');
  if (librarySearchMode) librarySearchMode.addEventListener('change', () => {
    state.librarySearchMode = librarySearchMode.value === 'content' ? 'content' : 'catalog';
    state.libraryLimit = 48;
    runLibrarySearch();
  });

  document.querySelectorAll('[data-toggle-library-filters]').forEach(el => el.addEventListener('click', () => {
    state.filterPanelOpen = !state.filterPanelOpen;
    render();
  }));

  document.querySelectorAll('[data-library-sort]').forEach(el => el.addEventListener('click', () => {
    state.librarySort = el.dataset.librarySort;
    state.libraryLimit = 48;
    render();
  }));

  document.querySelectorAll('[data-open-filter]').forEach(el => el.addEventListener('click', () => {
    const key = el.dataset.openFilter;
    const options = availableFilters();
    const values = key === 'location' ? options.locations : key === 'year' ? options.years : key === 'language' ? options.languages : key === 'speaker' ? options.speakers : options.topics;
    state.filterDialog = key;
    state.filterDraft = state.filters[key] && state.filters[key].length ? new Set(state.filters[key].map(String)) : new Set(values.map(String));
    render();
  }));

  document.querySelectorAll('[data-filter-option]').forEach(el => el.addEventListener('change', () => {
    const value = el.dataset.filterOption;
    if (el.checked) state.filterDraft.add(value); else state.filterDraft.delete(value);
    if (state.filterDialog) {
      const options = availableFilters();
      const values = state.filterDialog === 'location' ? options.locations : state.filterDialog === 'year' ? options.years : state.filterDialog === 'language' ? options.languages : state.filterDialog === 'speaker' ? options.speakers : options.topics;
      syncOpenFilterChecks(state.filterDialog, values);
    }
  }));
  document.querySelectorAll('[data-filter-all]').forEach(el => el.addEventListener('change', () => {
    const key = el.dataset.filterAll;
    const options = availableFilters();
    const values = key === 'location' ? options.locations : key === 'year' ? options.years : key === 'language' ? options.languages : key === 'speaker' ? options.speakers : options.topics;
    state.filterDraft = el.checked ? new Set(values.map(String)) : new Set();
    syncOpenFilterChecks(key, values);
  }));
  document.querySelectorAll('[data-location-parent]').forEach(el => el.addEventListener('change', () => {
    const parent = String(el.dataset.locationParent || '');
    const options = availableFilters();
    const ids = options.locations.map(String).filter(value => value === parent || value.startsWith(`${parent}|`));
    if (el.checked) ids.forEach(id => state.filterDraft.add(id)); else ids.forEach(id => state.filterDraft.delete(id));
    syncOpenFilterChecks('location', options.locations);
  }));
  document.querySelectorAll('[data-topic-parent]').forEach(el => el.addEventListener('change', () => {
    const parentId = String(el.dataset.topicParent || '');
    const options = availableFilters();
    const available = new Set(options.topics.map(String));
    const ids = [...topicChildren(parentId).filter(id => available.has(id)), ...(available.has(parentId) ? [parentId] : [])];
    if (el.checked) ids.forEach(id => state.filterDraft.add(id)); else ids.forEach(id => state.filterDraft.delete(id));
    syncOpenFilterChecks('topic', options.topics);
  }));
  document.querySelectorAll('[data-filter-clear]').forEach(el => el.addEventListener('click', () => {
    state.filterDraft.clear();
    document.querySelectorAll('[data-filter-option], [data-filter-all], [data-topic-parent], [data-location-parent]').forEach(box => { box.checked = false; });
    const count = document.getElementById('filterDraftCount');
    if (count) count.textContent = '';
  }));
  document.querySelectorAll('[data-filter-apply]').forEach(el => el.addEventListener('click', () => {
    if (state.filterDialog) {
      const key = state.filterDialog;
      const options = availableFilters();
      const values = key === 'location' ? options.locations : key === 'year' ? options.years : key === 'language' ? options.languages : key === 'speaker' ? options.speakers : options.topics;
      const selected = [...state.filterDraft];
      state.filters[key] = values.length > 0 && selected.length === values.length ? [] : selected;
    }
    state.filterDialog = '';
    state.filterDraft = new Set();
    state.libraryLimit = 48;
    render();
  }));
  document.querySelectorAll('[data-close-filter]').forEach(el => el.addEventListener('click', event => {
    if (event.target.closest('[data-filter-sheet]') && !event.target.matches('[data-close-filter]')) return;
    state.filterDialog = '';
    state.filterDraft = new Set();
    render();
  }));
  document.querySelectorAll('[data-filter-sheet]').forEach(el => el.addEventListener('click', event => event.stopPropagation()));

  document.querySelectorAll('[data-remove-filter]').forEach(el => el.addEventListener('click', () => { const key=el.dataset.removeFilter; const value=String(el.dataset.removeFilterValue||''); if(state.filters[key]) state.filters[key]=state.filters[key].filter(item=>String(item)!==value); state.libraryLimit=48; render(); }));

  document.querySelectorAll('[data-clear-filters]').forEach(el => el.addEventListener('click', () => {
    state.filters = { location: [], year: [], language: [], speaker: [], topic: [] };
    state.libraryQuery = '';
    state.transcriptMatchedVideoIds = new Set();
    state.libraryLimit = 48;
    render();
  }));

  document.querySelectorAll('[data-load-more]').forEach(el => el.addEventListener('click', () => {
    state.libraryLimit += 48;
    refreshShiurimResults();
  }));

  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch) globalSearch.addEventListener('input', () => {
    state.searchQuery = globalSearch.value;
    clearTimeout(globalSearch._timer);
    globalSearch._timer = setTimeout(render, 180);
  });

  document.querySelectorAll('[data-search-mode]').forEach(el => el.addEventListener('click', () => {
    state.searchMode = el.dataset.searchMode;
    render();
  }));

  document.querySelectorAll('[data-refresh-schedule]').forEach(el => el.addEventListener('click', () => {
    state.scheduleLoaded = false;
    state.scheduleFiles = [];
    state.scheduleError = '';
    loadSchedule(true);
  }));

  const contactForm = document.getElementById('contactForm');
  if (contactForm) contactForm.addEventListener('submit', submitContact);

  document.querySelectorAll('[data-watch]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    const requestedTime = el.dataset.watchTime == null || el.dataset.watchTime === '' ? null : Number(el.dataset.watchTime);
    openWatch(el.dataset.watch, requestedTime);
  }));
  document.querySelectorAll('[data-listen-video]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    playVideoAudio(el.dataset.listenVideo);
  }));
  document.querySelectorAll('[data-listen-audio]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    playLibraryAudio(el.dataset.listenAudio);
  }));

  document.querySelectorAll('[data-like]').forEach(el => el.addEventListener('click', async event => {
    event.stopPropagation();
    await preserveWatchTime();
    toggleLike(el.dataset.like);
  }));
  document.querySelectorAll('[data-save]').forEach(el => el.addEventListener('click', async event => {
    event.stopPropagation();
    await preserveWatchTime();
    toggleWatchLater(el.dataset.save);
  }));

  document.querySelectorAll('[data-follow-type]').forEach(el => el.addEventListener('click', async () => {
    await preserveWatchTime();
    toggleFollow(el.dataset.followType, el.dataset.followKey, el.dataset.followLabel);
  }));

  document.querySelectorAll('[data-share-kind]').forEach(el => el.addEventListener('click', () => shareItem(el.dataset.shareKind, el.dataset.shareId)));
  document.querySelectorAll('[data-download-kind]').forEach(el => el.addEventListener('click', () => downloadItem(el.dataset.downloadKind, el.dataset.downloadId)));

  document.querySelectorAll('[data-play-toggle]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    togglePlay();
  }));
  document.querySelectorAll('[data-skip]').forEach(el => el.addEventListener('click', event => {
    event.stopPropagation();
    skip(Number(el.dataset.skip) || 0);
  }));
  document.querySelectorAll('[data-open-player]').forEach(el => el.addEventListener('click', event => {
    if (event.target.closest('button')) return;
    if (state.watchVideo && state.watchMode === 'audio') parkHostedVideoForAudio();
    state.playerOpen = true;
    render();
  }));
  document.querySelectorAll('[data-close-player]').forEach(el => el.addEventListener('click', () => {
    state.playerOpen = false;
    render();
  }));
  document.querySelectorAll('[data-close-player-backdrop]').forEach(el => el.addEventListener('click', event => {
    if (event.target.dataset.closePlayerBackdrop) {
      state.playerOpen = false;
      render();
    }
  }));
  document.querySelectorAll('[data-player-sheet]').forEach(el => {
    el.addEventListener('click', event => event.stopPropagation());
    bindPlayerSwipeToClose(el);
  });
  document.querySelectorAll('[data-player-watch]').forEach(el => el.addEventListener('click', async () => {
    const time = playbackPositionSeconds() || 0;
    const wasPlaying = !playbackIsPaused();
    state.playerOpen = false;
    await openWatch(el.dataset.playerWatch, time, { fromAudio:true, wasPlaying });
  }));

  const seek = document.getElementById('fullSeek');
  if (seek) seek.addEventListener('input', () => {
    PlaybackController.seekTo(Number(seek.value) || 0).catch(()=>{});
  });
  document.querySelectorAll('[data-speed-choice]').forEach(el => el.addEventListener('click', () => {
    PlaybackController.setSpeed(Number(el.dataset.speedChoice) || 1).then(()=>render()).catch(()=>render());
  }));
  document.querySelectorAll('[data-sleep-choice]').forEach(el => el.addEventListener('click', () => setSleepTimer(el.dataset.sleepChoice)));
  const watchAudioSeek = document.getElementById('watchAudioSeek');
  if (watchAudioSeek) watchAudioSeek.addEventListener('input', () => {
    PlaybackController.seekTo(Number(watchAudioSeek.value) || 0).catch(()=>{});
  });

  document.querySelectorAll('[data-close-watch]').forEach(el => el.addEventListener('click', () => closeWatch(true)));
  document.querySelectorAll('[data-watch-mode]').forEach(el => el.addEventListener('click', () => switchWatchMode(el.dataset.watchMode)));
  document.querySelectorAll('[data-switch-audio]').forEach(el => el.addEventListener('click', () => switchWatchMode('audio')));
  document.querySelectorAll('[data-switch-video]').forEach(el => el.addEventListener('click', () => switchWatchMode('video')));

  document.querySelectorAll('[data-minimize-watch]').forEach(el => el.addEventListener('click', minimizeWatchToPersistent));
  document.querySelectorAll('[data-video-pip]').forEach(el => el.addEventListener('click', enterSystemPictureInPicture));
  document.querySelectorAll('[data-expand-watch]').forEach(el => el.addEventListener('click', expandPersistentWatch));
  document.querySelectorAll('[data-close-mini-video]').forEach(el => el.addEventListener('click', () => closeWatch(true)));
  const downloadMount = document.getElementById('downloadManagerMount');
  if (downloadMount) bindDownloadManager(downloadMount);

  const commentForm = document.getElementById('commentForm');
  if (commentForm) commentForm.addEventListener('submit', event => {
    event.preventDefault();
    postComment();
  });
  bindCommentButtons();

  document.querySelectorAll('[data-remove-history]').forEach(el => el.addEventListener('click', () => removeHistory(el.dataset.removeHistory)));
  document.querySelectorAll('[data-clear-history]').forEach(el => el.addEventListener('click', clearHistory));
}

function refreshInteractiveUi() {
  document.querySelectorAll('[data-save-offline-kind]').forEach(refreshOfflineButtonElement);
  document.querySelectorAll('[data-like]').forEach(button => {
    const id = button.dataset.like;
    const liked = state.myLikes.has(id);
    const count = Number(state.likeCounts[id]) || 0;
    button.classList.toggle('active', liked);
    const countNode = button.querySelector('.card-like-count, .watch-action-text');
    if (button.classList.contains('watch-action')) {
      if (countNode) countNode.textContent = String(count);
    } else if (button.closest('.player-action-grid')) {
      const label = button.querySelector('span:not(.ui-icon)');
      if (label) label.textContent = liked ? 'Liked' : 'Like';
    } else if (button.classList.contains('icon-action')) {
      if (countNode) countNode.textContent = String(count);
    }
  });
  document.querySelectorAll('[data-save]').forEach(button => {
    const id = button.dataset.save;
    const saved = state.watchLater.has(id);
    button.classList.toggle('saved', saved);
    if (button.classList.contains('watch-action')) {
      const label = button.querySelector('.watch-action-text');
      if (label) label.textContent = saved ? 'Saved' : 'Later';
    } else if (button.closest('.player-action-grid')) {
      const label = button.querySelector('span:not(.ui-icon)');
      if (label) label.textContent = saved ? 'Saved' : (id.startsWith('audio:') ? 'Listen Later' : 'Watch Later');
    }
  });
  refreshSaveDestinationButtons();
  document.querySelectorAll('[data-follow-type]').forEach(button => {
    const identity = `${button.dataset.followType}:${button.dataset.followKey}`;
    const following = state.follows.has(identity);
    button.classList.toggle('active', following);
    const label = button.dataset.followLabel || '';
    button.innerHTML = `${following ? 'Following' : 'Follow'} ${esc(label)}`;
  });
}

function refreshCommentsUi() {
  const heading = document.getElementById('commentsHeading');
  if (heading) heading.textContent = `Comments (${state.watchComments.length})`;
  const list = document.querySelector('.comments-list');
  if (list) {
    list.innerHTML = commentsHtml();
    bindCommentButtons();
  }
}

function bindCommentButtons() {
  document.querySelectorAll('[data-retry-comments]').forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', () => loadComments());
  });
  document.querySelectorAll('[data-edit-comment]').forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', () => editComment(el.dataset.editComment));
  });
  document.querySelectorAll('[data-delete-comment]').forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', () => deleteComment(el.dataset.deleteComment));
  });
  document.querySelectorAll('[data-save-comment]').forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', () => saveEditedComment(el.dataset.saveComment));
  });
  document.querySelectorAll('[data-cancel-comment]').forEach(el => {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', () => { state.editingCommentId = ''; refreshCommentsUi(); });
  });
}

function waitForScheduleImage(img, timeoutMs = 15000) {
  return new Promise(resolve => {
    if (!img) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    img.addEventListener('load', finish, { once:true });
    img.addEventListener('error', finish, { once:true });
    if (img.complete) finish();
  });
}

function setScheduleFlyerProgress(done, total, text = '') {
  const loader = document.getElementById('scheduleFlyerLoadingState');
  if (!loader) return;
  const count = total > 0 ? ` ${Math.min(done,total)} of ${total}` : '';
  loader.innerHTML = `<strong>${esc(text || 'Loading all original flyers...')}</strong><span>${esc(count.trim())}</span>`;
}

async function loadSchedule(force = false) {
  if (state.screen !== 'schedule' || state.scheduleView !== 'flyers') return;
  if (state.scheduleLoading) return;
  const box = document.getElementById('scheduleAds');
  state.scheduleLoading = true;
  state.scheduleError = '';
  if (box) box.innerHTML = '<div id="scheduleFlyerLoadingState" class="loading"><strong>Loading all original flyers...</strong><span>Getting flyer list</span></div>';
  try {
    if (!state.scheduleLoaded || force) {
      const data = await publicJson(`/schedule-files?v=${Date.now()}`);
      state.scheduleFiles = Array.isArray(data) ? data : (data.items || []);
      state.scheduleLoaded = true;
    }
    await renderScheduleFiles(true);
  } catch (error) {
    state.scheduleError = 'Could not load the current schedule.';
  } finally {
    state.scheduleLoading = false;
    const currentBox = document.getElementById('scheduleAds');
    if (state.scheduleError) {
      if (currentBox) currentBox.innerHTML = `<div class="error">${esc(state.scheduleError)}</div>`;
    } else {
      document.getElementById('scheduleFlyerLoadingState')?.remove();
      if (!state.scheduleFiles.length && currentBox) currentBox.innerHTML = '<div class="empty">No schedule files are available right now.</div>';
    }
  }
}

async function renderScheduleFiles(showLoading = false) {
  if (state.screen !== 'schedule' || state.scheduleView !== 'flyers') return;
  const box = document.getElementById('scheduleAds');
  if (!box) return;
  if (state.scheduleError) { box.innerHTML = `<div class="error">${esc(state.scheduleError)}</div>`; return; }
  if (!state.scheduleFiles.length) {
    box.innerHTML = showLoading
      ? '<div id="scheduleFlyerLoadingState" class="loading"><strong>Loading all original flyers...</strong><span>Waiting for flyers</span></div>'
      : '<div class="empty">No schedule files are available right now.</div>';
    return;
  }
  box.innerHTML = showLoading ? '<div id="scheduleFlyerLoadingState" class="loading"><strong>Loading all original flyers...</strong><span>0</span></div>' : '';
  const total = state.scheduleFiles.length;
  let done = 0;
  setScheduleFlyerProgress(done,total);
  for (const file of state.scheduleFiles) {
    // A render() elsewhere may have replaced the flyer panel. Abort this pass
    // rather than making a hidden/stale panel look finished.
    if (document.getElementById('scheduleAds') !== box) return;
    const name = String(file.name || file.title || 'Schedule flyer');
    const lowerName = name.toLowerCase();
    const imageUrl = String(file.imageUrl || (/\.(?:jpg|jpeg|png|webp)$/i.test(lowerName) ? file.url : '') || '');
    const pdfUrl = String(file.pdfUrl || (/\.pdf$/i.test(lowerName) ? file.url : '') || '');
    const openUrl = imageUrl || String(file.url || '') || pdfUrl;
    const card = document.createElement('article');
    card.className = 'schedule-flyer-card';
    const preview = document.createElement('div');
    preview.className = 'schedule-flyer-preview';
    card.appendChild(preview);
    box.appendChild(card);
    if (imageUrl) {
      const img = document.createElement('img');
      img.alt = file.title || file.name || 'Shiurim schedule';
      img.loading = 'eager';
      img.decoding = 'async';
      preview.appendChild(img);
      img.src = imageUrl;
      await waitForScheduleImage(img);
    } else if (pdfUrl) {
      await renderSchedulePdf(pdfUrl, preview);
    } else if (openUrl) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = name;
      preview.appendChild(empty);
    }
    const controls = document.createElement('div');
    controls.className = 'schedule-flyer-actions';
    if (openUrl) {
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open Ad';
      open.addEventListener('click', () => openExternal(openUrl));
      controls.appendChild(open);
    }
    if (pdfUrl) {
      const pdf = document.createElement('button');
      pdf.type = 'button';
      pdf.textContent = 'Open PDF';
      pdf.addEventListener('click', () => openExternal(pdfUrl));
      controls.appendChild(pdf);
    }
    if (controls.childElementCount) card.appendChild(controls);
    done += 1;
    setScheduleFlyerProgress(done,total);
  }
}

async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  if (ensurePdfJs.promise) return ensurePdfJs.promise;
  ensurePdfJs.promise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-irgun-pdfjs]');
    if (existing) {
      existing.addEventListener('load', () => window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error('PDF viewer unavailable')), { once:true });
      existing.addEventListener('error', () => reject(new Error('PDF viewer could not load')), { once:true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.dataset.irgunPdfjs = '1';
    script.onload = () => window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error('PDF viewer unavailable'));
    script.onerror = () => reject(new Error('PDF viewer could not load'));
    document.head.appendChild(script);
  }).catch(error => { ensurePdfJs.promise = null; throw error; });
  return ensurePdfJs.promise;
}

async function renderSchedulePdf(url, box) {
  try {
    const pdfjs = await ensurePdfJs();
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const response = await fetch(url, { cache:'no-store' });
    if (!response.ok) throw new Error(`PDF returned ${response.status}`);
    const bytes = await response.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data:bytes }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: Math.min(2, Math.max(1.2, window.devicePixelRatio || 1.5)) });
      const holder = document.createElement('div');
      holder.className = 'schedule-page';
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      holder.appendChild(canvas);
      box.appendChild(holder);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  } catch (error) {
    console.warn('Schedule PDF render failed', error);
    const fallback = document.createElement('div');
    fallback.className = 'schedule-pdf-fallback';
    fallback.innerHTML = `<strong>PDF flyer</strong><span>Tap Open PDF below to view the original flyer.</span>`;
    box.appendChild(fallback);
  }
}

async function submitContact(event) {
  event.preventDefault();
  const result = document.getElementById('contactResult');
  const button = document.getElementById('contactSubmit');
  const payload = {
    name: document.getElementById('contactName').value.trim(),
    email: document.getElementById('contactEmail').value.trim(),
    phone: document.getElementById('contactPhone').value.trim(),
    subject: document.getElementById('contactSubject').value.trim(),
    message: document.getElementById('contactMessage').value.trim()
  };
  if (button) button.disabled = true;
  if (result) { result.className = 'contact-result'; result.textContent = 'Sending...'; }
  try {
    const response = await apiJson('/contact-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.success) throw new Error(response.error || 'Message could not be sent.');
    if (result) { result.className = 'contact-result success'; result.textContent = 'Thank you! Your message was sent successfully.'; }
    event.currentTarget.reset();
  } catch (error) {
    if (result) { result.className = 'contact-result error-text'; result.textContent = error.message || 'Sorry, something went wrong.'; }
  } finally {
    if (button) button.disabled = false;
  }
}

async function openExternal(url) {
  if (!url) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await IrgunDownloader.openExternal({ url:String(url) });
      return;
    } catch (error) {
      console.warn('Native external open failed; using web fallback.', error);
    }
  }
  window.open(url, '_blank', 'noopener');
}

async function shareItem(kind, id) {
  let title = 'Irgun Shiurai Torah';
  let url = WEBSITE;
  if (kind === 'video') {
    const item = state.videoById.get(String(id));
    if (item) title = displayShiurTitle(item.title, title);
    url = `${WEBSITE}watch.html?v=${encodeURIComponent(id)}`;
  } else {
    const item = state.audioById.get(String(id));
    if (item) title = displayShiurTitle(item.title || item.name, title);
    url = `${WEBSITE}videos.html?tab=audio&audio=${encodeURIComponent(id)}`;
  }
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title, text: title, url, dialogTitle: tr('Share Shiur') });
    } else if (navigator.share) {
      await navigator.share({ title, text: title, url });
    } else {
      await navigator.clipboard.writeText(url);
      setToast('Link copied.');
    }
  } catch (_) {}
}

function closeDownloadDialog() {
  const dialog = document.getElementById('nativeDownloadDialog');
  if (dialog) dialog.remove();
}

function downloadChoicesFor(kind, id) {
  if (kind === 'audio') {
    const item = state.audioById.get(String(id));
    return item ? { item, title: displayShiurTitle(item.title || item.name, 'Shiur'), audioId: String(id), audio: true, video: false } : null;
  }
  const item = state.videoById.get(String(id));
  if (!item) return null;
  const apiId = mediaApiId(item, id);
  return { item, title: displayShiurTitle(item.title, 'Shiur'), audioId: apiId, videoId: apiId, audio: Boolean(item.hasAudio), video: Boolean(item.hasDriveVideo) };
}

function downloadItem(kind, id) {
  const info = downloadChoicesFor(kind, id);
  if (!info) return alert('This shiur is not available for download.');
  closeDownloadDialog();
  const dialog = document.createElement('div');
  dialog.id = 'nativeDownloadDialog';
  dialog.className = 'download-dialog-backdrop';
  dialog.innerHTML = `<section class="download-dialog" role="dialog" aria-modal="true"><div class="download-dialog-head"><div><h2>Download</h2><p>${esc(info.title)}</p></div><button data-download-close="1">×</button></div><div class="download-choice-list">${info.video ? '<button data-download-choice="video"><strong>Download Video</strong><span>MP4 from Irgun storage</span></button>' : ''}${info.audio ? '<button data-download-choice="audio"><strong>Download Audio</strong><span>MP3 from Irgun storage</span></button>' : ''}${!info.video && !info.audio ? '<div class="empty">No downloadable file is available.</div>' : ''}</div><div id="downloadStatus" class="download-status"></div></section>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click', event => { if (event.target === dialog) closeDownloadDialog(); });
  dialog.querySelector('[data-download-close]')?.addEventListener('click', closeDownloadDialog);
  dialog.querySelectorAll('[data-download-choice]').forEach(button => button.addEventListener('click', () => nativeDownload(info, button.dataset.downloadChoice)));
}

async function nativeDownload(info, choice) {
  const isVideo = choice === 'video';
  const identifier = isVideo ? info.videoId : info.audioId;
  const type = isVideo ? 'drive-video' : 'audio';
  const extension = isVideo ? 'mp4' : 'mp3';
  const filename = sanitizeDownloadFilename(info.title, extension);
  const url = `${API}/download/${encodeURIComponent(identifier)}?type=${type}`;
  const jobId = `ist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = { id: jobId, title: `${info.title} · ${isVideo ? 'Video' : 'Audio'}`, filename, status: 'queued', percent: 0 };
  state.downloadJobs.set(jobId, job);
  state.downloadPanelOpen = true;
  closeDownloadDialog();
  refreshDownloadManager();

  if (Capacitor.isNativePlatform()) {
    try {
      await initNativeDownloader();
      await IrgunDownloader.start({ id: jobId, url, filename, title: info.title, mimeType: isVideo ? 'video/mp4' : 'audio/mpeg' });
      state.downloadJobs.set(jobId, { ...job, status: 'running' });
      refreshDownloadManager();
      return;
    } catch (error) {
      console.warn('Managed native downloader unavailable; using fallback', error);
    }
  }

  try {
    const controller = new AbortController();
    state.downloadJobs.set(jobId, { ...job, status: 'running', controller });
    refreshDownloadManager();
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
    state.downloadJobs.set(jobId, { ...state.downloadJobs.get(jobId), status: 'completed', percent: 100 });
    refreshDownloadManager();
  } catch (error) {
    const cancelled = error && error.name === 'AbortError';
    state.downloadJobs.set(jobId, { ...state.downloadJobs.get(jobId), status: cancelled ? 'cancelled' : 'error' });
    refreshDownloadManager();
  }
}

function resetWatchPresentationForStandaloneAudio() {
  // Standalone Listen/History playback must never inherit a visible or parked
  // watch-page layer from an earlier Vimeo lecture. The persistent Vimeo host
  // lives outside #app, so simply clearing state.watchVideo is not enough: an
  // old fixed watch overlay can otherwise survive the next render and appear as
  // a white/duplicate strip above the audio player.
  const oldPlayer = state.watchVimeo;
  const oldVideo = state.watchVideo;
  const oldId = oldVideo ? videoId(oldVideo) : '';
  const oldMode = String(state.watchMode || 'video');
  const oldAudioSnapshot = oldMode === 'audio' && oldId ? captureCurrentAudioHistorySnapshot(oldId) : null;
  const oldSeconds = Math.max(0, Number(state.watchResumeSeconds) || Number(oldAudioSnapshot?.position) || 0);
  const oldDuration = Math.max(0, Number(oldVideo?.duration) || Number(oldAudioSnapshot?.duration) || 0);

  // Remove the visual host synchronously before the new audio render. Destroy
  // Vimeo asynchronously so a slow iframe teardown never delays the user's tap.
  clearPersistentVideoMount();
  document.body.classList.remove('irgun-system-pip', 'irgun-watch-mini-hosted');
  setNativePipEligibility(false);
  setNativeVideoFullscreen(false);

  state.watchVideo = null;
  state.watchVimeo = null;
  state.watchVimeoReady = false;
  state.watchVideoPlaying = false;
  state.watchHostedExternally = false;
  state.watchMinimized = false;
  state.watchMode = 'video';
  state.watchVideoToAudioHandoff = false;
  state.watchAudioToVideoHandoff = false;
  state.watchAudioToVideoCommitBusy = false;
  state.watchAudioToVideoCommitPromise = null;
  state.watchAudioToVideoCommitPromiseId = '';
  state.watchAudioToVideoHandoffId = '';
  state.watchAudioToVideoTargetSeconds = 0;
  state.watchVimeoGeneration += 1;

  if (oldPlayer) {
    Promise.resolve(oldPlayer.pause()).catch(() => {}).finally(() => {
      Promise.resolve(oldPlayer.destroy()).catch(() => {});
    });
  }
  if (oldId && state.user && oldSeconds > 0) {
    if (oldMode === 'audio' && oldAudioSnapshot) {
      saveAudioHistorySnapshot(oldAudioSnapshot, false, { reconcile:true }).catch(() => {});
    } else {
      saveHistory(oldId, 'video', oldSeconds, oldDuration, false, { reconcile:true }).catch(() => {});
    }
  }
}

async function playLibraryAudio(id, requestedTime = null) {
  resetWatchPresentationForStandaloneAudio();
  const item = state.audioById.get(String(id));
  if (!item) return alert('Audio is not available.');
  // Use the already-loaded account history synchronously so audio.play() stays
  // inside the original tap gesture. Waiting on /history here made mobile audio
  // feel slow and could make WebView require a second tap.
  const resume = requestedTime == null ? cachedSavedPosition(String(id), 'audio') : Number(requestedTime) || 0;
  return startAudio({
    kind: 'library-audio',
    id: String(id),
    sourceId: String(id),
    title: displayShiurTitle(item.title || item.name, 'Audio shiur'),
    subtitle: [item.location, item.year, item._speakerLabel, item._topicLabel].filter(Boolean).join(' - '),
    thumbnail: '',
    url: audioUrl(id)
  }, resume || 0);
}

async function playVideoAudio(id, requestedTime = null, keepWatch = false) {
  const video = state.videoById.get(String(id));
  if (!video || !video.hasAudio) return alert('Audio is not available for this shiur yet.');
  if (!keepWatch) resetWatchPresentationForStandaloneAudio();
  const resume = requestedTime == null ? cachedSavedPosition(String(id), 'audio') : Number(requestedTime) || 0;
  const sourceId = mediaApiId(video, id);
  const playback = startAudio({
    kind: 'video-audio',
    id: String(id),
    sourceId,
    title: displayShiurTitle(video.title, 'Shiur'),
    subtitle: [video.showcase, video._speakerLabel, video._topicLabel].filter(Boolean).join(' - '),
    thumbnail: video.thumbnail || '',
    url: audioUrl(sourceId)
  }, resume || 0);
  return playback;
}

function captureCurrentAudioHistorySnapshot(expectedId = '') {
  const item = state.current;
  if (!item || item.kind === 'paid-audio') return null;
  const id = String(item.id || '');
  if (!id || (expectedId && id !== String(expectedId))) return null;
  if (state.watchVideo && state.watchMode === 'video' && videoId(state.watchVideo) === id) return null;

  if (usesNativeUnifiedAudio()) {
    if (String(state.nativePlayback?.mode || '') !== 'AUDIO') return null;
    const nativeId = String(state.nativePlayback?.lectureId || '');
    if (nativeId && nativeId !== id) return null;
    return {
      id,
      position:Math.max(0, nativeAudioPositionSeconds()),
      duration:Math.max(0, nativeAudioDurationSeconds())
    };
  }

  return {
    id,
    position:Math.max(0, Number(audio.currentTime) || 0),
    duration:Number.isFinite(audio.duration) ? Math.max(0, Number(audio.duration) || 0) : 0
  };
}

function saveAudioHistorySnapshot(snapshot, completed = false, options = {}) {
  if (!snapshot || !snapshot.id || !state.user) return Promise.resolve();
  return saveHistory(snapshot.id, 'audio', snapshot.position, snapshot.duration, completed, options);
}

function currentAudioIsAuthoritative() {
  return Boolean(state.current) && !(state.watchVideo && state.watchMode === 'video');
}

function clearCurrentAudioStateForVideo() {
  state.current = null;
  state.playerOpen = false;
  state.audioLastHistoryAt = 0;
}

async function saveAndDetachCurrentAudioBeforeVideo(targetId = '', preserveSamePlaying = false) {
  const current = state.current;
  if (!current) return null;
  const authoritative = currentAudioIsAuthoritative();
  const sameLecture = String(current.id || '') === String(targetId || '');
  const snapshot = authoritative && current.kind !== 'paid-audio' ? captureCurrentAudioHistorySnapshot() : null;

  if (authoritative && preserveSamePlaying && sameLecture && !playbackIsPaused()) return snapshot;

  // Snapshot/start the outgoing save while its clock is still authoritative, then
  // pause immediately. Do not let the old source keep advancing while a network
  // history request is in flight.
  if (authoritative) {
    let savePromise = Promise.resolve();
    if (current.kind === 'paid-audio') savePromise = savePaidAudioProgress(false, true);
    else if (snapshot) savePromise = saveAudioHistorySnapshot(snapshot, false, { reconcile:true });

    if (!playbackIsPaused()) await PlaybackController.pause().catch(() => {});
    if (!usesNativeUnifiedAudio()) { try { audio.pause(); } catch (_) {} }
    await Promise.resolve(savePromise).catch(() => {});
  }

  clearCurrentAudioStateForVideo();
  return snapshot;
}

async function startAudio(item, resumeAt = 0) {
  if (item?.id) { usageAnalytics.event('shiur_opened', { shiurId:String(item.id), mediaType:'audio', dedupeKey:`shiur-open:${item.id}`, cooldownMs:60000 }); usageAnalytics.setMedia({isPlaying:false,mediaType:'audio',playerState:'paused',shiurId:String(item.id)}); }
  if (!state.queueStarting) { state.playQueue = []; state.playQueueIndex = -1; }
  const offlineRecord = offlineRecordForAudioItem(item);
  const networkUrl = item.networkUrl || item.url;
  const localUrl = offlineFileUrl(offlineRecord);
  const effective = localUrl ? { ...item, url:localUrl, networkUrl, nativeBackgroundUrl:offlineRecord?.uri || '', offline:true, offlineKey:offlineRecord.key } : { ...item, networkUrl, offline:false };
  const previous = state.current;
  const replacingLecture = Boolean(previous && (String(previous.id || '') !== String(effective.id || '') || String(previous.kind || '') !== String(effective.kind || '')));
  if (replacingLecture) {
    if (previous.kind === 'paid-audio') {
      await savePaidAudioProgress(false, true).catch(() => {});
    } else {
      const outgoing = captureCurrentAudioHistorySnapshot();
      if (outgoing) saveAudioHistorySnapshot(outgoing, false, { reconcile:true }).catch(() => {});
    }
    // Each lecture gets its own first history tick. A recent save from the old
    // lecture must not suppress the new lecture for another 15 seconds.
    state.audioLastHistoryAt = 0;
  }
  state.current = effective;
  item = effective;

  if (usesNativeUnifiedAudio()) {
    // Ask only on a real user playback action, never during app startup.
    // One persistent ExoPlayer owns in-app and background audio. There is no
    // HTML-audio -> native-service restart when Home is pressed.
    let nativeStarted = false;
    try {
      setPlaybackAuthorityFence('AUDIO', item.id, 5000);
      try {
        await PlaybackController.loadLecture(item, resumeAt, true);
        // Direct Audio playback has no audible source that must be protected during
        // a handoff. Set playWhenReady immediately so Media3 buffers once and begins
        // as soon as data is available instead of waiting through a separate READY pass.
        await PlaybackController.startAudioAt(resumeAt, true);
      } catch (error) {
        // Offline copies use the same Media3 session. If a stale local URI fails,
        // retry the network source without creating another player.
        if (item.offline && item.networkUrl && navigator.onLine !== false) {
          state.current = item = { ...item, offline:false, url:item.networkUrl, nativeBackgroundUrl:'' };
          await PlaybackController.loadLecture(item, resumeAt, true);
          await PlaybackController.startAudioAt(resumeAt, true);
          setToast(currentLanguage()==='he'?'הקובץ השמור לא נפתח; עברנו להזרמה.':'Saved copy could not play; switched to streaming.');
        } else {
          throw error;
        }
      }
      nativeStarted = true;
    } catch (error) {
      disableNativePlayback(error);
      setToast(currentLanguage()==='he'?'הנגן המובנה לא זמין; עברנו לנגן החלופי.':'Native playback is unavailable; switched to the fallback player.');
    }
    if (nativeStarted) {
      state.nativePlayback.mode = 'AUDIO';
      state.nativePlayback.currentPositionMs = Math.round((Number(resumeAt)||0)*1000);
      state.nativePlayback.isPlaying = true;
      usageAnalytics.setMedia({isPlaying:true,mediaType:'audio',playerState:'playing',shiurId:String(item.id||'')});
      usageAnalytics.event('audio_start',{shiurId:String(item.id||''),mediaType:'audio',dedupeKey:`audio-start:${item.id}`,cooldownMs:10000});
      render();
      updatePlayerUi();
      return;
    }
  }

  const same = state.current && state.current.kind === effective.kind && state.current.id === effective.id && audio.src === item.url;
  if (!same) { audio.src = item.url; audio.load(); }
  audio.preload = 'auto';
  audio.playbackRate = state.playbackSpeed;
  setupMediaSession(item);
  if (resumeAt > 1) {
    const applyResume = () => {
      try { audio.currentTime = Math.min(resumeAt, Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 1) : resumeAt); } catch (_) {}
    };
    if (audio.readyState >= 1) applyResume();
    else audio.addEventListener('loadedmetadata', applyResume, { once: true });
  }
  const playPromise = audio.play();
  render();
  try { await playPromise; } catch (error) { console.warn('Audio playback needs a user tap', error); }
  updatePlayerUi();
}

function togglePlay() {
  if (!state.current && !(state.watchVideo && state.watchMode === 'video')) return;
  if (playbackIsPaused()) PlaybackController.play().catch(()=>{}); else PlaybackController.pause().catch(()=>{});
  updatePlayerUi();
}

function skip(seconds) {
  if (!state.current && !(state.watchVideo && state.watchMode === 'video')) return;
  PlaybackController.seekBy(Number(seconds)||0).catch(()=>{});
}

function setSleepTimer(value) {
  if (state.sleepTimer) clearTimeout(state.sleepTimer);
  state.sleepTimer = null;
  state.sleepEndsAt = null;
  state.sleepMode = String(value || 'off');
  if (state.sleepMode === 'off' || state.sleepMode === 'end') {
    render();
    return;
  }
  const minutes = Number(state.sleepMode);
  if (!minutes) return;
  state.sleepEndsAt = Date.now() + minutes * 60000;
  state.sleepTimer = setTimeout(() => {
    PlaybackController.pause().catch(()=>{});
    state.sleepTimer = null;
    state.sleepEndsAt = null;
    state.sleepMode = 'off';
    render();
  }, minutes * 60000);
  render();
}

function nativeMediaPlugin() {
  return Capacitor.getPlatform() === 'android' ? IrgunPlayback : null;
}

function nativePipPlugin() {
  return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.IrgunPictureInPicture;
}

function setNativePipEligibility(active) {
  const plugin = nativePipPlugin();
  if (plugin && plugin.setEligible) plugin.setEligible({ active:Boolean(active) }).catch(() => {});
}

async function enterSystemPictureInPicture() {
  const plugin = nativePipPlugin();
  if (!plugin || !plugin.enter) {
    setToast(currentLanguage() === 'he' ? 'מצב תמונה בתוך תמונה אינו זמין במכשיר זה.' : 'Picture in Picture is not available on this device.');
    return;
  }
  try {
    // Capture the live clock and playing state before Android resizes the Activity.
    // PiP/full transitions must be a display-mode change only, never a new player.
    state.systemPipLastSeconds = await quickVimeoTime(state.watchResumeSeconds || 0, 350);
    let actuallyPlaying = state.watchVideoPlaying;
    if (state.watchVimeo) {
      try {
        const paused = await Promise.race([
          Promise.resolve(state.watchVimeo.getPaused()).catch(() => !actuallyPlaying),
          new Promise(resolve => setTimeout(() => resolve(!actuallyPlaying), 250))
        ]);
        actuallyPlaying = !Boolean(paused);
      } catch (_) {}
    }
    state.systemPipWasPlaying = Boolean(actuallyPlaying);
    setNativePipEligibility(true);
    // Keep the live Vimeo frame untouched while Android captures/resizes the
    // Activity. The native PiP callback applies the PiP layout only after entry.
    const result = await plugin.enter();
    if (!result || !result.entered) {
      if (!state.watchVideoPlaying) setNativePipEligibility(false);
      setToast(currentLanguage() === 'he' ? 'הפעילו את הווידאו ואז נסו שוב.' : 'Start the video, then try Picture in Picture again.');
    }
  } catch (_) {
    if (!state.watchVideoPlaying) setNativePipEligibility(false);
    setToast(currentLanguage() === 'he' ? 'לא היה אפשר לפתוח תמונה בתוך תמונה.' : 'Could not start Picture in Picture.');
  }
}

async function restoreAfterSystemPip() {
  if (!state.watchVideo || state.watchMode !== 'video' || !state.watchVimeo) return;
  const player = state.watchVimeo;
  const target = Math.max(0, Number(state.systemPipLastSeconds) || Number(state.watchResumeSeconds) || 0);
  try {
    // Give Android one frame to finish restoring the normal Activity size, then
    // inspect the SAME Vimeo player. Only reseek if PiP exit actually reset it.
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 40)));
    let current = await Promise.race([
      Promise.resolve(player.getCurrentTime()).catch(() => null),
      new Promise(resolve => setTimeout(() => resolve(null), 350))
    ]);
    const n = Number(current);
    if (target > 2 && (!Number.isFinite(n) || n < Math.max(0.5, target - 5))) {
      await Promise.race([
        Promise.resolve(player.setCurrentTime(target)).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 1800))
      ]);
      state.watchResumeSeconds = target;
    } else if (Number.isFinite(n)) {
      state.watchResumeSeconds = Math.max(0, n);
    }
    if (state.systemPipWasPlaying) {
      const paused = await Promise.race([
        Promise.resolve(player.getPaused()).catch(() => true),
        new Promise(resolve => setTimeout(() => resolve(true), 250))
      ]);
      if (paused) await player.play().catch(() => {});
    }
  } catch (_) {
    // The normal Vimeo init path already has a position fallback. Do not create a
    // second player here unless the existing player object really disappeared.
    if (!state.watchVimeo) {
      state.watchResumeSeconds = target;
      initWatchVimeo(Boolean(state.systemPipWasPlaying));
    }
  }
}

window.__irgunSetSystemPip = function(active) {
  const wasActive = state.systemPipActive;
  state.systemPipActive = Boolean(active);
  PlaybackController.setPresentation(state.systemPipActive ? 'PIP' : (state.watchMinimized ? 'MINI' : 'FULL')).catch(()=>{});
  if (state.systemPipActive && !wasActive) {
    state.systemPipLastSeconds = Math.max(0, Number(state.watchResumeSeconds) || 0);
  }
  document.body.classList.toggle('irgun-system-pip', state.systemPipActive);
  document.body.classList.toggle('irgun-system-pip-persistent', state.systemPipActive && state.watchMinimized);
  if (!state.systemPipActive && wasActive) {
    window.__irgunRestoreViewportAfterPip();
    restoreAfterSystemPip();
  }
};

window.__irgunRestoreViewportAfterPip = function() {
  try {
    // Android resizes the WebView down to the PiP surface. Some WebView versions
    // keep that temporary scale after the Activity expands again. Explicitly reset
    // the page and the permanent video host to the phone viewport without touching
    // or recreating the Vimeo iframe.
    document.body.classList.remove('irgun-system-pip', 'irgun-system-pip-persistent');
    const mount = document.getElementById('persistentVideoMount');
    if (mount && state.watchVideo && state.watchMode === 'video') {
      mount.classList.add('watch-video-host');
      mount.classList.toggle('watch-mini-host', Boolean(state.watchMinimized));
      mount.classList.toggle('watch-full-host', !state.watchMinimized);
      mount.style.removeProperty('width');
      mount.style.removeProperty('height');
      mount.style.removeProperty('inset');
      mount.style.removeProperty('transform');
    }
    const overlay = mount?.querySelector('.watch-overlay');
    const scroll = mount?.querySelector('.watch-scroll');
    const card = mount?.querySelector('.watch-player-card');
    const frame = mount?.querySelector('#watchVimeoFrame');
    for (const el of [overlay, scroll, card, frame]) {
      if (!el) continue;
      el.style.removeProperty('width');
      el.style.removeProperty('height');
      el.style.removeProperty('min-height');
      el.style.removeProperty('max-height');
      el.style.removeProperty('inset');
      el.style.removeProperty('transform');
    }
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      const normal = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, viewport-fit=cover');
      requestAnimationFrame(() => viewport.setAttribute('content', normal));
    }
    // Force two layout passes because Android can report the restored Activity size
    // one frame before the WebView's visual viewport is updated.
    void document.documentElement.offsetWidth;
    requestAnimationFrame(() => {
      void document.body.offsetWidth;
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => window.dispatchEvent(new Event('resize')), 120);
    });
  } catch (_) {}
};

function usesNativeUnifiedAudio() {
  return Capacitor.getPlatform() === 'android' && !state.nativePlaybackDisabled && Boolean(nativeMediaPlugin());
}

function disableNativePlayback(error) {
  if (state.nativePlaybackDisabled) return;
  const plugin = nativeMediaPlugin();
  state.nativePlaybackDisabled = true;
  state.nativePlayback = {
    ...state.nativePlayback,
    connected:false,
    lectureId:'',
    vimeoId:'',
    mode:'AUDIO',
    currentPositionMs:0,
    durationMs:0,
    isPlaying:false,
    audioReady:false,
    audioPositionMs:0,
    audioDurationMs:0,
    audioIsPlaying:false,
    audioPlayWhenReady:false,
    hasAudioSource:false
  };
  state.playbackAuthorityFence = null;
  console.warn('[Playback] Native player disabled for this session; using HTML audio fallback', error || 'unknown error');
  // Fully clear the native lecture/session before HTML audio takes over. Leaving
  // clearLecture=false can preserve stale metadata and an obsolete notification.
  try { plugin?.stopAudio?.({ clearLecture:true }).catch(()=>{}); } catch (_) {}
}

async function recoverFromNativePlaybackError(event = {}) {
  if (state.nativeRecoveryBusy || state.nativePlaybackDisabled) return;
  const eventLectureId = String(event?.lectureId || '');
  const activeLectureId = String(state.nativePlayback?.lectureId || '');
  if (eventLectureId && activeLectureId && eventLectureId !== activeLectureId) {
    console.debug('[Playback] ignored stale native error for', eventLectureId);
    return;
  }

  const mode = String(event?.mode || state.nativePlayback?.mode || '').toUpperCase();
  const message = event?.message || (currentLanguage()==='he'?'שגיאת ניגון.':'Playback error.');

  // A shadow-source failure must never interrupt a healthy Vimeo video. Disable
  // native playback for this session and keep the visible source authoritative.
  if (mode === 'VIDEO') {
    disableNativePlayback(message);
    setToast(currentLanguage()==='he'?'הווידאו ממשיך לנגן. אודיו חלופי ישמש במקרה הצורך.':'Video is still playing. The fallback audio player will be used if needed.');
    return;
  }

  const currentItem = state.current;
  if (!currentItem) {
    disableNativePlayback(message);
    setToast(message);
    return;
  }

  state.nativeRecoveryBusy = true;
  const position = Math.max(
    0,
    (Number(event?.currentPositionMs) || 0) / 1000,
    nativeAudioPositionSeconds(),
    Number(state.watchResumeSeconds) || 0
  );
  const duration = Math.max(0, (Number(event?.durationMs) || 0) / 1000, nativeAudioDurationSeconds());
  const shouldPlay = event?.isPlaying == null ? Boolean(state.nativePlayback?.isPlaying) : Boolean(event.isPlaying);

  try {
    // A stale offline URI is the most common recoverable runtime failure. Retry
    // the same Media3 session once from the network before abandoning native audio.
    if (currentItem.offline && currentItem.networkUrl && navigator.onLine !== false) {
      try {
        const networkItem = { ...currentItem, offline:false, url:currentItem.networkUrl, nativeBackgroundUrl:'' };
        state.current = networkItem;
        setPlaybackAuthorityFence('AUDIO', networkItem.id, 5000);
        await PlaybackController.loadLecture(networkItem, position, true);
        const result = await PlaybackController.startAudioAt(position, shouldPlay, { volume:1, commit:true });
        // startAudioAt resolving means Media3 accepted the network source. It may
        // still be BUFFERING, so do not mistake isPlaying=false for another failure.
        state.nativePlayback = { ...state.nativePlayback, ...(result || {}), mode:'AUDIO', connected:true };
        state.watchResumeSeconds = position;
        state.audioLastHistoryAt = 0;
        setToast(currentLanguage()==='he'?'הקובץ השמור נכשל; עברנו להזרמה בלי לאבד את המקום.':'Saved copy failed; switched to streaming without losing your place.');
        render();
        updatePlayerUi();
        return;
      } catch (retryError) {
        console.warn('[Playback] native network retry failed', retryError);
      }
    }

    const fallbackUrl = String(currentItem.networkUrl || currentItem.url || '');
    if (currentItem.kind === 'paid-audio') {
      await savePaidAudioProgress(false, true).catch(()=>{});
    } else if (state.user) {
      saveHistory(currentItem.id, 'audio', position, duration, false, { reconcile:true }).catch(()=>{});
    }

    disableNativePlayback(message);
    if (!fallbackUrl) {
      setToast(message);
      return;
    }

    const fallbackItem = { ...currentItem, offline:false, url:fallbackUrl };
    state.current = fallbackItem;
    try { audio.pause(); } catch (_) {}
    audio.src = fallbackUrl;
    audio.preload = 'auto';
    audio.playbackRate = state.playbackSpeed;
    setupMediaSession(fallbackItem);
    const applyResume = () => {
      try {
        const cap = Number.isFinite(audio.duration) && audio.duration > 1 ? Math.max(0, audio.duration - 1) : position;
        audio.currentTime = Math.min(position, cap);
      } catch (_) {}
    };
    if (audio.readyState >= 1) applyResume();
    else audio.addEventListener('loadedmetadata', applyResume, { once:true });

    if (state.watchVideo && videoId(state.watchVideo) === String(currentItem.id || '')) {
      state.watchMode = 'audio';
      state.watchResumeSeconds = position;
      state.watchVideoPlaying = false;
      parkHostedVideoForAudio();
    }

    if (shouldPlay) {
      try { await audio.play(); } catch (fallbackError) { console.warn('[Playback] HTML fallback needs a user tap', fallbackError); }
    }
    state.audioLastHistoryAt = 0;
    setToast(currentLanguage()==='he'?'עברנו לנגן החלופי בלי לאבד את המקום.':'Switched to the fallback player without losing your place.');
    render();
    updatePlayerUi();
  } finally {
    state.nativeRecoveryBusy = false;
  }
}

function setPlaybackAuthorityFence(mode, lectureId = '', ttlMs = 3500) {
  state.playbackAuthorityFence = {
    mode:String(mode || '').toUpperCase(),
    lectureId:String(lectureId || ''),
    expiresAt:Date.now() + Math.max(500, Number(ttlMs) || 3500)
  };
}

function nativeSnapshotConflicts(snapshot) {
  const fence = state.playbackAuthorityFence;
  if (!fence) return false;
  if (Date.now() > Number(fence.expiresAt || 0)) {
    state.playbackAuthorityFence = null;
    return false;
  }
  const incomingLecture = String(snapshot?.lectureId || '');
  const incomingMode = String(snapshot?.mode || '').toUpperCase();
  if (fence.lectureId && incomingLecture && fence.lectureId !== incomingLecture) return true;
  return Boolean(fence.mode && incomingMode && fence.mode !== incomingMode);
}

function nativeAudioPositionSeconds() {
  return Math.max(0, Number(state.nativePlayback?.currentPositionMs) || 0) / 1000;
}

function nativeAudioDurationSeconds() {
  return Math.max(0, Number(state.nativePlayback?.durationMs) || 0) / 1000;
}

function playbackPositionSeconds() {
  return usesNativeUnifiedAudio() && String(state.nativePlayback?.mode || '') === 'AUDIO'
    ? nativeAudioPositionSeconds()
    : Math.max(0, Number(audio.currentTime) || 0);
}

function playbackDurationSeconds() {
  return usesNativeUnifiedAudio() && String(state.nativePlayback?.mode || '') === 'AUDIO'
    ? nativeAudioDurationSeconds()
    : (Number.isFinite(audio.duration) ? Math.max(0, Number(audio.duration) || 0) : 0);
}

function playbackIsPaused() {
  return usesNativeUnifiedAudio() && String(state.nativePlayback?.mode || '') === 'AUDIO'
    ? !(Boolean(state.nativePlayback?.isPlaying) || Boolean(state.nativePlayback?.audioPlayWhenReady))
    : Boolean(audio.paused);
}

function playbackRateValue() {
  return usesNativeUnifiedAudio() ? (Number(state.nativePlayback?.playbackSpeed) || state.playbackSpeed || 1) : (audio.playbackRate || state.playbackSpeed || 1);
}

function nativeLecturePayload(item, positionSeconds = 0, prepareAudio = true) {
  const itemId = String(item?.id || '');
  const directVideo = state.videoById.get(itemId) || null;
  const watchVideo = state.watchVideo && (item?.kind === 'video-audio' || itemId === videoId(state.watchVideo)) ? state.watchVideo : null;
  // Paid/library audio must never inherit a stale Vimeo lecture merely because a
  // video happened to be open earlier in the session.
  const video = directVideo || watchVideo || null;
  const sourceUrl = String(item?.nativeBackgroundUrl || item?.backgroundAudioUrl || item?.url || item?.networkUrl || '');
  return {
    lectureId: String(item?.id || item?.sourceId || videoId(video) || ''),
    vimeoId: String(video?.vimeoId || video?.id || item?.vimeoId || ''),
    title: displayShiurTitle(item?.title || item?.name || video?.title, 'Shiur'),
    speaker: item?.subtitle || item?._speakerLabel || item?.speaker || video?._speakerLabel || video?.speaker || 'Irgun Shiurai Torah',
    image: String(item?.thumbnail || video?.thumbnail || ''),
    audioUrl: sourceUrl,
    videoSource: video ? 'vimeo' : '',
    mediaKind: String(item?.kind || ''),
    sourceId: String(item?.sourceId || ''),
    paidAudioId: String(item?.paidAudioId || ''),
    trackId: String(item?.trackId || ''),
    currentPositionMs: Math.max(0, Math.round((Number(positionSeconds) || 0) * 1000)),
    playbackSpeed: Number(state.playbackSpeed) || 1,
    volume: 1,
    prepareAudio: Boolean(prepareAudio)
  };
}

function restoreCurrentFromNativeSnapshot(snapshot) {
  if (!snapshot || String(snapshot.mode || '') !== 'AUDIO' || !String(snapshot.lectureId || '')) return;
  const lectureId = String(snapshot.lectureId || '');
  if (state.current && String(state.current.id || '') === lectureId) return;
  const kind = String(snapshot.mediaKind || '') || (snapshot.paidAudioId ? 'paid-audio' : 'library-audio');
  state.current = {
    kind,
    id: lectureId,
    sourceId: String(snapshot.sourceId || ''),
    paidAudioId: String(snapshot.paidAudioId || ''),
    trackId: String(snapshot.trackId || ''),
    title: String(snapshot.title || 'Shiur'),
    subtitle: String(snapshot.speaker || 'Irgun Shiurai Torah'),
    thumbnail: String(snapshot.image || ''),
    url: '',
    networkUrl: '',
    nativeRestored: true,
    offline: false
  };
}

// Media3 MediaSession playback owns its media notification. Push-notification
// permission remains managed only by IrgunPush; playback must never open a
// second notification permission flow or race the video/audio handoff.

function ensureNativeAudioCurrentForWatch(snapshot) {
  if (!usesNativeUnifiedAudio() || !snapshot || String(snapshot.mode || '') !== 'AUDIO') return;
  const video = state.watchVideo;
  if (!video || String(snapshot.lectureId || '') !== videoId(video)) return;
  const existingId = String(state.current?.id || '');
  if (state.current && existingId === videoId(video) && state.current.kind === 'video-audio') return;
  const base = videoAudioPlaybackItem(video, videoId(video));
  const offlineRecord = offlineRecordForAudioItem(base);
  const networkUrl = base.networkUrl || base.url;
  const localUrl = offlineFileUrl(offlineRecord);
  state.current = localUrl
    ? { ...base, url:localUrl, networkUrl, nativeBackgroundUrl:offlineRecord?.uri || '', offline:true, offlineKey:offlineRecord.key }
    : { ...base, networkUrl, offline:false };
}

const PlaybackController = {
  listenersInstalled: false,
  nativeRefreshPromise: null,


  async init() {
    if (!usesNativeUnifiedAudio() || this.listenersInstalled) return;
    this.listenersInstalled = true;
    const plugin = nativeMediaPlugin();
    const applyState = data => {
      if (!data || nativeSnapshotConflicts(data)) return;
      state.nativePlayback = { ...state.nativePlayback, ...data, connected:true };
      restoreCurrentFromNativeSnapshot(data);
      if (String(data.mode || '') === 'AUDIO' && state.watchVideo && String(data.lectureId || '') === videoId(state.watchVideo)) {
        ensureNativeAudioCurrentForWatch(data);
        state.nativeBackgroundHandoff = false;
        state.watchMode = 'audio';
        state.watchVideoPlaying = false;
        state.watchResumeSeconds = Math.max(0, Number(data.currentPositionMs) || Number(data.audioPositionMs) || 0) / 1000;
        parkHostedVideoForAudio();
      }
      updatePlayerUi();
    };
    try {
      plugin.addListener('stateChanged', event => applyState(event));
      plugin.addListener('positionChanged', event => {
        if (!event || nativeSnapshotConflicts(event)) return;
        state.nativePlayback = {
          ...state.nativePlayback,
          currentPositionMs:Number(event.positionMs)||0,
          durationMs:Number(event.durationMs)||0,
          isPlaying:Boolean(event.isPlaying),
          audioIsPlaying:event.audioIsPlaying == null ? Boolean(event.isPlaying) : Boolean(event.audioIsPlaying),
          audioPlayWhenReady:event.audioPlayWhenReady == null ? state.nativePlayback.audioPlayWhenReady : Boolean(event.audioPlayWhenReady),
          mode:event.mode || state.nativePlayback.mode,
          connected:true
        };
        updatePlayerUi();
        if (state.current) {
          const seconds = nativeAudioPositionSeconds();
          if (state.current.kind !== 'paid-audio' && seconds >= 30) recordPublicView(state.current.id, 'audio');
          saveCurrentAudioHistory(false, false).catch(()=>{});
        }
      });
      plugin.addListener('audioReady', event => applyState(event));
      plugin.addListener('ended', async event => {
        applyState(event);
        await saveCurrentAudioHistory(true, true);
        if (state.sleepMode === 'end') state.sleepMode = 'off';
        if (state.sleepTimer) clearTimeout(state.sleepTimer);
        state.sleepTimer = null;
        state.sleepEndsAt = null;
        const advanced = await advanceQueue(1);
        if (!advanced) updatePlayerUi();
      });
      plugin.addListener('playbackError', event => {
        console.warn('[Playback] native error', event?.message || 'Playback error');
        recoverFromNativePlaybackError(event).catch(error => {
          console.warn('[Playback] native recovery failed', error);
          disableNativePlayback(error);
          setToast(currentLanguage()==='he'?'עברנו לנגן החלופי.':'Switched to the fallback player.');
        });
      });
      const initial = await plugin.getState().catch(() => null);
      if (initial) applyState(initial);
    } catch (error) {
      console.warn('[Playback] Native bridge init failed; HTML fallback remains available', error);
      disableNativePlayback(error);
    }
  },

  async loadLecture(item, positionSeconds = 0, prepareAudio = true) {
    if (!usesNativeUnifiedAudio() || !item) return null;
    await this.init();
    const result = await nativeMediaPlugin().loadLecture(nativeLecturePayload(item, positionSeconds, prepareAudio));
    if (result && !nativeSnapshotConflicts(result)) state.nativePlayback = { ...state.nativePlayback, ...result, connected:true };
    return result;
  },

  async prepareAudio(item, positionSeconds, wasPlaying = true) {
    if (!usesNativeUnifiedAudio()) return null;
    await this.loadLecture(item, positionSeconds, true);
    console.debug(`[Playback] Audio preparing at ${Number(positionSeconds || 0).toFixed(2)}s`);
    const result = await nativeMediaPlugin().prepareAudio({
      positionMs:Math.max(0, Math.round((Number(positionSeconds)||0)*1000)),
      playbackSpeed:Number(state.playbackSpeed)||1,
      volume:1
    });
    if (result && !nativeSnapshotConflicts(result)) state.nativePlayback = { ...state.nativePlayback, ...result, connected:true, isPlaying:Boolean(wasPlaying && result.isPlaying) };
    return result;
  },

  async startAudioAt(positionSeconds, shouldPlay = true, options = {}) {
    if (!usesNativeUnifiedAudio()) return null;
    await this.init();
    const result = await nativeMediaPlugin().startAudioAt({
      positionMs:Math.max(0, Math.round((Number(positionSeconds)||0)*1000)),
      playing:Boolean(shouldPlay),
      playbackSpeed:Number(state.playbackSpeed)||1,
      volume:Number.isFinite(Number(options.volume)) ? Number(options.volume) : 1,
      commit:options.commit !== false
    });
    if (result && !nativeSnapshotConflicts(result)) {
      state.nativePlayback = { ...state.nativePlayback, ...result, connected:true };
    }
    return result;
  },

  async play() {
    if (state.watchVideo && state.watchMode === 'video' && state.watchVimeo) return state.watchVimeo.play();
    if (usesNativeUnifiedAudio()) {
      const result = await nativeMediaPlugin().play();
      return result;
    }
    return audio.play();
  },

  async pause() {
    if (state.watchVideo && state.watchMode === 'video' && state.watchVimeo) return state.watchVimeo.pause();
    if (usesNativeUnifiedAudio()) {
      const result = await nativeMediaPlugin().pause();
      return result;
    }
    audio.pause();
  },

  async seekTo(seconds) {
    const value = Math.max(0, Number(seconds)||0);
    if (state.watchVideo && state.watchMode === 'video' && state.watchVimeo) {
      await state.watchVimeo.setCurrentTime(value);
      state.watchResumeSeconds = value;
      return;
    }
    if (usesNativeUnifiedAudio()) {
      await nativeMediaPlugin().seekTo({ positionMs:Math.round(value*1000) });
      state.nativePlayback.currentPositionMs = Math.round(value*1000);
    } else {
      audio.currentTime = value;
    }
    updatePlayerUi();
  },

  async seekBy(seconds) {
    if (state.watchVideo && state.watchMode === 'video' && state.watchVimeo) {
      const now = await state.watchVimeo.getCurrentTime().catch(()=>state.watchResumeSeconds||0);
      const duration = await state.watchVimeo.getDuration().catch(()=>0);
      return this.seekTo(Math.max(0, Math.min(duration||Infinity, now + Number(seconds||0))));
    }
    if (usesNativeUnifiedAudio()) {
      await nativeMediaPlugin().seekBy({ deltaMs:Math.round(Number(seconds||0)*1000) });
      return;
    }
    const max = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.max(0, Math.min(max, (audio.currentTime||0)+Number(seconds||0)));
    updatePlayerUi();
  },

  async setSpeed(rate) {
    const value = Number(rate)||1;
    state.playbackSpeed = value;
    localStorage.setItem(SPEED_KEY, String(value));
    if (usesNativeUnifiedAudio()) nativeMediaPlugin().setSpeed({ rate:value }).catch(()=>{});
    else audio.playbackRate = value;
    if (state.watchVideo && state.watchMode === 'video' && state.watchVimeo && typeof state.watchVimeo.setPlaybackRate === 'function') {
      await state.watchVimeo.setPlaybackRate(value).catch(()=>{});
    }
  },

  async setPresentation(mode) {
    const value = String(mode || 'FULL').toUpperCase();
    state.nativePlayback.presentationMode = value;
    if (usesNativeUnifiedAudio() && state.nativePlayback?.lectureId) nativeMediaPlugin().setPresentationMode({ mode:value }).catch(()=>{});
  },

  async setVideoState(item, playing, position, duration, authoritative = true) {
    if (!usesNativeUnifiedAudio() || !item) return;
    const lectureId = String(item?.id || item?.sourceId || '');
    if (String(state.nativePlayback?.lectureId || '') !== lectureId || !state.nativePlayback?.hasAudioSource) {
      await this.loadLecture(item, position, true).catch(()=>null);
    }
    await nativeMediaPlugin().setVideoState({
      positionMs:Math.max(0,Math.round((Number(position)||0)*1000)),
      durationMs:Math.max(0,Math.round((Number(duration)||0)*1000)),
      isPlaying:Boolean(playing),
      playbackSpeed:Number(state.playbackSpeed)||1,
      volume:1,
      authoritative:Boolean(authoritative)
    }).catch(()=>{});
  },

  async switchAuthorityToVideo(position, duration, playing) {
    if (!usesNativeUnifiedAudio()) return null;
    const lectureId = String(state.watchVideo ? videoId(state.watchVideo) : state.nativePlayback?.lectureId || '');
    setPlaybackAuthorityFence('VIDEO', lectureId, 5000);
    const result = await nativeMediaPlugin().switchAuthorityToVideo({
      lectureId,
      positionMs:Math.max(0,Math.round((Number(position)||0)*1000)),
      durationMs:Math.max(0,Math.round((Number(duration)||0)*1000)),
      isPlaying:Boolean(playing),
      playbackSpeed:Number(state.playbackSpeed)||1,
      volume:1
    });
    if (!result) throw new Error('Native player returned no VIDEO authority confirmation.');
    if (nativeSnapshotConflicts(result)) throw new Error('Native player returned a stale VIDEO authority confirmation.');
    state.nativePlayback = { ...state.nativePlayback, ...result, connected:true };
    return result;
  },

  async refreshFromNative() {
    if (!usesNativeUnifiedAudio()) return;
    if (this.nativeRefreshPromise) return this.nativeRefreshPromise;
    this.nativeRefreshPromise = (async () => {
      const latest = await nativeMediaPlugin().getState().catch(()=>null);
      if (!latest || nativeSnapshotConflicts(latest)) return;
      const priorMode = state.watchMode;
      const priorResume = Math.max(0, Number(state.watchResumeSeconds) || 0);
      state.nativePlayback = { ...state.nativePlayback, ...latest, connected:true };
      restoreCurrentFromNativeSnapshot(latest);
      if (String(latest.mode) === 'AUDIO' && state.watchVideo && String(latest.lectureId || '') === videoId(state.watchVideo)) {
        ensureNativeAudioCurrentForWatch(latest);
        state.nativeBackgroundHandoff = false;
        state.watchMode = 'audio';
        state.watchVideoPlaying = false;
        state.watchResumeSeconds = Math.max(0,Number(latest.currentPositionMs)||0)/1000;
        parkHostedVideoForAudio();
        // visibilitychange and MainActivity.onResume can arrive almost together.
        // Render only for a real presentation change so reopening background audio
        // cannot race two full DOM rebuilds against the persistent Vimeo host.
        const changed = priorMode !== 'audio' || Math.abs(priorResume - state.watchResumeSeconds) > 2;
        if (changed && !document.hidden) render();
      }
      updatePlayerUi();
    })().finally(() => { this.nativeRefreshPromise = null; });
    return this.nativeRefreshPromise;
  },

  async pauseVideoForNativeBackground(handoffId = 0) {
    const plugin = nativeMediaPlugin();
    const confirmPaused = async positionSeconds => {
      if (!plugin?.confirmBackgroundVideoPaused) return;
      await plugin.confirmBackgroundVideoPaused({
        handoffId:Number(handoffId) || 0,
        positionMs:Math.max(0, Math.round((Number(positionSeconds) || 0) * 1000))
      });
    };
    if (!state.watchVimeo || state.watchMode !== 'video') {
      await confirmPaused(state.watchResumeSeconds || nativeAudioPositionSeconds());
      return;
    }
    state.nativeBackgroundHandoff = true;
    const id = state.watchVideo ? videoId(state.watchVideo) : state.nativePlayback?.lectureId;
    setPlaybackAuthorityFence('AUDIO', id, 5000);
    await state.watchVimeo.pause();
    const paused = await state.watchVimeo.getPaused().catch(()=>true);
    if (!paused) throw new Error('Vimeo did not confirm pause');
    const exact = await state.watchVimeo.getCurrentTime().catch(()=>state.watchResumeSeconds || 0);
    state.watchResumeSeconds = Math.max(0, Number(exact) || 0);
    state.watchVideoPlaying = false;
    console.debug('[Playback] Vimeo pause confirmed for native background handoff');
    await confirmPaused(state.watchResumeSeconds);
  }
};
window.PlaybackController = PlaybackController;
window.__irgunPauseVimeoForNativeHandoff = handoffId => PlaybackController.pauseVideoForNativeBackground(handoffId);

async function syncNativeMediaSession(item, playing = true, position = 0, duration = 0, kind = 'audio') {
  const mediaKind = String(kind || '').toLowerCase();
  setNativePipEligibility(mediaKind === 'video' && Boolean(playing));
  if (!usesNativeUnifiedAudio() || !item) return;
  if (mediaKind === 'video') {
    // Source callbacks must never decide authority during a transaction. While
    // VIDEO -> AUDIO is moving toward Media3, ignore late Vimeo events. While
    // AUDIO -> VIDEO is waiting for explicit native confirmation, keep Media3 in
    // AUDIO until finishAudioToVideoHandoff() commits successfully.
    if (state.watchVideoToAudioHandoff || state.watchAudioToVideoHandoff || state.watchMode !== 'video') return;
    await PlaybackController.setVideoState(item, playing, position, duration, !state.nativeBackgroundHandoff);
  }
}

function clearNativeMediaSession() {
  setNativePipEligibility(false);
  const plugin = usesNativeUnifiedAudio() ? nativeMediaPlugin() : null;
  if (plugin) plugin.stopAudio({ clearLecture:true }).catch(()=>{});
  state.playbackAuthorityFence = null;
  state.nativePlayback = {
    ...state.nativePlayback,
    lectureId:'',
    vimeoId:'',
    mode:'AUDIO',
    currentPositionMs:0,
    durationMs:0,
    isPlaying:false,
    audioReady:false,
    audioPositionMs:0,
    audioDurationMs:0,
    audioIsPlaying:false,
    audioPlayWhenReady:false,
    hasAudioSource:false
  };
}

window.__irgunPauseWebPlaybackForNativeBackground = async function(kind) {
  try {
    if (String(kind || '').toLowerCase() === 'video') return PlaybackController.pauseVideoForNativeBackground();
    if (!usesNativeUnifiedAudio() && !audio.paused) audio.pause();
  } catch (_) {}
};

window.__irgunNativeSeekTo = async seconds => PlaybackController.seekTo(seconds);
window.__irgunNativeMediaAction = async action => {
  try {
    if (action === 'play') await PlaybackController.play();
    else if (action === 'pause') await PlaybackController.pause();
    else if (action === 'back') await PlaybackController.seekBy(-state.skipSeconds);
    else if (action === 'forward') await PlaybackController.seekBy(state.skipSeconds);
  } catch (_) {}
};
window.__irgunNativeResumeFromBackground = async function(seconds, shouldPlay) {
  if (!usesNativeUnifiedAudio()) return;
  await PlaybackController.refreshFromNative();
  if (shouldPlay && String(state.nativePlayback.mode) === 'AUDIO') await PlaybackController.play();
};

function setupMediaSession(item) {
  if (usesNativeUnifiedAudio()) return;
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: displayShiurTitle(item.title, 'Shiur'),
      artist: item.subtitle || 'Irgun Shiurai Torah',
      album: 'Irgun Shiurai Torah',
      artwork: item.thumbnail ? [{ src: item.thumbnail }] : [{ src: '/logo.png' }]
    });
    navigator.mediaSession.setActionHandler('play', () => PlaybackController.play());
    navigator.mediaSession.setActionHandler('pause', () => PlaybackController.pause());
    navigator.mediaSession.setActionHandler('seekbackward', details => PlaybackController.seekBy(-(details.seekOffset || state.skipSeconds)));
    navigator.mediaSession.setActionHandler('seekforward', details => PlaybackController.seekBy(details.seekOffset || state.skipSeconds));
    navigator.mediaSession.setActionHandler('seekto', details => {
      if (Number.isFinite(details.seekTime)) PlaybackController.seekTo(details.seekTime);
    });
  } catch (error) {
    console.warn('Media Session unavailable', error);
  }
}

function syncLoadedLibraryAudioDuration() {
  if (!state.current || state.current.kind !== 'library-audio') return;
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : 0;
  if (!duration) return;
  const id = String(state.current.id || '');
  const item = state.audioById.get(id);
  if (!item || Math.abs((Number(item.duration) || 0) - duration) < 1) return;
  item.duration = duration;
  const match = state.audioItems.find(row => rawAudioId(row) === id);
  if (match) match.duration = duration;
  if (state.screen === 'shiurim') refreshShiurimResults();
}

function updatePlayerUi() {
  if (!state.current) return;
  const duration = playbackDurationSeconds();
  const position = playbackPositionSeconds();
  const percent = duration > 0 ? Math.min(100, position / duration * 100) : 0;
  const miniProgress = document.getElementById('miniProgress');
  if (miniProgress) miniProgress.style.width = `${percent}%`;
  const miniTime = document.getElementById('miniTime');
  if (miniTime) miniTime.textContent = `${fmtTime(position)} / ${fmtDurationOrUnknown(duration)}`;
  const watchAudioTime = document.getElementById('watchAudioTime');
  if (watchAudioTime) watchAudioTime.textContent = `${fmtTime(position)} / ${fmtDurationOrUnknown(duration)}`;
  const watchAudioSeek = document.getElementById('watchAudioSeek');
  if (watchAudioSeek) { watchAudioSeek.max = duration; watchAudioSeek.value = position; }
  const seek = document.getElementById('fullSeek');
  if (seek) { seek.max = duration; seek.value = position; }
  const current = document.getElementById('fullCurrent');
  if (current) current.textContent = fmtTime(position);
  const total = document.getElementById('fullDuration');
  if (total) total.textContent = fmtDurationOrUnknown(duration);
  document.querySelectorAll('[data-play-toggle]').forEach(button => {
    if (button.classList.contains('watch-audio-play')) button.innerHTML = playbackIsPaused() ? '&#9654; Play' : 'II Pause';
    else if (button.classList.contains('main-play')) button.innerHTML = playbackIsPaused() ? svgIcon('play') : '<span class="pause-mark">II</span>';
    else button.innerHTML = playbackIsPaused() ? '&#9654;' : 'II';
  });
  if (!usesNativeUnifiedAudio() && 'mediaSession' in navigator && duration > 0) {
    try { navigator.mediaSession.setPositionState({ duration, playbackRate: playbackRateValue(), position: Math.min(position, duration) }); } catch (_) {}
  }
}

async function saveCurrentAudioHistory(force = false, completed = false, options = {}) {
  if (!state.current || !state.user) return;
  if (state.current.kind === 'paid-audio') {
    await savePaidAudioProgress(false, force || completed);
    return;
  }
  const snapshot = captureCurrentAudioHistorySnapshot();
  if (!snapshot) return;
  const now = Date.now();
  if (!force && now - state.audioLastHistoryAt < 15000) return;
  state.audioLastHistoryAt = now;
  await saveAudioHistorySnapshot(snapshot, completed, options);
}

audio.addEventListener('timeupdate', () => {
  if (usesNativeUnifiedAudio()) return;
  updatePlayerUi();
  if (!state.current) return;
  if (state.current.kind !== 'paid-audio' && (audio.currentTime || 0) >= 30) recordPublicView(state.current.id, 'audio');
  saveCurrentAudioHistory(false, false);
});
audio.addEventListener('loadedmetadata', () => { if (usesNativeUnifiedAudio()) return; syncLoadedLibraryAudioDuration(); updatePlayerUi(); });
audio.addEventListener('durationchange', () => { if (usesNativeUnifiedAudio()) return; syncLoadedLibraryAudioDuration(); updatePlayerUi(); });
audio.addEventListener('play', () => { if (!usesNativeUnifiedAudio()) { updatePlayerUi(); if(state.current){usageAnalytics.setMedia({isPlaying:true,mediaType:'audio',playerState:'playing',shiurId:String(state.current.id||'')});usageAnalytics.event('audio_start',{shiurId:String(state.current.id||''),mediaType:'audio',dedupeKey:`audio-start:${state.current.id}`,cooldownMs:10000});} } });
audio.addEventListener('pause', () => {
  if (usesNativeUnifiedAudio()) return;
  updatePlayerUi();
  if(state.current) usageAnalytics.setMedia({isPlaying:false,mediaType:'audio',playerState:'paused',shiurId:String(state.current.id||'')});
  saveCurrentAudioHistory(true, false);
});
audio.addEventListener('ended', async () => {
  if (usesNativeUnifiedAudio()) return;
  if(state.current) usageAnalytics.setMedia({isPlaying:false,mediaType:'audio',playerState:'paused',shiurId:String(state.current.id||'')});
  saveCurrentAudioHistory(true, true);
  if (state.sleepMode === 'end') state.sleepMode = 'off';
  if (state.sleepTimer) clearTimeout(state.sleepTimer);
  state.sleepTimer = null;
  state.sleepEndsAt = null;
  const advanced = await advanceQueue(1);
  if (!advanced) updatePlayerUi();
});
audio.addEventListener('error', () => {
  if (usesNativeUnifiedAudio()) return;
  console.warn('Audio playback error', audio.error);
  if (state.current?.offline && state.current?.networkUrl && navigator.onLine !== false) {
    const networkUrl = state.current.networkUrl;
    state.current = { ...state.current, offline:false, url:networkUrl };
    audio.src = networkUrl; audio.load(); audio.play().catch(() => {});
    setToast(currentLanguage()==='he'?'הקובץ השמור לא נפתח; עברנו להזרמה.':'Saved copy could not play; switched to streaming.');
  }
});

async function openWatch(id, requestedTime = null, options = {}) {
  const video = state.videoById.get(String(id));
  if (!video) return;
  usageAnalytics.event('shiur_opened',{shiurId:String(id),mediaType:'video',dedupeKey:`shiur-open:${id}`,cooldownMs:60000});
  usageAnalytics.setMedia({isPlaying:false,mediaType:'video',playerState:'paused',shiurId:String(id)});
  const fromAudio = Boolean(options && options.fromAudio && currentAudioIsAuthoritative() && state.current && state.current.id === String(id));
  const fromAudioSnapshot = fromAudio ? captureCurrentAudioHistorySnapshot(String(id)) : null;
  const fromAudioWasPlaying = fromAudio && options.wasPlaying !== false && !playbackIsPaused();
  if (fromAudioSnapshot) saveAudioHistorySnapshot(fromAudioSnapshot, false, { reconcile:true }).catch(()=>{});
  const sameParkedWatch = Boolean(
    fromAudio && state.watchVideo && videoId(state.watchVideo) === String(id) &&
    state.watchMode === 'audio' && state.watchVimeo &&
    persistentVideoMount?.querySelector('#watchVimeoFrame')
  );
  if (sameParkedWatch) {
    state.playerOpen = false;
    await switchWatchMode('video');
    return;
  }

  // A new Video becomes authoritative over any standalone/different Audio. Save
  // that Audio at its live clock first, then detach its UI state. For a playing
  // same-shiur Audio -> Video handoff, keep the source alive until Vimeo is ready.
  if (!fromAudioWasPlaying) {
    await saveAndDetachCurrentAudioBeforeVideo(String(id), false);
  }

  if (state.watchVideo && videoId(state.watchVideo) !== String(id)) {
    const oldWatchId = videoId(state.watchVideo);
    const oldWatchMode = String(state.watchMode || 'video');
    const oldAudioSnapshot = oldWatchMode === 'audio' ? captureCurrentAudioHistorySnapshot(oldWatchId) : null;
    await preserveWatchTime();
    if (oldWatchMode === 'video') {
      let oldDuration = Number(state.watchVideo.duration) || 0;
      try { if (state.watchVimeo) oldDuration = await state.watchVimeo.getDuration(); } catch (_) {}
      await saveHistory(oldWatchId, 'video', state.watchResumeSeconds || 0, oldDuration, false, { reconcile:true });
    } else if (oldAudioSnapshot) {
      await saveAudioHistorySnapshot(oldAudioSnapshot, false, { reconcile:true });
    }
    try { if (state.watchVimeo) await state.watchVimeo.destroy(); } catch (_) {}
    state.watchVimeo = null;
    clearPersistentVideoMount();
  }
  if (!fromAudioWasPlaying && currentAudioIsAuthoritative() && !playbackIsPaused()) await PlaybackController.pause().catch(()=>{});
  setPlaybackAuthorityFence('VIDEO', id, 5000);
  state.watchVideo = video;
  state.pendingWatchMode = '';
  state.watchMode = 'video';
  state.watchAudioToVideoHandoff = Boolean(fromAudioWasPlaying);
  state.watchAudioToVideoHandoffId = fromAudioWasPlaying ? String(id) : '';
  state.watchAudioToVideoTargetSeconds = fromAudioWasPlaying ? Math.max(0, Number(requestedTime) || Number(fromAudioSnapshot?.position) || playbackPositionSeconds() || 0) : 0;
  state.playerOpen = false;
  if (!fromAudioWasPlaying) clearCurrentAudioStateForVideo();
  state.watchMinimized = false;
  state.watchVimeoReady = false;
  state.watchVimeoGeneration += 1;
  state.watchComments = [];
  state.watchCommentsError = '';
  state.watchCommentsLoading = true;
  state.editingCommentId = '';
  const shouldLoadResume = requestedTime == null;
  state.watchResumeSeconds = shouldLoadResume ? cachedSavedPosition(String(id), 'video') : Number(requestedTime) || 0;
  state.watchHostedExternally = false;
  render();
  hostCurrentWatchOverlay('full');
  // Initialize Vimeo only after its iframe has reached the permanent external
  // host. Full, mini and PiP now resize this one player instead of rebuilding it.
  initWatchVimeo(true);
  loadComments();
  if (fromAudioSnapshot && state.user) {
    saveHistory(String(id), 'video', state.watchResumeSeconds, Number(video.duration) || fromAudioSnapshot.duration || 0, false, { reconcile:true }).catch(()=>{});
  }
  if (shouldLoadResume && state.watchResumeSeconds <= 0 && state.user) {
    // Rare fallback for an account whose history was not present in the initial
    // session payload. Do not block playback while checking it.
    getSavedPosition(String(id), 'video').then(seconds => {
      if (!state.watchVideo || videoId(state.watchVideo) !== String(id) || state.watchResumeSeconds > 5) return;
      const saved = Number(seconds) || 0;
      if (saved <= 1) return;
      state.watchResumeSeconds = saved;
      if (state.watchMode === 'video' && state.watchVimeo) state.watchVimeo.setCurrentTime(saved).catch(() => {});
    }).catch(() => {});
  }
}

async function preserveWatchTime() {
  if (!state.watchVideo) return;
  if (state.watchMode === 'video') {
    state.watchResumeSeconds = await quickVimeoTime(state.watchResumeSeconds || 0);
  } else if (state.watchMode === 'audio' && state.current && state.current.id === videoId(state.watchVideo)) {
    state.watchResumeSeconds = playbackPositionSeconds() || 0;
  }
}

async function closeWatch(save = true) {
  if (!state.watchVideo) return;
  if (save) await preserveWatchTime();
  if (state.watchMode === 'video' && state.watchVideo && save) {
    let duration = 0;
    try { duration = state.watchVimeo ? await state.watchVimeo.getDuration() : Number(state.watchVideo.duration) || 0; } catch (_) {}
    await saveHistory(videoId(state.watchVideo), 'video', state.watchResumeSeconds || 0, duration, false, { reconcile:true });
  } else if (state.watchMode === 'audio' && save) {
    const snapshot = captureCurrentAudioHistorySnapshot(videoId(state.watchVideo));
    if (snapshot) await saveAudioHistorySnapshot(snapshot, false, { reconcile:true });
  }
  try { if (state.watchVimeo) await state.watchVimeo.destroy(); } catch (_) {}
  if (state.watchMode === 'video') {
    clearCurrentAudioStateForVideo();
    clearNativeMediaSession();
  }
  state.watchVimeo = null;
  state.watchVimeoReady = false;
  state.watchVideoPlaying = false;
  state.watchVimeoGeneration += 1;
  setNativeVideoFullscreen(false);
  clearPersistentVideoMount();
  state.watchVideo = null;
  if (!state.current) usageAnalytics.setMedia({isPlaying:false,mediaType:'none',playerState:'browsing',shiurId:''});
  state.pendingWatchMode = '';
  state.watchAudioToVideoHandoff = false;
  state.watchAudioToVideoCommitPromise = null;
  state.watchAudioToVideoCommitPromiseId = '';
  state.watchAudioToVideoHandoffId = '';
  state.watchAudioToVideoTargetSeconds = 0;
  state.watchMinimized = false;
  state.watchComments = [];
  state.watchCommentsError = '';
  state.editingCommentId = '';
  render();
}

async function performWatchModeSwitch(mode) {
  if (!state.watchVideo || !['video', 'audio'].includes(mode) || mode === state.watchMode) return true;
  const video = state.watchVideo;
  const id = videoId(video);

  if (mode === 'audio') {
    state.watchAudioToVideoHandoff = false;
    state.watchAudioToVideoHandoffId = '';
    state.watchAudioToVideoTargetSeconds = 0;
    const switched = await switchVideoToAudioSeamlessly(video, id);
    if (!switched) {
      if (usesNativeUnifiedAudio()) {
        setToast(currentLanguage()==='he'?'האודיו עדיין לא מוכן. הווידאו ממשיך לנגן.':'Audio is not ready yet. Video is still playing.');
        return false;
      }
      // Legacy iOS/Web fallback only. Android's transactional handoff never
      // destroys a working source when the destination fails.
      const exact = await quickVimeoTime(state.watchResumeSeconds || 0, 450);
      state.watchResumeSeconds = exact;
      const player = state.watchVimeo;
      if (player) await Promise.resolve(player.pause()).catch(() => {});
      state.watchMode = 'audio';
      state.watchVideoPlaying = false;
      state.watchMinimized = false;
      clearPersistentVideoMount();
      state.watchVimeo = null;
      state.watchVimeoReady = false;
      state.watchVimeoGeneration += 1;
      render();
      await playVideoAudio(id, exact, true);
      state.playerOpen = false;
      render();
      const audioSnapshot = captureCurrentAudioHistorySnapshot(id);
      if (audioSnapshot) saveAudioHistorySnapshot(audioSnapshot, false, { reconcile:true }).catch(()=>{});
    }
    return true;
  }

  // Capture the Audio clock BEFORE changing native authority to VIDEO. Once the
  // native mode flips, playbackPositionSeconds() intentionally stops reading the
  // Media3 audio clock and must never be used to save the outgoing Audio position.
  const audioSnapshot = captureCurrentAudioHistorySnapshot(id);
  const seconds = audioSnapshot?.position ?? Math.max(0, Number(state.watchResumeSeconds) || 0);
  const keepAudioUntilVideoStarts = Boolean(audioSnapshot && !playbackIsPaused());
  if (audioSnapshot) saveAudioHistorySnapshot(audioSnapshot, false).catch(()=>{});

  setPlaybackAuthorityFence('VIDEO', id, 5000);
  state.watchResumeSeconds = seconds;
  state.watchMode = 'video';
  state.watchVideoPlaying = false;
  state.watchAudioToVideoHandoff = keepAudioUntilVideoStarts;
  state.watchAudioToVideoHandoffId = keepAudioUntilVideoStarts ? id : '';
  state.watchAudioToVideoTargetSeconds = keepAudioUntilVideoStarts ? seconds : 0;
  if (!keepAudioUntilVideoStarts) clearCurrentAudioStateForVideo();

  // If this video was parked while Audio mode was active, reuse the exact same
  // Vimeo iframe/player. No reload is needed; audio remains audible while Vimeo
  // seeks forward to the current audio clock and then hands off in place.
  if (restoreParkedHostedVideo()) {
    render();
    const ok = await resumeParkedVideoFromAudio(video, id, keepAudioUntilVideoStarts);
    if (!ok) {
      if (usesNativeUnifiedAudio()) {
        state.watchMode = 'audio';
        setPlaybackAuthorityFence('AUDIO', id, 2500);
        parkHostedVideoForAudio();
        if (audioSnapshot) saveAudioHistorySnapshot(audioSnapshot, false, { reconcile:true }).catch(()=>{});
        setToast(currentLanguage()==='he'?'הווידאו עדיין לא מוכן. האודיו ממשיך לנגן.':'Video is not ready yet. Audio is still playing.');
        render();
        return false;
      }
      clearPersistentVideoMount();
      state.watchVimeo = null;
      state.watchVimeoReady = false;
      state.watchVimeoGeneration += 1;
      state.watchHostedExternally = false;
      render();
      hostCurrentWatchOverlay('full');
      initWatchVimeo(keepAudioUntilVideoStarts);
    }
  } else {
    state.watchVimeoReady = false;
    state.watchVimeoGeneration += 1;
    state.watchHostedExternally = false;
    render();
    hostCurrentWatchOverlay('full');
    initWatchVimeo(keepAudioUntilVideoStarts);
  }

  // The user's latest presentation is now Video. Queue this behind the outgoing
  // Audio snapshot so even slow network responses cannot reverse the final resume.
  if (state.user) {
    saveHistory(id, 'video', state.watchResumeSeconds, Number(video.duration) || audioSnapshot?.duration || 0, false, { reconcile:true }).catch(()=>{});
  }
  return true;
}

async function switchWatchMode(mode) {
  if (!state.watchVideo || !['video', 'audio'].includes(mode)) return;
  // Last tap wins. A tap that arrives while a handoff is running replaces the
  // pending target instead of being dropped.
  state.pendingWatchMode = mode;
  if (state.mediaSwitchBusy) return;

  state.mediaSwitchBusy = true;
  try {
    while (state.watchVideo && state.pendingWatchMode) {
      const targetMode = state.pendingWatchMode;
      state.pendingWatchMode = '';
      if (targetMode === state.watchMode) continue;
      const previousMode = state.watchMode;
      const switched = await performWatchModeSwitch(targetMode);
      if (switched !== false && state.watchMode === targetMode && previousMode !== targetMode) usageAnalytics.event(targetMode === 'audio' ? 'video_to_audio' : 'audio_to_video', { shiurId:String(videoId(state.watchVideo)||''), mediaType:targetMode, dedupeKey:`switch:${targetMode}:${videoId(state.watchVideo)}`, cooldownMs:2000 });
    }
  } finally {
    state.mediaSwitchBusy = false;
    if (state.watchVideo && state.pendingWatchMode && state.pendingWatchMode !== state.watchMode) {
      const pending = state.pendingWatchMode;
      queueMicrotask(() => switchWatchMode(pending));
    }
  }
}

async function initWatchVimeo(userInitiated = false) {
  if (state.watchVimeo) return;
  const video = state.watchVideo;
  const frame = document.getElementById('watchVimeoFrame');
  if (!video || !frame || !window.Vimeo || !window.Vimeo.Player || state.watchMode !== 'video') return;
  const generation = state.watchVimeoGeneration;
  const videoKey = videoId(video);
  try {
    const player = new window.Vimeo.Player(frame);
    state.watchVimeo = player;
    state.watchVimeoReady = false;
    const requestedResume = Math.max(0, Number(state.watchResumeSeconds) || 0);
    const frameStart = Math.max(0, Number(frame.dataset.startSeconds) || 0);
    const audioToVideoHandoff = Boolean(state.watchAudioToVideoHandoff && state.watchAudioToVideoHandoffId === videoKey && state.current && state.current.id === videoKey);
    if (audioToVideoHandoff) setVimeoHandoffMuted(player, true).catch(() => {});
    const videoMediaItem = {
      ...video,
      title: displayShiurTitle(video.title, 'Shiur'),
      subtitle: video._speakerLabel || video.speaker || 'Irgun Shiurai Torah',
      backgroundAudioUrl: video.hasAudio ? audioUrl(mediaApiId(video, videoId(video))) : ''
    };
    let lastHistory = 0;

    // Register events BEFORE ready()/play(). Vimeo may autoplay as soon as the
    // iframe has enough data. Catching that first play event lets us make the
    // Audio -> Video handoff without a silent gap or a period of double audio.
    player.on('timeupdate', data => {
      if (generation !== state.watchVimeoGeneration || state.watchMode !== 'video') return;
      state.watchResumeSeconds = Number(data.seconds) || 0;
      if (state.systemPipActive && state.watchResumeSeconds > 0 && (state.systemPipLastSeconds < 3 || state.watchResumeSeconds >= state.systemPipLastSeconds - 3)) {
        state.systemPipLastSeconds = state.watchResumeSeconds;
      }
      syncNativeMediaSession(videoMediaItem, true, data.seconds || 0, data.duration || video.duration || 0, 'video');
      if (!usesNativeUnifiedAudio() && 'mediaSession' in navigator && Number(data.duration) > 0) {
        try { navigator.mediaSession.setPositionState({duration:Number(data.duration), playbackRate:1, position:Math.min(Number(data.seconds)||0, Number(data.duration))}); } catch (_) {}
      }
      if (state.watchResumeSeconds >= 30) recordPublicView(videoId(video), 'video');
      const now = Date.now();
      if (state.user && now - lastHistory >= 15000) {
        lastHistory = now;
        saveHistory(videoId(video), 'video', data.seconds || 0, data.duration || video.duration || 0, false);
      }
    });
    player.on('play', async () => {
      if (generation !== state.watchVimeoGeneration) return;
      state.watchVideoPlaying = true;
      usageAnalytics.setMedia({isPlaying:true,mediaType:'video',playerState:'playing',shiurId:String(videoKey)});
      usageAnalytics.event('video_start',{shiurId:String(videoKey),mediaType:'video',dedupeKey:`video-start:${videoKey}`,cooldownMs:10000});
      refreshPersistentMiniVideoChrome();
      prewarmVideoAudioMetadata(video, videoKey);
      let t = await player.getCurrentTime().catch(()=>state.watchResumeSeconds || 0);
      const d = await player.getDuration().catch(()=>Number(video.duration)||0);
      // Rescue a handoff if Vimeo's first play attempt was delayed. Never stop the
      // audio until this already-ready player has caught up to the live audio clock.
      if (state.watchVimeoReady && state.watchAudioToVideoHandoff && state.watchAudioToVideoHandoffId === videoKey && !playbackIsPaused()) {
        const live = Math.max(0, playbackPositionSeconds() || Number(state.watchAudioToVideoTargetSeconds) || 0);
        if (Math.abs((Number(t) || 0) - live) > 0.75) {
          const actual = await Promise.race([
            Promise.resolve(player.setCurrentTime(live)).catch(() => null),
            new Promise(resolve => setTimeout(() => resolve(null), 1400))
          ]);
          if (Number.isFinite(Number(actual))) t = Number(actual);
        }
        await finishAudioToVideoHandoff(videoKey, player).catch(error => {
          console.warn('[Playback] play-event Audio -> Video commit deferred/failed', error);
        });
      }
      state.watchResumeSeconds = Math.max(0, Number(t) || state.watchResumeSeconds || 0);
      syncNativeMediaSession(videoMediaItem, true, t, d, 'video');
    });
    player.on('pause', async () => {
      if (generation !== state.watchVimeoGeneration) return;
      state.watchVideoPlaying = false;
      usageAnalytics.setMedia({isPlaying:false,mediaType:'video',playerState:'paused',shiurId:String(videoKey)});
      refreshPersistentMiniVideoChrome();
      const t = await player.getCurrentTime().catch(()=>state.watchResumeSeconds || 0);
      const d = await player.getDuration().catch(()=>Number(video.duration)||0);
      syncNativeMediaSession(videoMediaItem, false, t, d, 'video');
    });
    player.on('ended', data => {
      if (generation!==state.watchVimeoGeneration) return;
      state.watchVideoPlaying = false;
      usageAnalytics.setMedia({isPlaying:false,mediaType:'video',playerState:'paused',shiurId:String(videoKey)});
      refreshPersistentMiniVideoChrome();
      syncNativeMediaSession(videoMediaItem, false, data.duration || video.duration || 0, data.duration || video.duration || 0, 'video');
      saveHistory(videoId(video), 'video', data.duration || video.duration || 0, data.duration || video.duration || 0, true);
    });
    if (player.on) {
      player.on('fullscreenchange', data => {
        if (typeof setNativeVideoFullscreen === 'function') setNativeVideoFullscreen(Boolean(data && data.fullscreen));
      });
    }

    // Publish the media URL immediately so Android can pre-warm the background
    // audio engine while Vimeo is loading/playing. This makes Home-button handoff
    // much closer to continuous playback.
    syncNativeMediaSession(videoMediaItem, false, requestedResume, Number(video.duration) || 0, 'video');

    // The iframe itself already contains #t=<seconds>s, so Vimeo requests the
    // middle of the video from the beginning instead of loading 0:00 and then
    // performing a second network seek. Queue play immediately as well.
    if (userInitiated && !audioToVideoHandoff) player.play().catch(() => {});

    await player.ready();
    if (generation !== state.watchVimeoGeneration || state.watchMode !== 'video' || !state.watchVideo || videoId(state.watchVideo) !== videoKey || state.watchVimeo !== player) {
      try { await player.destroy(); } catch (_) {}
      return;
    }
    state.watchVimeoReady = true;
    if (typeof player.setPlaybackRate === 'function') await player.setPlaybackRate(Number(state.playbackSpeed)||1).catch(()=>{});
    prewarmVideoAudioMetadata(video, videoKey);

    if (requestedResume > 1) {
      // Usually the timestamp fragment already put Vimeo at the right place. Verify
      // quickly and use the SDK seek only as a fallback, avoiding the old multi-second
      // ready -> seek -> buffer cycle.
      let current = await Promise.race([
        Promise.resolve(player.getCurrentTime()).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 650))
      ]);
      let n = Number(current);
      const needsFallbackSeek = !Number.isFinite(n) || n < Math.max(0.5, requestedResume - 4) || n > requestedResume + 15;
      if (needsFallbackSeek) {
        const duration = await Promise.race([
          Promise.resolve(player.getDuration()).catch(() => Number(video.duration) || 0),
          new Promise(resolve => setTimeout(() => resolve(Number(video.duration) || 0), 450))
        ]);
        const target = Number(duration) > 0 ? Math.min(requestedResume, Math.max(0, Number(duration) - 1)) : requestedResume;
        const actual = await Promise.race([
          Promise.resolve(player.setCurrentTime(target)).catch(() => null),
          new Promise(resolve => setTimeout(() => resolve(null), 1600))
        ]);
        if (Number.isFinite(Number(actual))) n = Number(actual);
      }
      if (Number.isFinite(n)) state.watchResumeSeconds = Math.max(0, n);
      else if (frameStart > 1) state.watchResumeSeconds = frameStart;
    }

    if (generation !== state.watchVimeoGeneration || state.watchMode !== 'video') return;
    if (audioToVideoHandoff && state.watchAudioToVideoHandoff && state.watchAudioToVideoHandoffId === videoKey && !playbackIsPaused()) {
      // Vimeo is now initialized. Chase the live audio clock once, while muted,
      // so switching after listening in Audio mode never replays the loading gap.
      const liveTarget = Math.max(0, playbackPositionSeconds() || requestedResume);
      state.watchAudioToVideoTargetSeconds = liveTarget;
      let current = await Promise.race([
        Promise.resolve(player.getCurrentTime()).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 250))
      ]);
      if (!Number.isFinite(Number(current)) || Math.abs(Number(current) - liveTarget) > 0.65) {
        const actual = await Promise.race([
          Promise.resolve(player.setCurrentTime(liveTarget)).catch(() => null),
          new Promise(resolve => setTimeout(() => resolve(null), 1600))
        ]);
        if (Number.isFinite(Number(actual))) current = Number(actual);
      }
      const played = await Promise.race([
        Promise.resolve(player.play()).then(() => true).catch(() => false),
        new Promise(resolve => setTimeout(() => resolve(false), 1800))
      ]);
      if (played) {
        const readyPosition = await waitForVimeoHandoffReady(player, videoKey, 4200);
        if (Number.isFinite(Number(readyPosition))) {
          state.watchVideoPlaying = true;
          state.watchResumeSeconds = Math.max(0, Number(readyPosition));
          await finishAudioToVideoHandoff(videoKey, player);
        }
      }
    } else if (userInitiated) {
      await player.play().catch(() => {});
    }

    if (!usesNativeUnifiedAudio() && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: displayShiurTitle(video.title, 'Shiur'),
          artist: video._speakerLabel || video.speaker || 'Irgun Shiurai Torah',
          album: 'Irgun Shiurai Torah',
          artwork: video.thumbnail ? [{ src: video.thumbnail }] : [{ src: '/logo.png' }]
        });
        navigator.mediaSession.setActionHandler('play', () => state.watchVimeo && state.watchVimeoReady && state.watchVimeo.play());
        navigator.mediaSession.setActionHandler('pause', () => state.watchVimeo && state.watchVimeoReady && state.watchVimeo.pause());
        navigator.mediaSession.setActionHandler('seekbackward', async d => { if (!state.watchVimeo || !state.watchVimeoReady) return; const t=await state.watchVimeo.getCurrentTime(); await state.watchVimeo.setCurrentTime(Math.max(0,t-(d.seekOffset||15))); });
        navigator.mediaSession.setActionHandler('seekforward', async d => { if (!state.watchVimeo || !state.watchVimeoReady) return; const t=await state.watchVimeo.getCurrentTime(); const dur=await state.watchVimeo.getDuration(); await state.watchVimeo.setCurrentTime(Math.min(dur,t+(d.seekOffset||15))); });
      } catch (_) {}
    }
  } catch (error) {
    if (generation === state.watchVimeoGeneration) {
      state.watchVimeoReady = false;
      console.warn('Vimeo player init failed', error);
      // If Audio -> Video failed, leave the audio playing instead of producing a
      // dead/silent player. The user can retry Video without losing their place.
      if (state.watchAudioToVideoHandoff && state.watchAudioToVideoHandoffId === videoKey) {
        try { state.watchVimeo?.destroy?.(); } catch (_) {}
        state.watchVimeo = null;
        state.watchMode = 'audio';
        setPlaybackAuthorityFence('AUDIO', videoKey, 2500);
        state.watchAudioToVideoHandoff = false;
        state.watchAudioToVideoHandoffId = '';
        clearPersistentVideoMount();
        const audioSnapshot = captureCurrentAudioHistorySnapshot(videoKey);
        if (audioSnapshot) saveAudioHistorySnapshot(audioSnapshot, false, { reconcile:true }).catch(()=>{});
        render();
      }
    }
  }
}

async function loadComments() {
  if (!state.watchVideo) return;
  const id = videoId(state.watchVideo);
  state.watchCommentsLoading = true;
  state.watchCommentsError = '';
  refreshCommentsUi();
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => { try { controller?.abort(); } catch (_) {} }, 12000);
  try {
    const data = await apiJson(`/comments?videoId=${encodeURIComponent(id)}&_=${Date.now()}`, controller ? { signal:controller.signal } : {});
    if (!state.watchVideo || videoId(state.watchVideo) !== id) return;
    state.watchComments = data.comments || [];
    state.watchCommentsError = '';
  } catch (error) {
    if (!state.watchVideo || videoId(state.watchVideo) !== id) return;
    console.warn('Comments load failed', error);
    state.watchComments = [];
    state.watchCommentsError = error?.name === 'AbortError'
      ? 'Comments took too long to load.'
      : 'Comments could not load right now.';
  } finally {
    clearTimeout(timeout);
    if (state.watchVideo && videoId(state.watchVideo) === id) {
      state.watchCommentsLoading = false;
      refreshCommentsUi();
    }
  }
}

async function postComment() {
  if (!state.watchVideo) return;
  if (!state.user) return requireLogin('Please sign in to leave a comment.');
  const field = document.getElementById('commentText');
  const text = field ? field.value.trim() : '';
  if (!text) return;
  await preserveWatchTime();
  try {
    await apiJson('/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: videoId(state.watchVideo), text })
    });
    await loadComments();
  } catch (error) {
    alert(error.message || 'Could not post comment.');
  }
}

async function editComment(commentId) {
  const comment = state.watchComments.find(c => String(c.id) === String(commentId));
  if (!comment) return;
  state.editingCommentId = String(commentId);
  refreshCommentsUi();
  setTimeout(() => {
    const field = document.getElementById(`editCommentText-${commentId}`);
    if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); }
  }, 0);
}

async function saveEditedComment(commentId) {
  const field = document.getElementById(`editCommentText-${commentId}`);
  const text = field ? field.value.trim() : '';
  if (!text) return;
  await preserveWatchTime();
  try {
    await apiJson(`/comments/${encodeURIComponent(commentId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    state.editingCommentId = '';
    await loadComments();
  } catch (error) {
    alert(error.message || 'Could not edit comment.');
  }
}

async function deleteComment(commentId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;
  await preserveWatchTime();
  try {
    await apiJson('/comments/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ commentId: String(commentId) })
    });
    if (String(state.editingCommentId) === String(commentId)) state.editingCommentId = '';
    await loadComments();
  } catch (error) {
    alert(error.message || 'Could not delete comment.');
  }
}

window.addEventListener('beforeunload', () => {
  // The visible/authoritative source wins. A stale paid-audio object must never
  // prevent the current Vimeo position from being saved on app/page exit.
  if (state.watchVideo && state.watchMode === 'video') {
    if (!state.user) return;
    const progress = Math.max(0, Number(state.watchResumeSeconds) || Number(state.systemPipLastSeconds) || 0);
    const duration = Math.max(0, Number(state.watchVideo.duration) || (String(state.nativePlayback?.mode || '') === 'VIDEO' ? nativeAudioDurationSeconds() : 0));
    try {
      fetch(`${API}/history`, {
        method:'POST',
        headers:authHeaders({ 'Content-Type':'application/json' }),
        credentials:'include',
        keepalive:true,
        body:JSON.stringify({
          videoId:videoId(state.watchVideo),
          mediaType:'video',
          progressSeconds:Math.floor(progress),
          durationSeconds:Math.floor(duration),
          completed:false
        })
      });
    } catch (_) {}
    return;
  }

  if (state.current?.kind === 'paid-audio') {
    savePaidAudioProgress(false, true);
    return;
  }
  if (!state.user) return;

  let payload = null;
  {
    const snapshot = captureCurrentAudioHistorySnapshot();
    if (snapshot) {
      payload = {
        videoId:snapshot.id,
        mediaType:'audio',
        progressSeconds:Math.floor(snapshot.position),
        durationSeconds:Math.floor(snapshot.duration),
        completed:false
      };
    }
  }

  if (!payload) return;
  try {
    fetch(`${API}/history`, {
      method:'POST',
      headers:authHeaders({ 'Content-Type':'application/json' }),
      credentials:'include',
      keepalive:true,
      body:JSON.stringify(payload)
    });
  } catch (_) {}
});


// Prevent accidental one-finger double-tap page zoom while keeping normal
// two-finger pinch zoom available. Interactive controls keep their normal taps.
(function installAccidentalDoubleTapZoomGuard(){
  let lastTarget = null;
  let lastAt = 0;
  const isInteractive = node => Boolean(node?.closest?.('button,a,input,select,textarea,label,[role="button"],[contenteditable="true"]'));
  document.addEventListener('touchend', event => {
    if (event.touches?.length > 0 || isInteractive(event.target)) { lastTarget = null; lastAt = 0; return; }
    const now = Date.now();
    const target = event.target;
    if (target === lastTarget && now - lastAt > 0 && now - lastAt < 360) {
      event.preventDefault();
      lastTarget = null;
      lastAt = 0;
      return;
    }
    lastTarget = target;
    lastAt = now;
  }, { passive:false });
  document.addEventListener('dblclick', event => {
    if (!isInteractive(event.target)) event.preventDefault();
  }, { passive:false });
})();

if (Capacitor.isNativePlatform()) {
  LocalNotifications.addListener('localNotificationActionPerformed', event => { if(event?.notification?.extra?.route==='schedule'){ state.screen='schedule'; state.scheduleDataLoaded=false; render(); } }).catch?.(()=>{});
}

render();
PlaybackController.init().catch(()=>{});
// Show the last complete local catalog immediately, then refresh it from the
// network. Reopening the app should not look like a cold start every time.
hydrateInitialCatalogCache().catch(()=>false).finally(() => bootstrap({ initial:true, background:true }));

window.addEventListener('online', () => {
  if (state.error || state.offlineMode || state.usingCachedLibrary) bootstrap({ background:true });
});
window.addEventListener('offline', () => {
  if (state.libraryReady) { state.offlineMode = true; state.usingCachedLibrary = true; }
  else { state.loading = false; state.error = 'offline'; state.offlineMode = true; }
  render();
  updateReconnectTimer();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) PlaybackController.refreshFromNative().catch(()=>{});
  if (!document.hidden && (state.error || state.offlineMode || state.usingCachedLibrary)) bootstrap({ background:true });
});
window.addEventListener('focus', () => {
  handlePendingPushOpen();
  if (state.error || state.offlineMode || state.usingCachedLibrary) bootstrap({ background:true });
});
setTimeout(() => handlePendingPushOpen(), 1200);
