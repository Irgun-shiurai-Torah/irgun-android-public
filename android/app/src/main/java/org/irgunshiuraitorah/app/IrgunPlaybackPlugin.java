package org.irgunshiuraitorah.app;

import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Capacitor bridge for the single Media3 playback service. */
@CapacitorPlugin(name = "IrgunPlayback")
public class IrgunPlaybackPlugin extends Plugin {
    private static final String TAG = "IrgunPlayback";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static IrgunPlaybackPlugin activeInstance;
    private static volatile boolean serviceRequested = false;
    // Never drive the Capacitor/WebView bridge while its Activity is backgrounded.
    // Media3 owns background playback; the WebView catches up from one snapshot on resume.
    private static volatile boolean appForeground = false;
    // onResume alone is not enough: Capacitor/WebView may still be restoring its JS
    // context. Generic native events stay fenced until MainActivity explicitly calls
    // handleAppForegrounded after the short settle window.
    private static volatile boolean bridgeReadyForEvents = false;
    private static IrgunPlaybackService.Snapshot pendingEndedSnapshot = null;
    private static String pendingPlaybackError = null;
    private long lastPositionEventAt = 0L;
    private final Runnable positionTicker = new Runnable() {
        @Override public void run() {
            IrgunPlaybackService.Snapshot s = IrgunPlaybackService.getSnapshot();
            if (appForeground && bridgeReadyForEvents && activeInstance == IrgunPlaybackPlugin.this && "AUDIO".equals(s.mode) && (s.isPlaying || s.audioPlayWhenReady)) {
                // Keep the in-app clock alive as soon as AUDIO becomes authoritative.
                // During VIDEO -> AUDIO the same ExoPlayer may already be the hidden
                // Vimeo shadow, so there may be no fresh onIsPlayingChanged callback
                // to start this ticker. playWhenReady is the durable user intent and
                // remains true while Media3 is buffering or already continuing.
                notifyPosition(s);
                MAIN.postDelayed(this, 500L);
            }
        }
    };

    @Override
    public void load() {
        activeInstance = this;
        // Do not construct Media3 during application startup. The old app did not
        // require a playback engine merely to open the home screen, and eager service
        // creation makes any device-specific Media3 problem fatal to app launch.
        // The unified service is created on the first real playback request instead.
        MAIN.removeCallbacks(positionTicker);
        Log.d(TAG, "[Playback] Capacitor bridge loaded (lazy Media3 startup)");
    }

    @Override
    protected void handleOnDestroy() {
        MAIN.removeCallbacks(positionTicker);
        if (activeInstance == this) activeInstance = null;
        super.handleOnDestroy();
    }

    /** Called by MainActivity so native playback can outlive a stopped WebView safely. */
    public static void setAppForeground(boolean foreground) {
        appForeground = foreground;
        // Never assume the Capacitor bridge is ready merely because Activity.onResume
        // has fired. MainActivity opens this second gate after its short settle delay.
        bridgeReadyForEvents = false;
        IrgunPlaybackPlugin plugin = activeInstance;
        if (plugin != null) MAIN.removeCallbacks(plugin.positionTicker);
    }

    /** Pause generic native -> WebView events without blocking the one Home handoff command. */
    public static void suspendBridgeEvents() {
        bridgeReadyForEvents = false;
        IrgunPlaybackPlugin plugin = activeInstance;
        if (plugin != null) MAIN.removeCallbacks(plugin.positionTicker);
    }

    private static void flushForegroundSnapshotAndPendingEvents() {
        IrgunPlaybackPlugin current = activeInstance;
        if (!appForeground || !bridgeReadyForEvents || current == null) return;
        IrgunPlaybackService.Snapshot snapshot = IrgunPlaybackService.getSnapshot();
        notifyState(snapshot);
        IrgunPlaybackService.Snapshot ended = pendingEndedSnapshot;
        pendingEndedSnapshot = null;
        if (ended != null) current.notifyListeners("ended", stateObject(ended));
        String error = pendingPlaybackError;
        pendingPlaybackError = null;
        if (error != null && !error.isEmpty()) {
            JSObject event = snapshot == null ? new JSObject() : stateObject(snapshot);
            event.put("message", error);
            current.notifyListeners("playbackError", event);
        }
    }

