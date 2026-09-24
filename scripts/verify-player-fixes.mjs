import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const main = read('src/main.js');
const css = read('src/style.css');
const activity = read('android/app/src/main/java/org/irgunshiuraitorah/app/MainActivity.java');
const plugin = read('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackPlugin.java');
const service = read('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunPlaybackService.java');
const gradle = read('android/app/build.gradle');
const instrumentedTest = read('android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java');
const sdkHelper = read('ENSURE-ANDROID-SDK-WINDOWS.cmd');
const distBundle = read('dist/assets/index-v15122.js');
const androidBundle = read('android/app/src/main/assets/public/assets/index-v15122.js');
const distIndex = read('dist/index.html');
const androidIndex = read('android/app/src/main/assets/public/index.html');

assert.match(css, /\.watch-host-mini-chrome\s*\{\s*display\s*:\s*none\s*;/, 'mini chrome must be hidden outside the mini host');
assert.match(css, /#persistentVideoMount\.watch-mini-host \.watch-host-mini-chrome[\s\S]*?display\s*:\s*grid\s*!important/, 'mini host must opt its chrome back in');
assert.match(main, /const sameParkedWatch = Boolean\(/, 'Watch must detect the parked player');
assert.match(main, /if \(sameParkedWatch\)[\s\S]*?switchWatchMode\('video'\)/, 'Watch must restore instead of duplicate the parked player');
assert.match(main, /function nativeSnapshotConflicts\(/, 'native events need an authority fence');
assert.match(main, /nativePlaybackDisabled/, 'HTML playback fallback must be reachable');
assert.match(main, /confirmBackgroundVideoPaused/, 'JS must explicitly confirm the Vimeo pause');

const pauseStart = activity.indexOf('public void onPause()');
const resumeStart = activity.indexOf('public void onResume()');
assert.ok(pauseStart >= 0 && resumeStart > pauseStart, 'Activity lifecycle methods must exist');
assert.doesNotMatch(activity.slice(pauseStart, resumeStart), /handleAppBackgrounded/, 'onPause/onStop must not switch media source');
assert.equal((activity.match(/handleAppBackgrounded\(\)/g) || []).length, 1, 'only the explicit user-leave path may start background handoff');

assert.doesNotMatch(plugin, /AtomicBoolean/, 'evaluateJavascript completion must not be treated as a pause acknowledgement');
assert.match(plugin, /public void confirmBackgroundVideoPaused\(PluginCall call\)/, 'native bridge must expose pause confirmation');
assert.match(service, /backgroundHandoffId/, 'service must fence background confirmations by ID');
assert.match(service, /confirmBackgroundVideoPausedInternal/, 'service must consume the explicit pause confirmation');
assert.match(service, /}, 1200L\);/, 'suspended WebView handoff must have a bounded fallback');
assert.match(service, /pendingBridgeCommands\.size\(\) >= 32/, 'startup command queue must be bounded');

// V15.1.8: handoff/history/recovery regressions.
assert.match(main, /pendingWatchMode/, 'mode switches must keep a pending last-tap target');
assert.match(main, /while \(state\.watchVideo && state\.pendingWatchMode\)/, 'queued mode switches must drain until the last user choice is applied');
assert.doesNotMatch(main, /if \(!state\.watchVideo \|\| state\.mediaSwitchBusy\) return;/, 'busy handoffs must not discard the next mode tap');
assert.match(main, /function captureCurrentAudioHistorySnapshot\(/, 'Audio progress must be snapshotted before authority changes');
assert.match(main, /function historyLogicalKey\(/, 'history must have one logical key for a video-backed shiur');
assert.match(main, /return `shiur:\$\{raw\}`/, 'video and video-audio history must share a logical key');
assert.match(main, /function queueHistoryWrite\(/, 'history writes for one shiur must be serialized');
assert.match(main, /reconcileHistoryForShiur/, 'opposite-mode history rows must be reconciled');
assert.match(main, /presentationChanged = Boolean\(key\.startsWith\('shiur:'\)/, 'any Audio/Video presentation change must trigger history reconciliation');
assert.match(main, /if \(state\.watchVideo && state\.watchMode === 'video'\)[\s\S]*?mediaType:'video'/, 'unload must save the authoritative video clock');
assert.match(main, /recoverFromNativePlaybackError/, 'runtime Media3 errors need a recovery path');
assert.match(plugin, /IrgunPlaybackService\.Snapshot snapshot = IrgunPlaybackService\.getSnapshot\(\)/, 'native errors must include the current lecture snapshot');
assert.doesNotMatch(main, /if \(wasPlaying && !started\?\.audioIsPlaying && !started\?\.isPlaying\)/, 'buffering must not be misclassified as a failed handoff');

// V15.1.9: close the remaining playback/history reliability gaps.
assert.match(main, /watchAudioToVideoCommitPromiseId/, 'Audio -> Video commits must be fenced by lecture ID');
assert.match(main, /if \(String\(state\.watchAudioToVideoCommitPromiseId \|\| ''\) === key\) return state\.watchAudioToVideoCommitPromise/, 'same-lecture handoff callers must share one transaction');
assert.match(main, /async function saveAndDetachCurrentAudioBeforeVideo\(/, 'opening unrelated Video must snapshot outgoing Audio');
assert.match(main, /await saveAndDetachCurrentAudioBeforeVideo\(String\(id\), false\)/, 'Video open must save/detach outgoing Audio before replacing it');
assert.match(main, /function clearCurrentAudioStateForVideo\(/, 'video authority must clear stale standalone Audio UI state');
assert.match(main, /plugin\?\.stopAudio\?\.\(\{ clearLecture:true \}\)/, 'HTML fallback must fully clear stale native lecture/session metadata');
assert.match(main, /await PlaybackController\.switchAuthorityToVideo\(position, duration, true\);/, 'Audio -> Video must await native authority confirmation');
assert.match(main, /state\.watchVideoToAudioHandoff \|\| state\.watchAudioToVideoHandoff \|\| state\.watchMode !== 'video'/, 'Vimeo callbacks must not steal authority during either handoff direction');
assert.match(main, /if \(!result\) throw new Error\('Native player returned no VIDEO authority confirmation\.'\)/, 'JS must not invent VIDEO authority when the native confirmation is missing');

const unloadStart = main.indexOf("window.addEventListener('beforeunload'");
const unloadEnd = main.indexOf("window.addEventListener('online'", unloadStart);
const unload = main.slice(unloadStart, unloadEnd > unloadStart ? unloadEnd : undefined);
assert.ok(unload.indexOf("state.watchVideo && state.watchMode === 'video'") >= 0, 'unload must recognize authoritative Vimeo playback');
assert.ok(unload.indexOf("state.watchVideo && state.watchMode === 'video'") < unload.indexOf("state.current?.kind === 'paid-audio'"), 'active Video must win over stale paid-audio state during unload');

assert.match(plugin, /audioPlayWhenReady/, 'native snapshot must expose ExoPlayer play intent');
assert.match(plugin, /snapshot\.audioIsPlaying \|\| snapshot\.audioPlayWhenReady/, 'buffering with accepted play intent must not be rejected as a failed start');
assert.match(plugin, /boolean bufferingAccepted = shouldPlay && snapshot\.audioPlayWhenReady[\s\S]*?!snapshot\.audioReady/, 'slow initial prepare must be accepted as buffering even before the clock advances');
assert.match(plugin, /waitUntilVideoAuthority\(/, 'native VIDEO authority must be confirmed before JS unmutes Vimeo');
assert.match(plugin, /call\.reject\("Native playback did not confirm video authority"\)/, 'failed native VIDEO authority changes must surface to JS');
assert.match(service, /ignored stale AUDIO -> VIDEO authority request/, 'service must reject stale lecture handoff requests');
assert.match(service, /if \(clearLecture\) \{[\s\S]*?lectureId = "";[\s\S]*?audioUrl = "";/, 'clearing native playback must also clear lecture/source metadata');
assert.match(service, /refreshMediaNotification\(\);/, 'native cleanup must refresh/remove stale notification state');
assert.match(service, /new Snapshot\("", "", "", "", "", "", "", "", "", "", "", PlaybackMode\.AUDIO, PresentationMode\.FULL, 0L, 0L, false, 1f, 1f, false, 0L, 0L, false, false\)/, 'empty native snapshots must include the new playWhenReady field');

// V15.1.10: video notification must represent Vimeo, not a buffering MP3 shadow.
assert.match(service, /class SessionPlayer extends ForwardingPlayer/, 'MediaSession must use a logical forwarding player');
assert.match(service, /logicalVideoActive\(\) \? Player\.STATE_READY : super\.getPlaybackState\(\)/, 'VIDEO notification state must report READY');
assert.match(service, /logicalVideoActive\(\) \? externalVideoPlaying : super\.isPlaying\(\)/, 'VIDEO notification play\/pause must follow Vimeo');
assert.match(service, /public void onPlayWhenReadyChanged\(boolean playWhenReady, int reason\)/, 'notification play\/pause intent must use playWhenReady');
assert.match(service, /boolean shadowReady = player\.getPlaybackState\(\) == Player\.STATE_READY;/, 'shadow drift correction must know whether ExoPlayer is READY');
assert.match(service, /boolean videoClockJumped = Math\.abs\(incomingPositionMs - previousExternalPositionMs\) > 3500L;/, 'large Vimeo seeks must still be detected');
assert.match(service, /shadowReady && shadowDriftMs > VIDEO_SHADOW_DRIFT_LIMIT_MS/, 'normal BUFFERING timeupdates must not repeatedly seek the shadow');

// V15.1.10: stopped Activities must not receive a 500ms Capacitor playback event stream.
assert.match(plugin, /private static volatile boolean appForeground = false;/, 'plugin needs an Activity foreground gate');
assert.match(plugin, /if \(appForeground && bridgeReadyForEvents && activeInstance == IrgunPlaybackPlugin\.this/, 'position ticker must stop until the resumed bridge is ready');
assert.match(plugin, /if \(!appForeground \|\| !bridgeReadyForEvents\) \{[\s\S]*?MAIN\.removeCallbacks\(plugin\.positionTicker\);/, 'state events must be dropped while the WebView is stopped or settling');
assert.match(activity, /public void onStop\(\)[\s\S]*?IrgunPlaybackPlugin\.setAppForeground\(false\)/, 'Activity must gate WebView events at onStop');
assert.match(activity, /public void onResume\(\)[\s\S]*?IrgunPlaybackPlugin\.setAppForeground\(true\)/, 'Activity must reopen the bridge only on resume');
assert.match(activity, /public void onResume\(\)[\s\S]*?if \(pipWasActive\) \{[\s\S]*?prepareWebForPip\(false\)/, 'PiP WebView cleanup must be limited to an actual PiP exit');
const resumeOnly = activity.slice(activity.indexOf('public void onResume()'), activity.indexOf('public void onDestroy()'));
assert.doesNotMatch(resumeOnly.slice(0, resumeOnly.indexOf('if (pipWasActive)')), /evaluateJavascript|prepareWebForPip|handleAppForegrounded/, 'normal Home/notification resume must not push JavaScript into the WebView');
assert.doesNotMatch(activity, /foregroundRestoreHandler|foregroundRestoreRunnable/, 'normal reopen must not schedule delayed Java -> WebView work');
assert.match(plugin, /private static volatile boolean bridgeReadyForEvents = false;/, 'resume needs a second bridge-ready gate');
assert.match(plugin, /public static void suspendBridgeEvents\(\)/, 'onPause must be able to fence generic native events without blocking the Home handoff');
assert.match(activity, /public void onPause\(\)[\s\S]*?IrgunPlaybackPlugin\.suspendBridgeEvents\(\)/, 'Activity must suspend generic bridge events immediately on pause');
assert.match(plugin, /public void getState\(PluginCall call\) \{[\s\S]*?appForeground = true;[\s\S]*?bridgeReadyForEvents = true;/, 'an inbound JS getState call must prove the current bridge is alive before native events resume');
assert.doesNotMatch(activity.slice(activity.indexOf('public void onResume()'), activity.indexOf('public void onDestroy()')), /prepareWebForPip\(false\).*prepareWebForPip\(false\)/s, 'normal resume must not repeatedly push PiP JavaScript into the WebView');
const pauseOnly = activity.slice(activity.indexOf('public void onPause()'), activity.indexOf('public void onStop()'));
assert.doesNotMatch(pauseOnly, /setAppForeground\(false\)/, 'Home handoff must still be allowed through onPause');

assert.match(gradle, /versionCode 93/);
assert.match(main, /if \(state\.accountSection === 'settings'\) \{[\s\S]*?render\(\);[\s\S]*?reloadNotificationSettings\(\)\.finally/, 'Settings tab must render before notification refresh');
assert.match(main, /if \(state\.screen === 'account' && state\.accountSection === 'settings'\) render\(\);/, 'Settings refresh must only rerender if the user is still on Settings');

assert.match(gradle, /versionName "1\.0\.93"/);
assert.match(instrumentedTest, /org\.irgunshiuraitorah\.app/);
assert.match(sdkHelper, /ANDROID_SDK_ROOT/);
assert.match(sdkHelper, /local\.properties/);
assert.equal(existsSync(new URL('../android/local.properties', import.meta.url)), false, 'package must not ship a machine-specific local.properties');
assert.equal(distBundle, androidBundle, 'Android packaged JS must exactly match the final browser bundle');
const appSourceMarker = "const API = 'https://api.irgunshiuraitorah.com';";
assert.equal(
  distBundle.slice(distBundle.indexOf(appSourceMarker)),
  main.slice(main.indexOf(appSourceMarker)),
  'final browser bundle must contain the exact patched app source after the dependency prelude'
);
assert.equal(distIndex, androidIndex, 'Android packaged index must exactly match dist/index.html');
assert.match(distIndex, /index-v15122\.js/);

assert.match(activity, /private static volatile boolean instanceAlive = false;/, 'MainActivity needs a warm-reopen alive marker');
assert.match(activity, /public static boolean isInstanceAlive\(\)/, 'SplashActivity must be able to detect an existing MainActivity');
const splash = readFileSync(new URL('../android/app/src/main/java/org/irgunshiuraitorah/app/SplashActivity.java', import.meta.url), 'utf8');
assert.match(splash, /if \(MainActivity\.isInstanceAlive\(\)\) \{[\s\S]*?finish\(\);/, 'warm launcher reopen must only reveal the existing MainActivity');
assert.match(service, /new Intent\(this, SplashActivity\.class\)/, 'media notification must reopen through the safe launcher trampoline');
assert.doesNotMatch(service, /new Intent\(this, MainActivity\.class\)/, 'media notification must not deliver a new Intent directly to the live Capacitor activity');

// V15.1.16: every Media3 snapshot read must obey ExoPlayer's application looper.
assert.match(service, /Looper\.myLooper\(\) == Looper\.getMainLooper\(\)/, 'getSnapshot must read the player directly only on the main looper');
assert.match(service, /mainHandler\.post\(\(\) ->/, 'off-main snapshot reads must marshal to the service main handler');
assert.match(service, /result\.set\(service\.snapshot\(\)\)/, 'main-handler snapshot task must perform the player read');
assert.match(service, /latch\.await\(1500L, java\.util\.concurrent\.TimeUnit\.MILLISECONDS\)/, 'off-main getSnapshot must wait only for the bounded main-thread read');
assert.match(service, /private static Snapshot emptySnapshot\(\)/, 'snapshot timeout/service-loss needs a no-player fallback');

assert.match(main, /function recentScheduleEvents\(days = 30/, 'Schedule must expose the website-style recent 30-day lecture section');
assert.match(main, /openSecureFile\(/, 'paid PDF viewing must use the Android secure-file bridge');
assert.match(main, /function paidPlaySessionKey\(/, 'paid playback must support short-lived app prefetch');
assert.match(main, /data-paid-image-open/, 'paid album art needs a large-view action');
assert.match(main, /adminDropboxAdsHtml/, 'Admin must expose Dropbox Ads beside Schedule Review');
const downloader = read('android/app/src/main/java/org/irgunshiuraitorah/app/IrgunDownloaderPlugin.java');
assert.match(downloader, /public void openSecureFile\(PluginCall call\)/, 'Android downloader must open protected PDF files');
assert.match(downloader, /Authorization.*Bearer/, 'secure PDF requests must keep account authorization');
const i18n = read('public/i18n.js');
assert.doesNotMatch(i18n, /ENGLISH_ONLY_UI|keepEnglishUi/, 'Hebrew mode must not suppress translation of requested UI labels');
assert.match(i18n, /"Library": "ספרייה"/, 'Library must translate in Hebrew mode');
assert.match(i18n, /"Account": "חשבון"/, 'Account must translate in Hebrew mode');
assert.match(i18n, /"Filters": "מסננים"/, 'Filters must translate in Hebrew mode');
assert.match(i18n, /"Most Watched This Week": "הנצפים ביותר השבוע"/, 'Most Watched This Week must translate');
assert.match(i18n, /"Most Watched This Month": "הנצפים ביותר החודש"/, 'Most Watched This Month must translate');
assert.match(i18n, /"Most Watched All Time": "הנצפים ביותר בכל הזמנים"/, 'Most Watched All Time must translate');
assert.match(i18n, /"Following Notifications": "התראות על מעקבים"/, 'Following Notifications must translate');
assert.match(i18n, /"Receive a push notification on this app\.": "קבלו התראת דחיפה באפליקציה הזו\."/, 'app push helper must translate');
assert.match(i18n, /"Send an email when a new shiur matches one of your follows\.":/, 'follow email helper must translate');
assert.match(i18n, /"Listen to collections owned by this account\.":/, 'purchased collections helper must translate');
assert.match(i18n, /"You are not following any speakers or topics yet\.":/, 'no-follows helper must translate');
assert.match(i18n, /"The player appears automatically around scheduled Boro Park and Flatbush shiurim\. Direct access is always available below\.":/, 'live helper must translate');
assert.match(i18n, /"Manage your Irgun Shiurai Torah account\.":/, 'account helper must translate');
assert.match(i18n, /"← Back to Live": "חזרה לשידור חי"/, 'Back to Live must translate');
assert.match(main, /function warmNativePaidCatalog\(\)/, 'native sign-in should warm the paid catalog before Purchased is opened');
assert.match(main, /loadPaidCatalog\(false, \{ silent:true \}\)/, 'native paid catalog warming must stay app-only/background');
assert.doesNotMatch(main, /if \(state\.librarySection === 'purchased'\) state\.paidLoaded = false;/, 'opening Purchased must not discard the warmed catalog');
assert.match(downloader, /FileProvider\.getUriForFile/, 'secure paid PDFs must be exposed only through a temporary FileProvider URI');
assert.match(main, /data-paid-image-open[^\n]*>View<\/button>/, 'paid album image action must be labeled View');
assert.doesNotMatch(main, /data-paid-image-open[^\n]*>View larger<\/button>/, 'old View larger label must be removed');
assert.match(i18n, /"View": "צפייה"/, 'View must translate in Hebrew mode');
assert.match(i18n, /"Recent Lectures": "שיעורים אחרונים"/, 'Recent Lectures must translate');
assert.match(i18n, /"Sort": "מיון"/, 'Sort must translate');
assert.match(i18n, /"Purchase": "רכישה"/, 'Purchase must translate');
assert.match(i18n, /"Email Notifications": "התראות באימייל"/, 'Email Notifications must translate');
assert.match(i18n, /"Please wait\.\.\.": "נא להמתין\.\.\."/, 'auth busy text must translate');
assert.match(i18n, /"Preparing secure playback\.\.\.":/, 'paid playback status must translate');
assert.match(i18n, /"PDF could not be opened\.":/, 'paid PDF errors must translate');
assert.match(i18n, /"Open Full Page ↗":/, 'donation provider action must translate');
assert.match(i18n, /"Previous picture":/, 'album viewer previous control must translate');
assert.match(i18n, /"Next picture":/, 'album viewer next control must translate');
assert.match(plugin, /"AUDIO"\.equals\(s\.mode\) && \(s\.isPlaying \|\| s\.audioPlayWhenReady\)/, 'AUDIO ticker must continue during seamless VIDEO -> AUDIO when playWhenReady is already true');
assert.match(plugin, /"AUDIO"\.equals\(snapshot\.mode\) && \(snapshot\.isPlaying \|\| snapshot\.audioPlayWhenReady\)/, 'state snapshots must restart the AUDIO UI ticker from play intent');
assert.match(plugin, /event\.put\("audioPlayWhenReady", snapshot\.audioPlayWhenReady\)/, 'position events must carry native play intent to the app UI');
assert.match(main, /Boolean\(state\.nativePlayback\?\.isPlaying\) \|\| Boolean\(state\.nativePlayback\?\.audioPlayWhenReady\)/, 'in-app play\/pause must treat accepted native play intent as active playback');
assert.match(main, /function saveDestinationState\(kind, id\)/, 'save/playlist color must derive from both account destinations');
assert.match(main, /classList\.toggle\('playlist-saved'/, 'custom playlist membership must have its own live green state');
assert.match(main, /closePlaylistPickerInPlace\(\);[\s\S]*?refreshSaveDestinationButtons\(inferred\.kind, inferred\.id\)/, 'Save for Later must update the current watch/player button immediately');
assert.match(css, /\.watch-action\.playlist-saved[\s\S]*?#2f7d32/, 'custom-playlist watch state must be green');
assert.doesNotMatch(main, /nativeAudioUiWatchdog|lastNativePositionEventAt|startNativeAudioUiWatchdog/, 'watch page must not poll native state or refresh every second');
assert.doesNotMatch(main, /PlaybackController\.pullNativeAudioUiSnapshot\(id\)/, 'VIDEO -> AUDIO handoff must not force repeating/route-level getState refreshes');
assert.match(plugin, /public void startAudioAt\(PluginCall call\) \{[\s\S]*?appForeground = true;[\s\S]*?bridgeReadyForEvents = true;/, 'an inbound AUDIO start must reopen the live Capacitor event gate');
assert.match(plugin, /call\.resolve\(stateObject\(snapshot\)\);[\s\S]*?MAIN\.post\(\(\) -> notifyState\(snapshot\)\);/, 'confirmed AUDIO authority must publish one native state and start the ticker after resolving the bridge call');
assert.match(main, /const alreadySaved = playlist\.items\.some[\s\S]*?\/custom-playlists\/remove[\s\S]*?\/custom-playlists\/add/, 'custom playlist destination must toggle add/remove like Save for Later');
assert.match(main, /await this\.init\(\);[\s\S]*?nativeMediaPlugin\(\)\.startAudioAt/, 'native listener installation must be guaranteed before AUDIO start');
console.log('V15.1.22 playlist toggle + native VIDEO-to-AUDIO bridge ticker assertions passed.');