    private void ensureServiceRunning() {
        // Start Media3 only when the user actually needs playback. startService is
        // idempotent for an already-running MediaSessionService and also recreates it
        // if Android reclaimed the service later.
        serviceRequested = true;
        try {
            getContext().startService(new Intent(getContext(), IrgunPlaybackService.class));
        } catch (Throwable error) {
            serviceRequested = false;
            Log.e(TAG, "[Playback] could not start playback service", error);
            handlePlaybackError("Native playback could not start. The app can continue using the existing player.");
        }
    }

    private static double d(PluginCall call, String key, double fallback) {
        Double value = call.getDouble(key);
        return value == null ? fallback : value;
    }

    private static boolean b(PluginCall call, String key, boolean fallback) {
        Boolean value = call.getBoolean(key);
        return value == null ? fallback : value;
    }

    private static String s(PluginCall call, String key) {
        String value = call.getString(key);
        return value == null ? "" : value;
    }

    private static JSObject stateObject(IrgunPlaybackService.Snapshot s) {
        JSObject out = new JSObject();
        out.put("lectureId", s.lectureId);
        out.put("vimeoId", s.vimeoId);
        out.put("title", s.title);
        out.put("speaker", s.speaker);
        out.put("image", s.image);
        out.put("mediaKind", s.mediaKind);
        out.put("sourceId", s.sourceId);
        out.put("paidAudioId", s.paidAudioId);
        out.put("trackId", s.trackId);
        // Do not echo signed paid URLs back through state events. JS already supplied
        // the source once; keeping it native-only reduces accidental token exposure.
        out.put("hasAudioSource", s.audioUrl != null && !s.audioUrl.isEmpty());
        out.put("videoSource", s.videoSource);
        out.put("mode", s.mode);
        out.put("presentationMode", s.presentationMode);
        out.put("currentPositionMs", s.currentPositionMs);
        out.put("durationMs", s.durationMs);
        out.put("isPlaying", s.isPlaying);
        out.put("playbackSpeed", s.playbackSpeed);
        out.put("volume", s.volume);
        out.put("audioReady", s.audioReady);
        out.put("audioPositionMs", s.audioPositionMs);
        out.put("audioDurationMs", s.audioDurationMs);
        out.put("audioIsPlaying", s.audioIsPlaying);
        out.put("audioPlayWhenReady", s.audioPlayWhenReady);
        return out;
    }

    @PluginMethod
    public void loadLecture(PluginCall call) {
        ensureServiceRunning();
        long position = Math.max(0L, Math.round(d(call, "currentPositionMs", 0.0)));
        float speed = (float)Math.max(0.25, d(call, "playbackSpeed", 1.0));
        float volume = (float)Math.max(0.0, Math.min(1.0, d(call, "volume", 1.0)));
        boolean prepare = b(call, "prepareAudio", true);
        String requestedLectureId = s(call, "lectureId");
        IrgunPlaybackService.setLecture(
            requestedLectureId, s(call, "vimeoId"), s(call, "title"), s(call, "speaker"),
            s(call, "image"), s(call, "audioUrl"), s(call, "videoSource"),
            s(call, "mediaKind"), s(call, "sourceId"), s(call, "paidAudioId"), s(call, "trackId"),
            position, speed, volume, prepare
        );
        waitUntilLectureLoaded(call, requestedLectureId, System.currentTimeMillis() + 3000L);
    }

    private void waitUntilLectureLoaded(PluginCall call, String lectureId, long deadline) {
        MAIN.postDelayed(() -> {
            IrgunPlaybackService.Snapshot snapshot = IrgunPlaybackService.getSnapshot();
            if (lectureId == null || lectureId.isEmpty() || lectureId.equals(snapshot.lectureId)) {
                call.resolve(stateObject(snapshot));
                return;
            }
            if (System.currentTimeMillis() >= deadline) {
                call.reject("Playback service did not load the lecture in time");
                return;
            }
            waitUntilLectureLoaded(call, lectureId, deadline);
        }, 40L);
    }

    @PluginMethod
    public void prepareAudio(PluginCall call) {
        ensureServiceRunning();
        long position = Math.max(0L, Math.round(d(call, "positionMs", 0.0)));
        float speed = (float)Math.max(0.25, d(call, "playbackSpeed", 1.0));
        float volume = (float)Math.max(0.0, Math.min(1.0, d(call, "volume", 1.0)));
        IrgunPlaybackService.prepareAudioAt(position, speed, volume);
        waitUntilReady(call, position, System.currentTimeMillis() + 8000L);
    }

    private void waitUntilReady(PluginCall call, long target, long deadline) {
        MAIN.postDelayed(() -> {
            IrgunPlaybackService.Snapshot snapshot = IrgunPlaybackService.getSnapshot();
            if (snapshot.audioReady && Math.abs(snapshot.audioPositionMs - target) <= 750L) {
                call.resolve(stateObject(snapshot));
                return;
            }
            if (System.currentTimeMillis() >= deadline) {
                call.reject("Audio preparation timed out");
                return;
            }
            waitUntilReady(call, target, deadline);
        }, 80L);
    }

    @PluginMethod
    public void startAudioAt(PluginCall call) {
        // V15.1.22: this inbound JS -> native control call proves the current
        // Capacitor bridge is alive. Do not leave AUDIO playback running only in
        // Media3/notification while the in-app event gate remains closed.
        appForeground = true;
        bridgeReadyForEvents = true;
        ensureServiceRunning();
        long position = Math.max(0L, Math.round(d(call, "positionMs", 0.0)));
        boolean playing = b(call, "playing", true);
        float speed = (float)Math.max(0.25, d(call, "playbackSpeed", 1.0));
        float volume = (float)Math.max(0.0, Math.min(1.0, d(call, "volume", 1.0)));
        boolean commit = b(call, "commit", true);
        IrgunPlaybackService.startAudioAt(position, playing, speed, volume, commit);
        waitUntilStarted(call, position, playing, commit, System.currentTimeMillis() + 5000L);
    }

    private void waitUntilStarted(PluginCall call, long target, boolean shouldPlay, boolean committed, long deadline) {
        MAIN.postDelayed(() -> {
            IrgunPlaybackService.Snapshot snapshot = IrgunPlaybackService.getSnapshot();
            boolean positionGood = Math.abs(snapshot.audioPositionMs - target) <= 1500L;
            boolean authorityGood = !committed || "AUDIO".equals(snapshot.mode);
            // isPlaying is false while ExoPlayer is BUFFERING. playWhenReady records
            // that the user's Play request was accepted, so slow network buffering is
            // no longer misclassified as a failed start after five seconds.
            boolean playIntentGood = shouldPlay
                ? (snapshot.audioIsPlaying || snapshot.audioPlayWhenReady)
                : !snapshot.audioPlayWhenReady;
            boolean sourceGood = snapshot.audioUrl != null && !snapshot.audioUrl.isEmpty();
            // During a slow initial prepare ExoPlayer can keep reporting position 0
            // even though the MediaItem was created with the requested start
            // position. Once the service has the correct source, AUDIO authority,
            // and playWhenReady=true, buffering itself is a valid accepted start.
            boolean bufferingAccepted = shouldPlay && snapshot.audioPlayWhenReady && sourceGood && authorityGood && !snapshot.audioReady;
            if (authorityGood && playIntentGood && sourceGood && (positionGood || bufferingAccepted)) {
                call.resolve(stateObject(snapshot));
                // The same ExoPlayer may already have been playing as VIDEO's
                // hidden audio shadow, so Media3 is not guaranteed to emit a new
                // isPlaying callback when AUDIO becomes authoritative. Publish one
                // authoritative state after the bridge response; notifyState also
                // starts the native position ticker while playWhenReady is true.
                MAIN.post(() -> notifyState(snapshot));
                return;
            }
            if (System.currentTimeMillis() >= deadline) {
                call.reject("Audio start command was not accepted at the requested position");
                return;
            }
            waitUntilStarted(call, target, shouldPlay, committed, deadline);
        }, 80L);
    }

    @PluginMethod
    public void commitAudioHandoff(PluginCall call) {
        ensureServiceRunning();
        IrgunPlaybackService.commitAudioHandoff((float)Math.max(0.0, Math.min(1.0, d(call, "volume", 1.0))));
        call.resolve();
    }

    @PluginMethod public void play(PluginCall call) { ensureServiceRunning(); IrgunPlaybackService.play(); call.resolve(); }
    @PluginMethod public void pause(PluginCall call) { ensureServiceRunning(); IrgunPlaybackService.pause(); call.resolve(); }
    @PluginMethod public void seekTo(PluginCall call) { ensureServiceRunning(); IrgunPlaybackService.seekTo(Math.max(0L, Math.round(d(call, "positionMs", 0.0)))); call.resolve(); }
    @PluginMethod public void seekBy(PluginCall call) { ensureServiceRunning(); IrgunPlaybackService.seekBy(Math.round(d(call, "deltaMs", 0.0))); call.resolve(); }
    @PluginMethod public void setSpeed(PluginCall call) { ensureServiceRunning(); IrgunPlaybackService.setSpeed((float)Math.max(0.25, d(call, "rate", 1.0))); call.resolve(); }
    @PluginMethod public void setVolume(PluginCall call) { ensureServiceRunning(); IrgunPlaybackService.setVolume((float)Math.max(0.0, Math.min(1.0, d(call, "volume", 1.0)))); call.resolve(); }
    @PluginMethod public void stopAudio(PluginCall call) { ensureServiceRunning(); IrgunPlaybackService.stopAudio(b(call, "clearLecture", false)); call.resolve(); }

    @PluginMethod
    public void setVideoState(PluginCall call) {
        ensureServiceRunning();
        IrgunPlaybackService.setVideoState(
            Math.max(0L, Math.round(d(call, "positionMs", 0.0))),
            Math.max(0L, Math.round(d(call, "durationMs", 0.0))),
            b(call, "isPlaying", false),
            (float)Math.max(0.25, d(call, "playbackSpeed", 1.0)),
            (float)Math.max(0.0, Math.min(1.0, d(call, "volume", 1.0))),
            b(call, "authoritative", true)
        );
        call.resolve();
    }

    @PluginMethod
    public void switchAuthorityToVideo(PluginCall call) {
        ensureServiceRunning();
        String requestedLectureId = s(call, "lectureId");
        long position = Math.max(0L, Math.round(d(call, "positionMs", 0.0)));
        long duration = Math.max(0L, Math.round(d(call, "durationMs", 0.0)));
        boolean playing = b(call, "isPlaying", true);
        IrgunPlaybackService.switchAuthorityToVideo(
            requestedLectureId,
            position,
            duration,
            playing,
            (float)Math.max(0.25, d(call, "playbackSpeed", 1.0)),
            (float)Math.max(0.0, Math.min(1.0, d(call, "volume", 1.0)))
        );
        waitUntilVideoAuthority(call, requestedLectureId, position, playing, System.currentTimeMillis() + 3000L);
    }

    private void waitUntilVideoAuthority(PluginCall call, String lectureId, long target, boolean shouldPlay, long deadline) {
        MAIN.postDelayed(() -> {
            IrgunPlaybackService.Snapshot snapshot = IrgunPlaybackService.getSnapshot();
            boolean lectureGood = lectureId == null || lectureId.isEmpty() || lectureId.equals(snapshot.lectureId);
            boolean modeGood = "VIDEO".equals(snapshot.mode);
            boolean positionGood = Math.abs(snapshot.currentPositionMs - target) <= 1500L;
            boolean playGood = snapshot.isPlaying == shouldPlay;
            if (lectureGood && modeGood && positionGood && playGood) {
                call.resolve(stateObject(snapshot));
                return;
            }
            if (System.currentTimeMillis() >= deadline) {
                call.reject("Native playback did not confirm video authority");
                return;
            }
            waitUntilVideoAuthority(call, lectureId, target, shouldPlay, deadline);
        }, 50L);
    }

    @PluginMethod public void setPresentationMode(PluginCall call) {
        // Presentation-only UI changes (FULL/MINI/PIP) must never start a media
        // engine or risk destabilizing an otherwise healthy Vimeo session.
        if (serviceRequested || IrgunPlaybackService.isActive()) {
            IrgunPlaybackService.setPresentationMode(s(call, "mode"));
        }
        call.resolve();
    }
    @PluginMethod
    public void getState(PluginCall call) {
        // An inbound JS -> native call proves that Capacitor's CURRENT WebView/bridge
        // is alive after a Home/notification reopen. Re-open the event gate here,
        // never from Activity.onResume against a potentially stale WebView.
        appForeground = true;
        bridgeReadyForEvents = true;
        MAIN.removeCallbacks(positionTicker);

        // App startup asks for state before any lecture is open. Do not start Media3
        // just to answer that query. A blank state is the correct initial state.
        if (!serviceRequested && !IrgunPlaybackService.isActive()) {
            JSObject out = new JSObject();
            out.put("lectureId", "");
            out.put("vimeoId", "");
            out.put("title", "");
            out.put("speaker", "");
            out.put("image", "");
            out.put("mediaKind", "");
            out.put("sourceId", "");
            out.put("paidAudioId", "");
            out.put("trackId", "");
            out.put("hasAudioSource", false);
            out.put("videoSource", "");
            out.put("mode", "AUDIO");
            out.put("presentationMode", "FULL");
            out.put("currentPositionMs", 0);
            out.put("durationMs", 0);
            out.put("isPlaying", false);
            out.put("playbackSpeed", 1.0);
            out.put("volume", 1.0);
            out.put("audioReady", false);
            out.put("audioPositionMs", 0);
            out.put("audioDurationMs", 0);
            out.put("audioIsPlaying", false);
            out.put("audioPlayWhenReady", false);
            call.resolve(out);
            return;
        }
        IrgunPlaybackService.Snapshot snapshot = IrgunPlaybackService.getSnapshot();
        call.resolve(stateObject(snapshot));

        // getState crossed the live bridge successfully. Resume native events only
        // after its response has been returned to JavaScript.
        MAIN.post(() -> {
            if (!appForeground || !bridgeReadyForEvents || activeInstance != IrgunPlaybackPlugin.this) return;
            flushForegroundSnapshotAndPendingEvents();
            if ("AUDIO".equals(snapshot.mode) && (snapshot.isPlaying || snapshot.audioPlayWhenReady)) {
                MAIN.removeCallbacks(positionTicker);
                MAIN.post(positionTicker);
            }
        });
    }

    private static void notifyState(IrgunPlaybackService.Snapshot snapshot) {
        IrgunPlaybackPlugin plugin = activeInstance;
        if (plugin == null || snapshot == null) return;
        if (!appForeground || !bridgeReadyForEvents) {
            MAIN.removeCallbacks(plugin.positionTicker);
            return;
        }
        plugin.notifyListeners("stateChanged", stateObject(snapshot));
        if ("AUDIO".equals(snapshot.mode) && (snapshot.isPlaying || snapshot.audioPlayWhenReady)) {
            MAIN.removeCallbacks(plugin.positionTicker);
            MAIN.post(plugin.positionTicker);
        }
    }

    private void notifyPosition(IrgunPlaybackService.Snapshot snapshot) {
        long now = System.currentTimeMillis();
        if (now - lastPositionEventAt < 350L) return;
        lastPositionEventAt = now;
        JSObject event = new JSObject();
        event.put("lectureId", snapshot.lectureId);
        event.put("positionMs", snapshot.currentPositionMs);
        event.put("durationMs", snapshot.durationMs);
        event.put("isPlaying", snapshot.isPlaying);
        event.put("audioIsPlaying", snapshot.audioIsPlaying);
        event.put("audioPlayWhenReady", snapshot.audioPlayWhenReady);
        event.put("mode", snapshot.mode);
        notifyListeners("positionChanged", event);
    }

    static void handleNativeStateChanged(IrgunPlaybackService.Snapshot snapshot) {
        MAIN.post(() -> notifyState(snapshot));
    }

    static void handleAudioReady(IrgunPlaybackService.Snapshot snapshot) {
        IrgunPlaybackPlugin plugin = activeInstance;
        if (plugin == null || snapshot == null || !appForeground || !bridgeReadyForEvents) return;
        MAIN.post(() -> {
            if (appForeground && bridgeReadyForEvents && plugin == activeInstance) plugin.notifyListeners("audioReady", stateObject(snapshot));
        });
    }

    static void handleAudioEnded(IrgunPlaybackService.Snapshot snapshot) {
        IrgunPlaybackPlugin plugin = activeInstance;
        if (snapshot == null) return;
        if (!appForeground || !bridgeReadyForEvents || plugin == null) {
            pendingEndedSnapshot = snapshot;
            return;
        }
        MAIN.post(() -> {
            if (appForeground && bridgeReadyForEvents && plugin == activeInstance) plugin.notifyListeners("ended", stateObject(snapshot));
            else pendingEndedSnapshot = snapshot;
        });
    }

    static void handlePlaybackError(String message) {
        String safeMessage = message == null ? "Playback error" : message;
        IrgunPlaybackPlugin plugin = activeInstance;
        if (!appForeground || !bridgeReadyForEvents || plugin == null) {
            pendingPlaybackError = safeMessage;
            return;
        }
        IrgunPlaybackService.Snapshot snapshot = IrgunPlaybackService.getSnapshot();
        MAIN.post(() -> {
            if (!appForeground || !bridgeReadyForEvents || plugin != activeInstance) {
                pendingPlaybackError = safeMessage;
                return;
            }
            JSObject event = snapshot == null ? new JSObject() : stateObject(snapshot);
            event.put("message", safeMessage);
            plugin.notifyListeners("playbackError", event);
        });
    }

    static void handleServiceInitializationFailure(String message) {
        serviceRequested = false;
        handlePlaybackError(message);
    }

    /**
     * Called by the Media3 service during Home-button video -> audio handoff.
     * Vimeo is paused only after the native destination is READY at the same clock.
     */
    static void requestPauseVimeoForBackground(long handoffId) {
        IrgunPlaybackPlugin plugin = activeInstance;
        if (!appForeground || plugin == null || plugin.getActivity() == null || plugin.getBridge() == null || plugin.getBridge().getWebView() == null) {
            return;
        }
        plugin.getActivity().runOnUiThread(() -> {
            try {
                String js = "(async()=>{try{if(window.PlaybackController&&PlaybackController.pauseVideoForNativeBackground){await PlaybackController.pauseVideoForNativeBackground(" + handoffId + ");return;}if(window.__irgunPauseVimeoForNativeHandoff){await window.__irgunPauseVimeoForNativeHandoff(" + handoffId + ");}}catch(e){console.warn('[Playback] background pause confirmation failed',e);}})()";
                // evaluateJavascript completing only proves that WebView accepted the
                // script. JS calls confirmBackgroundVideoPaused after Vimeo itself
                // confirms pause; only that explicit bridge call commits the handoff.
                plugin.getBridge().getWebView().evaluateJavascript(js, null);
            } catch (Exception ignored) {}
        });
    }

    @PluginMethod
    public void confirmBackgroundVideoPaused(PluginCall call) {
        long handoffId = Math.max(0L, Math.round(d(call, "handoffId", 0.0)));
        long positionMs = Math.max(0L, Math.round(d(call, "positionMs", 0.0)));
        IrgunPlaybackService.confirmBackgroundVideoPaused(handoffId, positionMs);
        call.resolve();
    }


    /**
     * Mirror Android system media controls to Vimeo while VIDEO is authoritative.
     * The Media3 shadow player remains the one notification/session owner; this
     * bridge keeps the visible WebView source in lock-step with notification,
     * lock-screen and Bluetooth play/pause/seek commands.
     */
    static void requestVideoMediaAction(String action, long positionMs) {
        IrgunPlaybackPlugin plugin = activeInstance;
        if (!appForeground || !bridgeReadyForEvents || plugin == null || plugin.getActivity() == null || plugin.getBridge() == null || plugin.getBridge().getWebView() == null) return;
        String safeAction = action == null ? "" : action.replace("'", "");
        plugin.getActivity().runOnUiThread(() -> {
            try {
                String js;
                if ("seek".equals(safeAction) && positionMs >= 0L) {
                    double seconds = positionMs / 1000.0;
                    js = "window.__irgunNativeSeekTo&&window.__irgunNativeSeekTo(" + seconds + ");";
                } else {
                    js = "window.__irgunNativeMediaAction&&window.__irgunNativeMediaAction('" + safeAction + "');";
                }
                plugin.getBridge().getWebView().evaluateJavascript(js, null);
            } catch (Exception ignored) {}
        });
    }

    public static void handleAppBackgrounded() {
        if (!serviceRequested && !IrgunPlaybackService.isActive()) return;
        IrgunPlaybackService.Snapshot snapshot = IrgunPlaybackService.getSnapshot();
        if ("VIDEO".equals(snapshot.mode) && snapshot.isPlaying) {
            IrgunPlaybackService.beginBackgroundVideoHandoff();
        }
        // AUDIO needs no lifecycle action: the same ExoPlayer already owns playback.
    }

    public static void handleAppForegrounded() {
        if (!appForeground) return;
        IrgunPlaybackPlugin plugin = activeInstance;
        if (plugin == null || plugin.getActivity() == null || plugin.getBridge() == null || plugin.getBridge().getWebView() == null) return;
        if (plugin.getActivity().isFinishing()) return;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN_MR1 && plugin.getActivity().isDestroyed()) return;

        // This is the first point after resume at which generic native events are
        // allowed to touch Capacitor. Deliver one authoritative snapshot, then let
        // normal state/position events resume.
        bridgeReadyForEvents = true;
        flushForegroundSnapshotAndPendingEvents();

        if (!serviceRequested && !IrgunPlaybackService.isActive()) return;
        IrgunPlaybackService.Snapshot snapshot = IrgunPlaybackService.getSnapshot();
        if (!"AUDIO".equals(snapshot.mode)) return;
        plugin.getActivity().runOnUiThread(() -> {
            try {
                if (!appForeground || !bridgeReadyForEvents || plugin != activeInstance || plugin.getActivity() == null || plugin.getActivity().isFinishing()) return;
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.JELLY_BEAN_MR1 && plugin.getActivity().isDestroyed()) return;
                if (plugin.getBridge() == null || plugin.getBridge().getWebView() == null) return;
                String js = "window.PlaybackController&&PlaybackController.refreshFromNative&&PlaybackController.refreshFromNative();";
                plugin.getBridge().getWebView().evaluateJavascript(js, null);
            } catch (Throwable ignored) {}
        });
    }
}
