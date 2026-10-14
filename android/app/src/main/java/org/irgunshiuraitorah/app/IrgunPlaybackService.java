package org.irgunshiuraitorah.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.CommandButton;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * V15.1.5 unified playback owner with registered MediaSessionService notification and safe foreground restore.
 *
 * There is exactly one native player for the active lecture: this service's
 * Media3 ExoPlayer. In-app audio, background audio, notification, lock-screen
 * and Bluetooth controls all operate on this same instance.
 *
 * Vimeo remains the video renderer for now. While Vimeo is authoritative the
 * service stores the logical video clock and keeps the corresponding audio item
 * prepared. A mode handoff changes which engine is authoritative without
 * creating a second native player.
 */
@UnstableApi
public class IrgunPlaybackService extends MediaSessionService {
    private static final String TAG = "IrgunPlayback";
    public static final long SEEK_INCREMENT_MS = 15_000L;
    private static final long DRIFT_LIMIT_MS = 750L;
    private static final long VIDEO_SHADOW_DRIFT_LIMIT_MS = 1800L;
    private final AudioSeekGuard audioSeekGuard = new AudioSeekGuard();
    private final PlaybackAuthorityGuard authorityGuard = new PlaybackAuthorityGuard();

    public enum PlaybackMode { VIDEO, AUDIO }
    public enum PresentationMode { FULL, MINI, PIP }

    public static final class Snapshot {
        public final String lectureId;
        public final String vimeoId;
        public final String title;
        public final String speaker;
        public final String image;
        public final String mediaKind;
        public final String sourceId;
        public final String paidAudioId;
        public final String trackId;
        public final String audioUrl;
        public final String videoSource;
        public final String mode;
        public final String presentationMode;
        public final long currentPositionMs;
        public final long durationMs;
        public final boolean isPlaying;
        public final float playbackSpeed;
        public final float volume;
        public final boolean audioReady;
        public final long audioPositionMs;
        public final long audioDurationMs;
        public final boolean audioIsPlaying;
        public final boolean audioPlayWhenReady;
        public final boolean audioAuthorityCommitted;
        public final boolean networkRecoveryPending;
        public final boolean resumeVideoOnForeground;

        Snapshot(
            String lectureId,
            String vimeoId,
            String title,
            String speaker,
            String image,
            String mediaKind,
            String sourceId,
            String paidAudioId,
            String trackId,
            String audioUrl,
            String videoSource,
            PlaybackMode mode,
            PresentationMode presentationMode,
            long currentPositionMs,
            long durationMs,
            boolean isPlaying,
            float playbackSpeed,
            float volume,
            boolean audioReady,
            long audioPositionMs,
            long audioDurationMs,
            boolean audioIsPlaying,
            boolean audioPlayWhenReady,
            boolean audioAuthorityCommitted,
            boolean networkRecoveryPending,
            boolean resumeVideoOnForeground
        ) {
            this.lectureId = cleanStatic(lectureId);
            this.vimeoId = cleanStatic(vimeoId);
            this.title = cleanStatic(title);
            this.speaker = cleanStatic(speaker);
            this.image = cleanStatic(image);
            this.mediaKind = cleanStatic(mediaKind);
            this.sourceId = cleanStatic(sourceId);
            this.paidAudioId = cleanStatic(paidAudioId);
            this.trackId = cleanStatic(trackId);
            this.audioUrl = cleanStatic(audioUrl);
            this.videoSource = cleanStatic(videoSource);
            this.mode = mode == null ? PlaybackMode.AUDIO.name() : mode.name();
            this.presentationMode = presentationMode == null ? PresentationMode.FULL.name() : presentationMode.name();
            this.currentPositionMs = Math.max(0L, currentPositionMs);
            this.durationMs = Math.max(0L, durationMs);
            this.isPlaying = isPlaying;
            this.playbackSpeed = playbackSpeed > 0f ? playbackSpeed : 1f;
            this.volume = clamp01(volume);
            this.audioReady = audioReady;
            this.audioPositionMs = Math.max(0L, audioPositionMs);
            this.audioDurationMs = Math.max(0L, audioDurationMs);
            this.audioIsPlaying = audioIsPlaying;
            this.audioPlayWhenReady = audioPlayWhenReady;
            this.audioAuthorityCommitted = audioAuthorityCommitted;
            this.networkRecoveryPending = networkRecoveryPending;
            this.resumeVideoOnForeground = resumeVideoOnForeground;
        }
    }

    private static volatile IrgunPlaybackService activeInstance;
    private static final List<Runnable> pendingBridgeCommands = new ArrayList<>();

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    // Opt-in single-engine video: this SAME Media3 ExoPlayer renders HLS video
    // and continues its audio track when the picture is hidden. No second WebView
    // decoder, shadow MP3, seek chase or audio-focus ownership transfer exists.
    private boolean nativeVideoSourceActive = false;
    private boolean nativeVideoSelected = false;
    private boolean nativeVideoUsingHls = false;
    private boolean nativeVideoMp4FallbackAttempted = false;
    // A downloaded MP3 can replace HLS only when Audio is explicitly selected.
    // Keep the SAME ExoPlayer/MediaSession and restore the saved HLS source
    // at the live clock when returning to Video.
    private boolean nativeVideoOfflineAudioActive = false;
    private String nativeVideoOfflineAudioUri = "";
    private String nativeVideoNetworkAudioUrl = "";
    private String nativeVideoHlsUrl = "";
    private String nativeVideoMp4Url = "";
    private volatile long nativeVideoRenderedFrames = 0L;
    private volatile boolean nativeVideoFirstFrameRendered = false;
    private Player sessionPlayer;
    private PlaybackMode sessionPlayerMode = PlaybackMode.AUDIO;
    private MediaSession mediaSession;
    private AudioAttributes mediaAudioAttributes;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean networkRecoveryPending;
    private boolean networkRecoveryWanted;
    private long networkRecoveryPositionMs;
    private long networkRecoveryGeneration;
    private int networkRecoveryAttempts;
    private Runnable networkRecoveryRunnable;

    // One logical playback state shared by native audio and the Vimeo presentation.
    private String lectureId = "";
    private String vimeoId = "";
    private String title = "Shiur";
    private String speaker = "Irgun Shiurai Torah";
    private String image = "";
    private String mediaKind = "";
    private String sourceId = "";
    private String paidAudioId = "";
    private String trackId = "";
    private String audioUrl = "";
    private String videoSource = "";
    private PlaybackMode playbackMode = PlaybackMode.AUDIO;
    private PresentationMode presentationMode = PresentationMode.FULL;
    private long externalVideoPositionMs = 0L;
    private long externalVideoDurationMs = 0L;
    private boolean externalVideoPlaying = false;
    private int lastPlayIntentReason = Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST;
    private float logicalSpeed = 1f;
    private float logicalVolume = 1f;

    private boolean resumeVideoOnForeground = false;
    private boolean pendingBackgroundHandoff = false;
    private long pendingBackgroundPositionMs = 0L;
    private long backgroundHandoffStartedMs = 0L;
    private boolean pendingBackgroundWasPlaying = false;
    private long backgroundHandoffId = 0L;
    private boolean backgroundPauseRequested = false;
    private boolean backgroundWebViewStopped = false;

    // While Vimeo is authoritative, the same ExoPlayer mirrors its clock silently.
    // This keeps Media3's one MediaItem/session/notification alive and makes Home or
    // Video -> Audio a simple unmute/focus transfer instead of a cold network start.
    private boolean syncingVideoShadow = false;
    private long suppressVideoMirrorUntilMs = 0L;
    private long externalVideoCommandUntilMs = 0L;
    private boolean hasExternalVideoPlayCommand = false;
    private boolean externalVideoDesiredPlaying = false;
    private long externalVideoDesiredPositionMs = -1L;
    private long lastVideoShadowSeekAtMs = 0L;
    private long lastVideoNotificationRefreshAtMs = 0L;

    /**
     * MediaSession must describe the lecture the user actually hears. During VIDEO
     * playback the ExoPlayer instance is only a muted/pre-warmed MP3 shadow. Its
     * transient BUFFERING state must not turn the notification play/pause control
     * into a spinner while Vimeo is already playing normally.
     */
    private final class SessionPlayer extends ForwardingPlayer {
        SessionPlayer(Player delegate) {
            super(delegate);
        }

        private boolean logicalVideoActive() {
            return !nativeVideoSourceActive && playbackMode == PlaybackMode.VIDEO && !cleanStatic(lectureId).isEmpty();
        }

        @Override
        public int getPlaybackState() {
            return logicalVideoActive() ? Player.STATE_READY : super.getPlaybackState();
        }

        @Override
        public boolean getPlayWhenReady() {
            return logicalVideoActive() ? externalVideoPlaying : super.getPlayWhenReady();
        }

        @Override
        public int getPlaybackSuppressionReason() {
            return logicalVideoActive() ? Player.PLAYBACK_SUPPRESSION_REASON_NONE : super.getPlaybackSuppressionReason();
        }

        @Override
        public boolean isPlaying() {
            return logicalVideoActive() ? externalVideoPlaying : super.isPlaying();
        }

        @Override
        public long getCurrentPosition() {
            return logicalVideoActive() ? Math.max(0L, externalVideoPositionMs) : super.getCurrentPosition();
        }

        @Override
        public long getContentPosition() {
            return logicalVideoActive() ? Math.max(0L, externalVideoPositionMs) : super.getContentPosition();
        }

        @Override
        public long getDuration() {
            if (logicalVideoActive() && externalVideoDurationMs > 0L) return externalVideoDurationMs;
            return super.getDuration();
        }

        @Override
        public long getContentDuration() {
            if (logicalVideoActive() && externalVideoDurationMs > 0L) return externalVideoDurationMs;
            return super.getContentDuration();
        }
    }

    private void suppressVideoMirrorCallbacks() {
        // Player callbacks may be delivered just after the method that caused them
        // returns. Keep a short suppression window in addition to the synchronous guard.
        suppressVideoMirrorUntilMs = Math.max(suppressVideoMirrorUntilMs, android.os.SystemClock.elapsedRealtime() + 450L);
    }

    private boolean videoMirrorCallbackAllowed() {
        return !nativeVideoSourceActive && !syncingVideoShadow
            && !pendingBackgroundHandoff
            && android.os.SystemClock.elapsedRealtime() > suppressVideoMirrorUntilMs;
    }

    private void refreshMediaNotification() {
        // This app controls the service directly through the Capacitor bridge rather
        // than through an Activity MediaController. Registering the session with the
        // service and explicitly nudging notification updates keeps Media3's own
        // foreground/media notification lifecycle active on every supported Android.
        if (mediaSession == null) return;
        try {
            if (sessionPlayerMode != playbackMode && player != null) {
                // The forwarding view changed authority while the underlying
                // engine kept playing. Rebind the logical view to the SAME
                // engine/session so controllers discard the old Play/Pause state.
                Player updated = new SessionPlayer(player);
                mediaSession.setPlayer(updated);
                sessionPlayer = updated;
                sessionPlayerMode = playbackMode;
            }
            if (!isSessionAdded(mediaSession)) addSession(mediaSession);
            triggerNotificationUpdate();
        } catch (Throwable error) {
            Log.w(TAG, "[Playback] media notification refresh skipped", error);
        }
    }

    private void registerNetworkRecovery() {
        connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) {
                mainHandler.post(() -> {
                    if (!networkRecoveryPending || activeInstance != IrgunPlaybackService.this) return;
                    networkRecoveryAttempts = 0;
                    queueNetworkRecovery(250L);
                });
            }
        };
        try { connectivityManager.registerDefaultNetworkCallback(networkCallback); }
        catch (RuntimeException error) { Log.w(TAG, "[Playback] Network observation unavailable; bounded retries remain active", error); }
    }

    private void cancelNetworkRecovery() {
        networkRecoveryPending = false;
        networkRecoveryGeneration++;
        networkRecoveryAttempts = 0;
        if (networkRecoveryRunnable != null) mainHandler.removeCallbacks(networkRecoveryRunnable);
        networkRecoveryRunnable = null;
    }

    private boolean scheduleNetworkRecovery(int errorCode) {
        if (player == null || lectureId.isEmpty() || (!nativeVideoSourceActive && !audioUrl.startsWith("https://")) ||
            (errorCode != PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED &&
             errorCode != PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT)) return false;
        if (!networkRecoveryPending) {
            networkRecoveryPending = true;
            networkRecoveryWanted = player.getPlayWhenReady();
            networkRecoveryPositionMs = Math.max(0L, player.getCurrentPosition());
            networkRecoveryAttempts = 0;
        }
        // A transport interruption must not clear the real lecture or disable
        // native playback. Exhaustion waits for an actual network return.
        if (networkRecoveryAttempts < 3) queueNetworkRecovery(500L * (networkRecoveryAttempts + 1));
        publishNativeState();
        refreshMediaNotification();
        return true;
    }

    private void queueNetworkRecovery(long delayMs) {
        if (!networkRecoveryPending || player == null || networkRecoveryAttempts >= 3) return;
        if (networkRecoveryRunnable != null) mainHandler.removeCallbacks(networkRecoveryRunnable);
        final long generation = ++networkRecoveryGeneration;
        final ExoPlayer engine = player;
        final String source = audioUrl;
        final String lecture = lectureId;
        networkRecoveryRunnable = () -> {
            if (!networkRecoveryPending || generation != networkRecoveryGeneration || player != engine ||
                !lecture.equals(lectureId) || !source.equals(audioUrl)) return;
            networkRecoveryRunnable = null;
            networkRecoveryAttempts++;
            long position = !nativeVideoSourceActive && playbackMode == PlaybackMode.VIDEO ? externalVideoPositionMs : networkRecoveryPositionMs;
            boolean wanted = !nativeVideoSourceActive && playbackMode == PlaybackMode.VIDEO ? externalVideoPlaying : networkRecoveryWanted;
            suppressVideoMirrorCallbacks();
            syncingVideoShadow = true;
            try {
                setCandidateAudioFocus(nativeVideoSourceActive || playbackMode == PlaybackMode.AUDIO);
                engine.setVolume(!nativeVideoSourceActive && playbackMode == PlaybackMode.VIDEO ? 0f : logicalVolume);
                engine.seekTo(Math.max(0L, position));
                engine.prepare();
                engine.setPlayWhenReady(wanted);
                Log.d(TAG, "[Playback] Real network recovery attempt " + networkRecoveryAttempts + " mode=" + playbackMode);
            } finally { syncingVideoShadow = false; }
        };
        mainHandler.postDelayed(networkRecoveryRunnable, delayMs);
    }

    @Override
    public void onCreate() {
        try {
            super.onCreate();
            IrgunAnalyticsReporter.get(this);
            
            mediaAudioAttributes = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build();
            
            player = new ExoPlayer.Builder(this)
                .setSeekBackIncrementMs(SEEK_INCREMENT_MS)
                .setSeekForwardIncrementMs(SEEK_INCREMENT_MS)
                .setAudioAttributes(mediaAudioAttributes, true)
                .setHandleAudioBecomingNoisy(true)
                .build();
            player.setWakeMode(C.WAKE_MODE_LOCAL);
            // Count actual frames submitted to the native renderer. A READY
            // player or advancing clock alone is not proof of moving picture.
            player.setVideoFrameMetadataListener((presentationTimeUs, releaseTimeNs, format, mediaFormat) -> {
                nativeVideoRenderedFrames++;
                nativeVideoFirstFrameRendered = true;
            });
            
            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int state) {
                    if (state == Player.STATE_READY) {
                        if (networkRecoveryPending && player.getPlayerError() == null) cancelNetworkRecovery();
                        if (verifyAudioSeekInternal()) return;
                        Log.d(TAG, "[Playback] Audio READY");
                        IrgunPlaybackPlugin.handleAudioReady(snapshot());
                        if (pendingBackgroundHandoff) continueBackgroundHandoffIfReady();
                    } else if (state == Player.STATE_ENDED) {
                        IrgunPlaybackPlugin.handleAudioEnded(snapshot());
                    }
                    publishNativeState();
                    refreshMediaNotification();
                }
            
                @Override
                public void onIsPlayingChanged(boolean isPlaying) {
                    if (playbackMode == PlaybackMode.AUDIO) {
                        Log.d(TAG, "[Playback] native audio playing=" + isPlaying);
                    }
                    // VIDEO play/pause intent is handled by onPlayWhenReadyChanged.
                    // isPlaying becomes false while the hidden MP3 shadow buffers,
                    // which must never be interpreted as Vimeo pausing.
                    if (isPlaying && pendingBackgroundHandoff) continueBackgroundHandoffIfReady();
                    publishNativeState();
                    refreshMediaNotification();
                }

                @Override
                public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
                    lastPlayIntentReason = reason;
                    if (networkRecoveryPending && reason == Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST) {
                        networkRecoveryWanted = playWhenReady;
                    }
                    Log.d(TAG, "[Playback] play intent=" + playWhenReady + " reason=" + reason + " mode=" + playbackMode);
                    if (playbackMode == PlaybackMode.VIDEO && videoMirrorCallbackAllowed()) {
                        // Notification/lock-screen/headset controls change the shadow
                        // player's playWhenReady. Treat that as the user's logical VIDEO
                        // intent even if the hidden MP3 is currently buffering.
                        externalVideoPlaying = playWhenReady;
                        hasExternalVideoPlayCommand = true;
                        externalVideoDesiredPlaying = playWhenReady;
                        externalVideoCommandUntilMs = android.os.SystemClock.elapsedRealtime() + 2000L;
                        IrgunPlaybackPlugin.requestVideoMediaAction(playWhenReady ? "play" : "pause", -1L);
                        publishNativeState();
                        refreshMediaNotification();
                    }
                }
            
                @Override
                public void onPositionDiscontinuity(Player.PositionInfo oldPosition, Player.PositionInfo newPosition, int reason) {
                    if (playbackMode == PlaybackMode.VIDEO && videoMirrorCallbackAllowed()) {
                        // External Media3 seek controls moved the shadow player. Move Vimeo
                        // to the exact same clock rather than letting the two sessions drift.
                        externalVideoPositionMs = Math.max(0L, newPosition.positionMs);
                        externalVideoDesiredPositionMs = externalVideoPositionMs;
                        externalVideoCommandUntilMs = android.os.SystemClock.elapsedRealtime() + 2200L;
                        IrgunPlaybackPlugin.requestVideoMediaAction("seek", externalVideoPositionMs);
                    }
                    publishNativeState();
                    if (pendingBackgroundHandoff) continueBackgroundHandoffIfReady();
                }
            
                @Override
                public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
                    refreshMediaNotification();
                    publishNativeState();
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    if (nativeVideoSourceActive) {
                        recoverNativeVideoSourceInternal(error);
                        return;
                    }
                    audioSeekGuard.clear();
                    Log.w(TAG, "[Playback] native audio error: " + error.getErrorCodeName());
                    if (scheduleNetworkRecovery(error.errorCode)) return;
                    cancelNetworkRecovery();
                    pendingBackgroundHandoff = false;
                    backgroundPauseRequested = false;
                    IrgunPlaybackPlugin.handlePlaybackError("Native audio could not be prepared.");
                }
            });
            
            // Open through the lightweight launcher instead of delivering a new
            // Intent directly to the existing singleTask BridgeActivity. If
            // MainActivity is already alive SplashActivity immediately finishes and
            // simply reveals it, avoiding Capacitor.onNewIntent during WebView resume.
            Intent openIntent = new Intent(this, SplashActivity.class);
            openIntent.putExtra(SplashActivity.EXTRA_OPEN_EXISTING_PLAYBACK, true);
            openIntent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent contentIntent = PendingIntent.getActivity(this, 9208, openIntent, pendingFlags);
            
            // Keep one stable Media3-owned playback notification. API 33+ builds
            // the visible media controls from the session itself; older Android uses
            // this provider/channel. No second app notification is created.
            setMediaNotificationProvider(
                new DefaultMediaNotificationProvider.Builder(this)
                    .setNotificationId(9209)
                    .setChannelId("irgun_playback")
                    .setChannelName(R.string.playback_notification_channel_name)
                    .build()
            );

            // ExoPlayer remains the one real native engine. MediaSession sees a
            // forwarding logical view so VIDEO reports Vimeo's READY/playing clock
            // instead of the muted MP3 shadow's buffering state.
            sessionPlayer = new SessionPlayer(player);
            MediaSession.Builder sessionBuilder = new MediaSession.Builder(this, sessionPlayer)
                .setSessionActivity(contentIntent);
            try {
                // These are presentation preferences only. If a particular Android /
                // Media3 combination rejects them, keep the core session alive and
                // let the platform show its default seek controls instead.
                CommandButton back15 = new CommandButton.Builder(CommandButton.ICON_SKIP_BACK_15)
                    .setDisplayName("Back 15 seconds")
                    .setPlayerCommand(Player.COMMAND_SEEK_BACK)
                    .setSlots(CommandButton.SLOT_BACK)
                    .build();
                CommandButton forward15 = new CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD_15)
                    .setDisplayName("Forward 15 seconds")
                    .setPlayerCommand(Player.COMMAND_SEEK_FORWARD)
                    .setSlots(CommandButton.SLOT_FORWARD)
                    .build();
                sessionBuilder.setMediaButtonPreferences(Arrays.asList(back15, forward15));
            } catch (Throwable buttonError) {
                Log.w(TAG, "[Playback] custom media buttons unavailable; using default session controls", buttonError);
            }
            mediaSession = sessionBuilder.build();
            // Normally a MediaController binding causes MediaSessionService to add
            // the returned session automatically. Irgun's Capacitor bridge controls
            // this service directly, so register it here as well. Without this the
            // player can make sound while the service has no managed session to
            // publish as a media notification/foreground playback.
            addSession(mediaSession);
            refreshMediaNotification();

            activeInstance = this;
            registerNetworkRecovery();
            Log.d(TAG, "[Playback] unified Media3 service created safely");
            drainPendingBridgeCommands();
        } catch (Throwable error) {
            // A playback-engine initialization problem must never crash the entire app.
            // Keep the UI alive and report a non-destructive playback error instead.
            Log.e(TAG, "[Playback] Media3 service initialization failed", error);
            activeInstance = null;
            clearPendingBridgeCommands();
            try { if (mediaSession != null) mediaSession.release(); } catch (Throwable ignored) {}
            mediaSession = null;
            sessionPlayer = null;
            try { if (player != null) player.release(); } catch (Throwable ignored) {}
            player = null;
            IrgunPlaybackPlugin.handleServiceInitializationFailure("Native playback could not initialize on this device.");
            try { stopSelf(); } catch (Throwable ignored) {}
        }
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public void onDestroy() {
        cancelNetworkRecovery();
        if (connectivityManager != null && networkCallback != null) {
            try { connectivityManager.unregisterNetworkCallback(networkCallback); } catch (RuntimeException ignored) {}
        }
        Log.d(TAG, "[Playback] Media3 service destroyed; mode=" + playbackMode + " lecture=" + lectureId);
        pendingBackgroundHandoff = false;
        backgroundPauseRequested = false;
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        sessionPlayer = null;
        if (player != null) {
            player.release();
            player = null;
        }
        nativeVideoSourceActive = false;
        resumeVideoOnForeground = false;
        nativeVideoSelected = false;
        if (activeInstance == this) activeInstance = null;
        super.onDestroy();
    }

    private static String cleanStatic(String value) {
        return value == null ? "" : value.trim();
    }

    private static float clamp01(float value) {
        return Math.max(0f, Math.min(1f, value));
    }

    private boolean hasPlayer() {
        return player != null;
    }

    private boolean audioReadyInternal() {
        return player != null && player.getPlaybackState() == Player.STATE_READY;
    }

    private Snapshot snapshot() {
        long position;
        long duration;
        boolean playing;
        if (playbackMode == PlaybackMode.VIDEO && nativeVideoSourceActive && player != null) {
            position = Math.max(0L, player.getCurrentPosition());
            long d = player.getDuration();
            duration = d == C.TIME_UNSET ? 0L : Math.max(0L, d);
            playing = player.isPlaying();
        } else if (playbackMode == PlaybackMode.VIDEO) {
            position = externalVideoPositionMs;
            duration = externalVideoDurationMs;
            playing = externalVideoPlaying;
        } else if (player != null) {
            position = Math.max(0L, player.getCurrentPosition());
            long d = player.getDuration();
            duration = d == C.TIME_UNSET ? 0L : Math.max(0L, d);
            playing = player.isPlaying();
        } else {
            position = 0L;
            duration = 0L;
            playing = false;
        }
        long audioPosition = 0L;
        long audioDuration = 0L;
        boolean audioPlaying = false;
        boolean audioPlayWhenReady = false;
        if (player != null) {
            audioPosition = Math.max(0L, player.getCurrentPosition());
            long ad = player.getDuration();
            audioDuration = ad == C.TIME_UNSET ? 0L : Math.max(0L, ad);
            audioPlaying = player.isPlaying();
            audioPlayWhenReady = player.getPlayWhenReady();
        }
        return new Snapshot(
            lectureId, vimeoId, title, speaker, image, mediaKind, sourceId, paidAudioId, trackId, audioUrl, videoSource,
            playbackMode, presentationMode, position, duration, playing,
            logicalSpeed, logicalVolume, audioReadyInternal(), audioPosition, audioDuration, audioPlaying, audioPlayWhenReady, authorityGuard.isAudioCommitted(), networkRecoveryPending, resumeVideoOnForeground
        );
    }

    private void publishNativeState() {
        Snapshot current = snapshot();
        IrgunPlaybackPlugin.handleNativeStateChanged(current);
        String id = cleanStatic(current.lectureId).isEmpty() ? cleanStatic(current.vimeoId) : cleanStatic(current.lectureId);
        String media = id.isEmpty() ? "none" : (PlaybackMode.VIDEO.name().equals(current.mode) ? "video" : "audio");
        IrgunAnalyticsReporter.get(this).updatePlayback(id, media, current.isPlaying);
    }

    private void setLectureInternal(
        String lectureId,
        String vimeoId,
        String title,
        String speaker,
        String image,
        String audioUrl,
        String videoSource,
        String mediaKind,
        String sourceId,
        String paidAudioId,
        String trackId,
        long startPositionMs,
        float speed,
        float volume,
        boolean prepareAudio
    ) {
        boolean sameLecture = cleanStatic(lectureId).equals(this.lectureId);
        boolean sameAudio = cleanStatic(audioUrl).equals(this.audioUrl);
        // The opt-in native Video source owns the SAME ExoPlayer. Repeated JS
        // metadata/prewarm updates must never replace its HLS MediaItem with
        // the old muted MP3 shadow; a genuinely new lecture releases the mode.
        if (nativeVideoSourceActive && sameLecture) {
            this.title = cleanStatic(title).isEmpty() ? this.title : cleanStatic(title);
            this.speaker = cleanStatic(speaker).isEmpty() ? this.speaker : cleanStatic(speaker);
            this.image = cleanStatic(image);
            if (!nativeVideoOfflineAudioActive && !cleanStatic(audioUrl).isEmpty()) {
                this.audioUrl = cleanStatic(audioUrl);
            }
            publishNativeState();
            return;
        }
        if (!sameLecture) {
            nativeVideoSourceActive = false;
            resumeVideoOnForeground = false;
            nativeVideoSelected = false;
        }
        if (!sameLecture || !sameAudio) {
            cancelNetworkRecovery();
            audioSeekGuard.clear();
            authorityGuard.allowVideo();
        }

        this.lectureId = cleanStatic(lectureId);
        this.vimeoId = cleanStatic(vimeoId);
        this.title = cleanStatic(title).isEmpty() ? "Shiur" : cleanStatic(title);
        this.speaker = cleanStatic(speaker).isEmpty() ? "Irgun Shiurai Torah" : cleanStatic(speaker);
        this.image = cleanStatic(image);
        this.mediaKind = cleanStatic(mediaKind);
        this.sourceId = cleanStatic(sourceId);
        this.paidAudioId = cleanStatic(paidAudioId);
        this.trackId = cleanStatic(trackId);
        this.audioUrl = cleanStatic(audioUrl);
        this.videoSource = cleanStatic(videoSource);
        this.logicalSpeed = speed > 0f ? speed : 1f;
        this.logicalVolume = clamp01(volume);

        if (player == null) {
            publishNativeState();
            return;
        }
        if (this.audioUrl.isEmpty()) {
            boolean guardVideo = playbackMode == PlaybackMode.VIDEO;
            if (guardVideo) { suppressVideoMirrorCallbacks(); syncingVideoShadow = true; }
            try {
                player.pause();
                player.clearMediaItems();
                setCandidateAudioFocus(false);
            } finally {
                if (guardVideo) syncingVideoShadow = false;
            }
            publishNativeState();
            return;
        }

        player.setPlaybackSpeed(this.logicalSpeed);
        if (playbackMode == PlaybackMode.VIDEO) {
            setCandidateAudioFocus(false);
            player.setVolume(0f);
        } else {
            player.setVolume(this.logicalVolume);
        }

        if (!sameLecture || !sameAudio) {
            suppressVideoMirrorCallbacks();
            syncingVideoShadow = true;
            try {
                player.pause();
                player.clearMediaItems();
            } finally {
                syncingVideoShadow = false;
            }
            Log.d(TAG, "[Playback] lecture loaded; native audio source staged");
        }

        // Loading metadata for the same source is not a seek request. A delayed
        // WebView play/prewarm event after Home can still carry its old Video
        // clock; never rewind the Audio owner to it. Explicit seeks and handoff
        // preparation use seekToInternal/prepareAudioAtInternal/startAudioAtInternal.

        // V15.1.3 accepted prepareAudio from JS but never used it. That left Vimeo
        // playback with an empty Media3 playlist, so Android had no media notification
        // and Home had to cold-load the MP3 after the WebView was already pausing.
        // Put the MediaItem in the one Media3 session immediately and prepare it muted.
        if (prepareAudio && playbackMode == PlaybackMode.VIDEO && !this.audioUrl.isEmpty()) {
            suppressVideoMirrorCallbacks();
            syncingVideoShadow = true;
            try {
                setCandidateAudioFocus(false);
                player.setVolume(0f);
                ensureAudioMediaItemInternal(Math.max(0L, startPositionMs));
                if (Math.abs(player.getCurrentPosition() - Math.max(0L, startPositionMs)) > DRIFT_LIMIT_MS) {
                    player.seekTo(Math.max(0L, startPositionMs));
                }
                if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
            } finally {
                syncingVideoShadow = false;
            }
        }
        publishNativeState();
    }

    private void ensureAudioMediaItemInternal(long positionMs) {
        if (player == null || audioUrl.isEmpty()) return;
        String mediaId = lectureId.isEmpty() ? vimeoId : lectureId;
        MediaItem current = player.getCurrentMediaItem();
        boolean needsItem = current == null || !cleanStatic(current.mediaId).equals(cleanStatic(mediaId));
        if (!needsItem) return;

        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(speaker)
            .setAlbumTitle("Irgun Shiurai Torah");
        if (!image.isEmpty()) {
            try { metadata.setArtworkUri(Uri.parse(image)); } catch (Exception ignored) {}
        }
        MediaItem mediaItem = new MediaItem.Builder()
            .setMediaId(mediaId)
            .setUri(Uri.parse(audioUrl))
            .setMediaMetadata(metadata.build())
            .build();
        player.setMediaItem(mediaItem, Math.max(0L, positionMs));
    }

    private void setCandidateAudioFocus(boolean committed) {
        if (player == null || mediaAudioAttributes == null) return;
        // A muted handoff candidate must not steal audio focus from the Vimeo
        // source before it is confirmed ready. Once committed, Media3 owns focus.
        player.setAudioAttributes(mediaAudioAttributes, committed);
    }

    private void prepareAudioAtInternal(long positionMs, float speed, float volume) {
        if (player == null || audioUrl.isEmpty()) {
            IrgunPlaybackPlugin.handlePlaybackError("This lecture has no native audio source.");
            return;
        }
        logicalSpeed = speed > 0f ? speed : logicalSpeed;
        logicalVolume = clamp01(volume);
        player.setPlaybackSpeed(logicalSpeed);
        // Destination stays silent and does not own audio focus until JS confirms
        // the transactional handoff. Suppress mirror callbacks while we align it.
        boolean guardVideo = playbackMode == PlaybackMode.VIDEO;
        if (guardVideo) { suppressVideoMirrorCallbacks(); syncingVideoShadow = true; }
        long target = Math.max(0L, positionMs);
        try {
            setCandidateAudioFocus(false);
            player.setVolume(0f);
            ensureAudioMediaItemInternal(target);
            Log.d(TAG, "[Playback] Audio preparing at " + target + "ms");
            if (Math.abs(player.getCurrentPosition() - target) > DRIFT_LIMIT_MS) player.seekTo(target);
            if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
        } finally {
            if (guardVideo) syncingVideoShadow = false;
        }
        publishNativeState();
        if (audioReadyInternal()) IrgunPlaybackPlugin.handleAudioReady(snapshot());
    }

    private void startAudioAtInternal(long positionMs, boolean shouldPlay, float speed, float volume, boolean commit) {
        audioSeekGuard.clear();
        if (player == null || audioUrl.isEmpty()) {
            IrgunPlaybackPlugin.handlePlaybackError("This lecture has no native audio source.");
            return;
        }
        logicalSpeed = speed > 0f ? speed : logicalSpeed;
        logicalVolume = clamp01(volume);
        player.setPlaybackSpeed(logicalSpeed);
        long target = Math.max(0L, positionMs);
        boolean guardVideo = playbackMode == PlaybackMode.VIDEO;
        if (guardVideo) { suppressVideoMirrorCallbacks(); syncingVideoShadow = true; }
        try {
            ensureAudioMediaItemInternal(target);
            if (Math.abs(player.getCurrentPosition() - target) > DRIFT_LIMIT_MS) player.seekTo(target);
            if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
            if (commit) {
                authorityGuard.commitAudio();
                playbackMode = PlaybackMode.AUDIO;
                externalVideoPlaying = false;
            }
            setCandidateAudioFocus(commit);
            player.setVolume(commit ? logicalVolume : 0f);
            if (shouldPlay) player.play(); else player.pause();
        } finally {
            if (guardVideo) syncingVideoShadow = false;
        }
        if (commit) Log.d(TAG, "[Playback] VIDEO -> AUDIO handoff complete at " + target + "ms");
        publishNativeState();
        refreshMediaNotification();
    }

    private void commitAudioHandoffInternal(float volume) {
        if (player == null) return;
        authorityGuard.commitAudio();
        logicalVolume = clamp01(volume);
        playbackMode = PlaybackMode.AUDIO;
        externalVideoPlaying = false;
        setCandidateAudioFocus(true);
        player.setVolume(logicalVolume);
        Log.d(TAG, "[Playback] VIDEO -> AUDIO handoff complete");
        publishNativeState();
        refreshMediaNotification();
    }

    private void setVideoStateInternal(long positionMs, long durationMs, boolean playing, float speed, float volume, boolean authoritative) {
        // A stale WebView callback must never turn native HLS back into a muted
        // shadow player, or overwrite the one authoritative Media3 clock.
        if (nativeVideoSourceActive) return;
        long incomingPositionMs = Math.max(0L, positionMs);
        long previousExternalPositionMs = Math.max(0L, externalVideoPositionMs);
        long previousExternalDurationMs = Math.max(0L, externalVideoDurationMs);
        boolean previousExternalPlaying = externalVideoPlaying;
        long nowElapsed = android.os.SystemClock.elapsedRealtime();
        boolean commandWindow = nowElapsed < externalVideoCommandUntilMs;

        if (commandWindow && hasExternalVideoPlayCommand && playing == externalVideoDesiredPlaying) {
            hasExternalVideoPlayCommand = false;
        }
        if (commandWindow && externalVideoDesiredPositionMs >= 0L && Math.abs(incomingPositionMs - externalVideoDesiredPositionMs) <= 1000L) {
            externalVideoDesiredPositionMs = -1L;
        }
        if (commandWindow && !hasExternalVideoPlayCommand && externalVideoDesiredPositionMs < 0L) {
            externalVideoCommandUntilMs = 0L;
            commandWindow = false;
        }
        if (!commandWindow) {
            hasExternalVideoPlayCommand = false;
            externalVideoDesiredPositionMs = -1L;
        }

        externalVideoPositionMs = commandWindow && externalVideoDesiredPositionMs >= 0L
            ? externalVideoDesiredPositionMs
            : incomingPositionMs;
        externalVideoDurationMs = Math.max(0L, durationMs);
        externalVideoPlaying = commandWindow && hasExternalVideoPlayCommand
            ? externalVideoDesiredPlaying
            : playing;

        if (pendingBackgroundHandoff && externalVideoPlaying) {
            // Keep chasing the live Vimeo clock while a cold destination prepares.
            pendingBackgroundPositionMs = externalVideoPositionMs;
        }
        if (speed > 0f) logicalSpeed = speed;
        logicalVolume = clamp01(volume);

        // During Home-button VIDEO -> AUDIO handoff Vimeo emits a final pause event.
        // Do not let that final callback pause the already-running native destination.
        if (pendingBackgroundHandoff) {
            publishNativeState();
            return;
        }

        if (authorityGuard.acceptsVideoUpdate(authoritative)) {
            audioSeekGuard.clear();
            playbackMode = PlaybackMode.VIDEO;
        } else if (authoritative && playbackMode == PlaybackMode.AUDIO) {
            Log.d(TAG, "[Playback] ignored delayed Video authority update after Audio committed");
        }

        if (networkRecoveryPending) {
            // Keep the actual WebView clock/authority, but do not turn every
            // timeupdate into another unbounded failing native prepare().
            publishNativeState();
            refreshMediaNotification();
            return;
        }

        // Mirror Vimeo into the ONE Media3 player silently. This intentionally keeps
        // one lightweight audio stream synchronized while video is playing. Benefits:
        // 1) the Android media notification/session exists during video playback,
        // 2) Home can continue instantly as audio, and
        // 3) Video -> Audio no longer starts a cold player.
        if (player != null && playbackMode == PlaybackMode.VIDEO && !audioUrl.isEmpty()) {
            String expectedMediaId = lectureId.isEmpty() ? vimeoId : lectureId;
            MediaItem currentItem = player.getCurrentMediaItem();
            boolean needsItem = currentItem == null || !cleanStatic(currentItem.mediaId).equals(cleanStatic(expectedMediaId));
            long shadowDriftMs = Math.abs(player.getCurrentPosition() - externalVideoPositionMs);
            boolean shadowReady = player.getPlaybackState() == Player.STATE_READY;
            boolean videoClockJumped = Math.abs(incomingPositionMs - previousExternalPositionMs) > 3500L;
            // Do not chase every Vimeo timeupdate while the MP3 shadow is BUFFERING.
            // Repeated seeks keep ExoPlayer permanently buffering: Android then shows
            // a spinning play/pause control even though the actual video is playing.
            boolean needsSeek = !needsItem && (
                (shadowReady && shadowDriftMs > VIDEO_SHADOW_DRIFT_LIMIT_MS)
                    || (videoClockJumped && shadowDriftMs > VIDEO_SHADOW_DRIFT_LIMIT_MS && nowElapsed - lastVideoShadowSeekAtMs > 500L)
            );
            boolean needsPlayToggle = player.getPlayWhenReady() != externalVideoPlaying;
            boolean mutatingPlayerState = needsItem || needsSeek || needsPlayToggle;

            if (mutatingPlayerState) {
                suppressVideoMirrorCallbacks();
                syncingVideoShadow = true;
            }
            try {
                setCandidateAudioFocus(false);
                player.setVolume(0f);
                player.setPlaybackSpeed(logicalSpeed);
                ensureAudioMediaItemInternal(externalVideoPositionMs);
                if (needsSeek) {
                    lastVideoShadowSeekAtMs = nowElapsed;
                    player.seekTo(externalVideoPositionMs);
                }
                if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
                if (needsPlayToggle) {
                    if (externalVideoPlaying) player.play(); else player.pause();
                }
            } finally {
                if (mutatingPlayerState) syncingVideoShadow = false;
            }
        }
        publishNativeState();
        boolean videoNotificationStateChanged = previousExternalPlaying != externalVideoPlaying
            || previousExternalDurationMs != externalVideoDurationMs;
        if (videoNotificationStateChanged || nowElapsed - lastVideoNotificationRefreshAtMs >= 1000L) {
            lastVideoNotificationRefreshAtMs = nowElapsed;
            refreshMediaNotification();
        }
    }

    private void switchAuthorityToVideoInternal(String requestedLectureId, long positionMs, long durationMs, boolean playing, float speed, float volume) {
        if (nativeVideoSourceActive) return;
        String requestedId = cleanStatic(requestedLectureId);
        if (!requestedId.isEmpty() && !requestedId.equals(cleanStatic(lectureId))) {
            Log.w(TAG, "[Playback] ignored stale AUDIO -> VIDEO authority request for " + requestedId + "; active=" + lectureId);
            return;
        }
        audioSeekGuard.clear();
        authorityGuard.allowVideo();
        // A foreground Audio -> Video request supersedes any delayed Home-handoff
        // timeout or confirmation still queued from the previous presentation.
        pendingBackgroundHandoff = false;
        backgroundPauseRequested = false;
        backgroundHandoffId += 1L;
        externalVideoPositionMs = Math.max(0L, positionMs);
        externalVideoDurationMs = Math.max(0L, durationMs);
        externalVideoPlaying = playing;
        if (speed > 0f) logicalSpeed = speed;
        logicalVolume = clamp01(volume);
        playbackMode = PlaybackMode.VIDEO;

        // Vimeo is already synchronized but remains muted until JS receives this authority
        // confirmation. Keep the same Media3 player as a silent synchronized shadow. This preserves the notification and makes the
        // next Audio/Home handoff immediate.
        if (player != null && !audioUrl.isEmpty()) {
            suppressVideoMirrorCallbacks();
            syncingVideoShadow = true;
            try {
                setCandidateAudioFocus(false);
                player.setVolume(0f);
                player.setPlaybackSpeed(logicalSpeed);
                ensureAudioMediaItemInternal(externalVideoPositionMs);
                if (Math.abs(player.getCurrentPosition() - externalVideoPositionMs) > DRIFT_LIMIT_MS) {
                    player.seekTo(externalVideoPositionMs);
                }
                if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
                if (playing) player.play(); else player.pause();
            } finally {
                syncingVideoShadow = false;
            }
        }
        Log.d(TAG, "[Playback] AUDIO -> VIDEO handoff complete at " + externalVideoPositionMs + "ms; Media3 shadow retained");
        publishNativeState();
        refreshMediaNotification();
    }

    private void setPresentationModeInternal(PresentationMode mode) {
        presentationMode = mode == null ? PresentationMode.FULL : mode;
        publishNativeState();
    }

    private void playInternal() {
        if ((playbackMode == PlaybackMode.AUDIO || nativeVideoSourceActive) && player != null) player.play();
    }

    private void pauseInternal() {
        if ((playbackMode == PlaybackMode.AUDIO || nativeVideoSourceActive) && player != null) player.pause();
    }

    private void seekToInternal(long positionMs) {
        long target = Math.max(0L, positionMs);
        if ((playbackMode == PlaybackMode.AUDIO || nativeVideoSourceActive) && player != null) {
            long duration = player.getDuration();
            if (duration != C.TIME_UNSET && duration > 0L) target = Math.min(target, duration);
            if (networkRecoveryPending) networkRecoveryPositionMs = target;
            audioSeekGuard.begin(target, android.os.SystemClock.elapsedRealtime());
            Log.d(TAG, "[Playback] native Audio seek requested at " + target + "ms");
            player.setVolume(logicalVolume);
            player.seekTo(target);
            // An in-buffer seek is already ready. Do not retain a target that
            // could later interfere with an unrelated network buffer.
            if (player.getPlaybackState() == Player.STATE_READY) audioSeekGuard.clear();
        } else {
            externalVideoPositionMs = target;
        }
        publishNativeState();
    }

    private boolean verifyAudioSeekInternal() {
        if (player == null || playbackMode != PlaybackMode.AUDIO || pendingBackgroundHandoff) {
            audioSeekGuard.clear();
            return false;
        }
        long target = audioSeekGuard.targetMs();
        long actual = Math.max(0L, player.getCurrentPosition());
        AudioSeekGuard.Decision decision = audioSeekGuard.verify(actual, android.os.SystemClock.elapsedRealtime());
        if (decision == AudioSeekGuard.Decision.RELOAD) {
            // The extractor can resume a re-used MP3 stream far from the seek
            // target. Recreate its source once in this same Media3 player; do
            // not compensate by lying about position or starting another player.
            MediaItem item = player.getCurrentMediaItem();
            if (item != null) {
                boolean wanted = player.getPlayWhenReady();
                Log.w(TAG, "[Playback] Audio seek resumed at " + actual + "ms instead of " + target + "ms; reloading source once");
                player.setVolume(0f);
                player.setMediaItem(item, target);
                player.prepare();
                player.setPlayWhenReady(wanted);
                return true;
            }
            audioSeekGuard.clear();
            decision = AudioSeekGuard.Decision.FAIL;
        }
        if (decision == AudioSeekGuard.Decision.FAIL) {
            player.pause();
            player.setVolume(logicalVolume);
            Log.w(TAG, "[Playback] Audio source could not reach requested seek position");
            IrgunPlaybackPlugin.handlePlaybackError("Audio could not reach the requested position. Please try again.");
        } else if (decision == AudioSeekGuard.Decision.ACCEPT) {
            player.setVolume(logicalVolume);
            Log.d(TAG, "[Playback] native Audio seek verified at " + actual + "ms");
        }
        return false;
    }

    private void seekByInternal(long deltaMs) {
        seekToInternal(snapshot().currentPositionMs + deltaMs);
    }

    private void setSpeedInternal(float speed) {
        if (!(speed > 0f)) return;
        logicalSpeed = speed;
        if (player != null) player.setPlaybackSpeed(speed);
        publishNativeState();
    }

    private void setVolumeInternal(float volume) {
        logicalVolume = clamp01(volume);
        if (player != null && playbackMode == PlaybackMode.AUDIO) player.setVolume(logicalVolume);
        publishNativeState();
    }

    private void stopAudioInternal(boolean clearLecture) {
        cancelNetworkRecovery();
        audioSeekGuard.clear();
        authorityGuard.commitAudio();
        pendingBackgroundHandoff = false;
        backgroundPauseRequested = false;
        if (player != null) {
            boolean guardVideo = playbackMode == PlaybackMode.VIDEO;
            if (guardVideo) { suppressVideoMirrorCallbacks(); syncingVideoShadow = true; }
            try {
                player.pause();
                setCandidateAudioFocus(false);
                if (clearLecture) player.clearMediaItems();
            } finally {
                if (guardVideo) syncingVideoShadow = false;
            }
        }
        if (clearLecture) {
            // A fallback/closed player must not leave a ghost lecture in the native
            // MediaSession. Clear both the source and all presentation metadata so
            // Android cannot keep showing stale controls for a lecture that ended.
            lectureId = "";
            vimeoId = "";
            title = "Shiur";
            speaker = "Irgun Shiurai Torah";
            image = "";
            mediaKind = "";
            sourceId = "";
            paidAudioId = "";
            trackId = "";
            audioUrl = "";
            videoSource = "";
            playbackMode = PlaybackMode.AUDIO;
            presentationMode = PresentationMode.FULL;
            externalVideoPositionMs = 0L;
            externalVideoDurationMs = 0L;
            externalVideoPlaying = false;
        }
        publishNativeState();
        refreshMediaNotification();
    }

    private void beginBackgroundVideoHandoffInternal() {
        if (nativeVideoSourceActive) {
            if (nativeVideoSelected) {
                resumeVideoOnForeground = true;
                switchNativeVideoPresentationInternal(false);
            }
            return;
        }
        if (pendingBackgroundHandoff) return;
        if (playbackMode != PlaybackMode.VIDEO || player == null || audioUrl.isEmpty()
                || (!externalVideoPlaying && !player.getPlayWhenReady())) return;
        pendingBackgroundHandoff = true;
        backgroundPauseRequested = false;
        backgroundWebViewStopped = false;
        backgroundHandoffId += 1L;
        // Real API-35 evidence: WebView's last VIDEO timeupdate was 746844ms,
        // but its already-decoding, advancing native shadow was 748605ms.
        // Seeking the native source BACK to the stale WebView timestamp here
        // caused a visible ~1.5 second rewind and disturbed audio focus.
        // Use the native clock ONLY if it is ready, genuinely playing, and
        // within a short bounded event-delivery delay of the Video clock.
        pendingBackgroundPositionMs = BackgroundHandoffPosition.choose(
            externalVideoPositionMs, player.getCurrentPosition(),
            player.getPlaybackState() == Player.STATE_READY && player.isPlaying(),
            logicalSpeed);
        backgroundHandoffStartedMs = android.os.SystemClock.elapsedRealtime();
        pendingBackgroundWasPlaying = externalVideoPlaying || player.getPlayWhenReady();
        Log.d(TAG, "[Playback] Home VIDEO -> AUDIO requested at " + pendingBackgroundPositionMs + "ms");

        // Normally the shadow player is already READY, muted and advancing at Vimeo's
        // clock. Keep a cold-start fallback for unusual cases (fresh process/network).
        suppressVideoMirrorCallbacks();
        syncingVideoShadow = true;
        try {
            setCandidateAudioFocus(false);
            player.setVolume(0f);
            player.setPlaybackSpeed(logicalSpeed);
            ensureAudioMediaItemInternal(pendingBackgroundPositionMs);
            if (Math.abs(player.getCurrentPosition() - pendingBackgroundPositionMs) > DRIFT_LIMIT_MS) {
                player.seekTo(pendingBackgroundPositionMs);
            }
            if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
            if (pendingBackgroundWasPlaying && !player.isPlaying()) player.play();
        } finally {
            syncingVideoShadow = false;
        }
        continueBackgroundHandoffIfReady();
    }

    private void continueBackgroundHandoffIfReady() {
        if (!pendingBackgroundHandoff || player == null || player.getPlaybackState() != Player.STATE_READY) return;
        if (pendingBackgroundWasPlaying && !player.isPlaying()) return;
        // Activity.onStop guarantees the Video surface is no longer presented.
        // Its WebView may already be suspended and unable to acknowledge the
        // queued Vimeo pause. Complete on the buffered native source now,
        // rather than waiting another 1200ms for an unreachable JS callback.
        if (backgroundWebViewStopped) {
            Log.d(TAG, "[Playback] Home Video surface stopped; buffered Audio takes ownership");
            completeBackgroundHandoffInternal();
            return;
        }
        if (backgroundPauseRequested) return;
        long position = player.getCurrentPosition();
        long elapsed = Math.max(0L, android.os.SystemClock.elapsedRealtime() - backgroundHandoffStartedMs);
        long latest = pendingBackgroundPositionMs + Math.round(elapsed * logicalSpeed);
        // A ready shadow is already advancing. Comparing it to a fixed Home
        // position repeatedly seeks backwards and delays background playback.
        if (position < pendingBackgroundPositionMs - DRIFT_LIMIT_MS || position > latest + DRIFT_LIMIT_MS) {
            player.seekTo(pendingBackgroundPositionMs);
            return;
        }
        // Source remains audible until JS reports that Vimeo itself confirmed pause.
        // A bounded fallback covers a WebView that Android freezes before it can call
        // back; at that point Vimeo is no longer able to remain an audible source.
        backgroundPauseRequested = true;
        final long requestedId = backgroundHandoffId;
        IrgunPlaybackPlugin.requestPauseVimeoForBackground(requestedId);
        mainHandler.postDelayed(() -> {
            if (!pendingBackgroundHandoff || !backgroundPauseRequested || backgroundHandoffId != requestedId) return;
            Log.w(TAG, "[Playback] Vimeo pause confirmation timed out; completing suspended-WebView handoff");
            completeBackgroundHandoffInternal();
        }, 1200L);
    }

    private void onBackgroundWebViewStoppedInternal() {
        if (!pendingBackgroundHandoff) return;
        backgroundWebViewStopped = true;
        continueBackgroundHandoffIfReady();
    }

    public static void onBackgroundWebViewStopped() {
        onMain(() -> {
            IrgunPlaybackService service = active();
            if (service != null) service.onBackgroundWebViewStoppedInternal();
        });
    }

    private void confirmBackgroundVideoPausedInternal(long handoffId, long positionMs) {
        if (!pendingBackgroundHandoff || !backgroundPauseRequested || handoffId != backgroundHandoffId) return;
        if (positionMs > 0L) {
            pendingBackgroundPositionMs = positionMs;
            if (player != null && Math.abs(player.getCurrentPosition() - positionMs) > DRIFT_LIMIT_MS) {
                player.seekTo(positionMs);
            }
        }
        Log.d(TAG, "[Playback] Vimeo pause confirmed for handoff " + handoffId);
        completeBackgroundHandoffInternal();
    }

    private void completeBackgroundHandoffInternal() {
        if (!pendingBackgroundHandoff || player == null) return;
        pendingBackgroundHandoff = false;
        backgroundPauseRequested = false;
        backgroundWebViewStopped = false;
        authorityGuard.commitAudio();
        playbackMode = PlaybackMode.AUDIO;
        externalVideoPlaying = false;
        setCandidateAudioFocus(true);
        player.setVolume(logicalVolume);
        if (pendingBackgroundWasPlaying) player.play();
        Log.d(TAG, "[Playback] Home handoff complete; same Media3 session continues");
        publishNativeState();
        refreshMediaNotification();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Swiping the app away or leaving the task must not tear down an active
        // lecture. Media3 remains the single owner until the user actually pauses/stops.
        if (snapshot().isPlaying) return;
        super.onTaskRemoved(rootIntent);
    }


    /**
     * Native-video beta: one ExoPlayer, one MediaSession, one playback clock.
     * Video and Audio presentation change only track selection, not MediaItems.
     * All access occurs on Android's application main looper.
     */
    public static final class NativeVideoInfo {
        public final boolean active;
        public final boolean videoSelected;
        public final boolean isPlaying;
        public final boolean playWhenReady;
        public final boolean firstFrame;
        public final long frameCount;
        public final long positionMs;
        public final long durationMs;
        public final long bufferedPositionMs;
        public final int width;
        public final int height;
        public final String source;
        public final String error;
        NativeVideoInfo(IrgunPlaybackService s) {
            ExoPlayer p = s == null ? null : s.player;
            active = s != null && s.nativeVideoSourceActive && p != null;
            videoSelected = active && s.nativeVideoSelected;
            isPlaying = active && p.isPlaying();
            playWhenReady = active && p.getPlayWhenReady();
            firstFrame = active && s.nativeVideoFirstFrameRendered;
            frameCount = active ? s.nativeVideoRenderedFrames : 0L;
            positionMs = active ? Math.max(0L, p.getCurrentPosition()) : 0L;
            long d = active ? p.getDuration() : 0L;
            durationMs = d == C.TIME_UNSET ? 0L : Math.max(0L, d);
            bufferedPositionMs = active ? Math.max(0L, p.getBufferedPosition()) : 0L;
            width = active ? p.getVideoSize().width : 0;
            height = active ? p.getVideoSize().height : 0;
            source = active ? (s.nativeVideoOfflineAudioActive && !s.nativeVideoSelected
                ? "offline-mp3" : s.nativeVideoUsingHls ? "hls" : "mp4") : "";
            error = active && p.getPlayerError() != null
                ? p.getPlayerError().getErrorCodeName() : "";
        }
    }

    public static NativeVideoInfo nativeVideoInfo() {
        return new NativeVideoInfo(active());
    }

    @Nullable
    public static ExoPlayer nativeVideoPlayer() {
        IrgunPlaybackService s = active();
        return s == null || !s.nativeVideoSourceActive ? null : s.player;
    }

    private void switchNativeVideoPresentationInternal(boolean showVideo) {
        switchNativeVideoPresentationInternal(showVideo, "");
    }

    private void switchNativeVideoPresentationInternal(boolean showVideo, String offlineAudioUri) {
        switchNativeVideoPresentationInternal(showVideo, offlineAudioUri, false);
    }

    private void switchNativeVideoPresentationInternal(boolean showVideo, String offlineAudioUri,
            boolean forceNetworkAudio) {
        if (!nativeVideoSourceActive || player == null) return;
        String local = showVideo ? "" : cleanStatic(offlineAudioUri);
        // Background / notification Audio mode can reassert its presentation
        // without providing a new URI. That MUST NOT discard a playing offline
        // MP3 and demand Internet. Only explicit Video or saved-file deletion
        // may restore the original network source.
        boolean restoreVideoSource = nativeVideoOfflineAudioActive && (showVideo || forceNetworkAudio);
        boolean useLocalAudio = !showVideo && !local.isEmpty()
            && (!nativeVideoOfflineAudioActive || !local.equals(nativeVideoOfflineAudioUri));
        if (restoreVideoSource || useLocalAudio) {
            // Changing the actual file source is intentional ONLY when a
            // verified offline MP3 is selected/removed. Normal Audio/Video
            // presentation stays a zero-seek video-track toggle.
            long position = Math.max(0L, player.getCurrentPosition());
            boolean playIntent = player.getPlayWhenReady();
            MediaItem source;
            if (useLocalAudio) {
                MediaMetadata metadata = new MediaMetadata.Builder()
                    .setTitle(title).setArtist(speaker)
                    .setAlbumTitle("Irgun Shiurai Torah").build();
                source = new MediaItem.Builder().setMediaId(lectureId)
                    .setUri(Uri.parse(local))
                    .setMimeType(MimeTypes.AUDIO_MPEG)
                    .setMediaMetadata(metadata).build();
                nativeVideoOfflineAudioActive = true;
                nativeVideoOfflineAudioUri = local;
                audioUrl = local;
                Log.d(TAG, "[Playback] Using verified offline MP3 for native Audio in the SAME Media3 player");
            } else {
                String url = nativeVideoUsingHls ? nativeVideoHlsUrl : nativeVideoMp4Url;
                if (url.isEmpty()) {
                    IrgunPlaybackPlugin.handlePlaybackError("Original video stream unavailable after offline Audio");
                    return;
                }
                source = nativeVideoMediaItem(url, nativeVideoUsingHls);
                nativeVideoOfflineAudioActive = false;
                nativeVideoOfflineAudioUri = "";
                audioUrl = nativeVideoNetworkAudioUrl;
                nativeVideoFirstFrameRendered = false;
                nativeVideoRenderedFrames = 0L;
                Log.d(TAG, "[Playback] Restoring Media3 " + (nativeVideoUsingHls ? "HLS" : "MP4")
                    + " at " + position + "ms after offline MP3; one ExoPlayer");
            }
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, !showVideo).build());
            player.setMediaItem(source, position);
            player.prepare();
            player.setPlayWhenReady(playIntent);
        } else {
            // No file swap when the user hasn't downloaded an offline copy.
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, !showVideo).build());
        }
        nativeVideoSelected = showVideo;
        playbackMode = showVideo ? PlaybackMode.VIDEO : PlaybackMode.AUDIO;
        if (showVideo) authorityGuard.allowVideo();
        else authorityGuard.commitAudio();
        setCandidateAudioFocus(true);
        player.setVolume(logicalVolume);
        publishNativeState();
        refreshMediaNotification();
    }

    public static void restoreNativeVideoOnForeground() {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s == null || !s.resumeVideoOnForeground) return;
            s.resumeVideoOnForeground = false;
            if (s.nativeVideoSourceActive) s.switchNativeVideoPresentationInternal(true);
        });
    }

    public static void nativeVideoPresentation(boolean showVideo) {
        nativeVideoPresentation(showVideo, "");
    }

    public static void nativeVideoPresentation(boolean showVideo, String verifiedOfflineAudioUri) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s != null) {
                s.resumeVideoOnForeground = false;
                s.switchNativeVideoPresentationInternal(showVideo, verifiedOfflineAudioUri);
            }
        });
    }

    private MediaItem nativeVideoMediaItem(String url, boolean hls) {
        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
            .setTitle(title).setArtist(speaker).setAlbumTitle("Irgun Shiurai Torah");
        if (!image.isEmpty()) {
            try { metadata.setArtworkUri(Uri.parse(image)); } catch (RuntimeException ignored) {}
        }
        MediaItem.Builder item = new MediaItem.Builder()
            .setMediaId(lectureId)
            .setUri(Uri.parse(url))
            .setMediaMetadata(metadata.build());
        if (hls) item.setMimeType(MimeTypes.APPLICATION_M3U8);
        return item.build();
    }

    private void openNativeVideoInternal(String requestedId, String title, String speaker,
            String image, String audioUrl, String hlsUrl, String mp4Url,
            long positionMs, float speed, boolean shouldPlay) {
        if (player == null) return;
        String id = cleanStatic(requestedId);
        String videoUrl = !cleanStatic(hlsUrl).isEmpty() ? cleanStatic(hlsUrl) : cleanStatic(mp4Url);
        if (id.isEmpty() || videoUrl.isEmpty()) {
            IrgunPlaybackPlugin.handlePlaybackError("Native video source was unavailable");
            return;
        }
        cancelNetworkRecovery();
        pendingBackgroundHandoff = false;
        backgroundPauseRequested = false;
        backgroundHandoffId++;
        audioSeekGuard.clear();
        authorityGuard.allowVideo();
        lectureId = id;
        vimeoId = id;
        this.title = cleanStatic(title).isEmpty() ? "Shiur" : cleanStatic(title);
        this.speaker = cleanStatic(speaker).isEmpty() ? "Irgun Shiurai Torah" : cleanStatic(speaker);
        this.image = cleanStatic(image);
        this.audioUrl = cleanStatic(audioUrl);
        videoSource = "native-media3";
        mediaKind = "video-audio";
        sourceId = id;
        nativeVideoHlsUrl = cleanStatic(hlsUrl);
        nativeVideoMp4Url = cleanStatic(mp4Url);
        nativeVideoUsingHls = !nativeVideoHlsUrl.isEmpty();
        nativeVideoMp4FallbackAttempted = false;
        nativeVideoOfflineAudioActive = false;
        nativeVideoOfflineAudioUri = "";
        nativeVideoNetworkAudioUrl = cleanStatic(audioUrl);
        nativeVideoRenderedFrames = 0L;
        nativeVideoFirstFrameRendered = false;
        nativeVideoSourceActive = true;
        nativeVideoSelected = true;
        logicalSpeed = speed > 0f ? speed : 1f;
        logicalVolume = 1f;
        playbackMode = PlaybackMode.VIDEO;
        externalVideoPlaying = shouldPlay;
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, false).build());
        setCandidateAudioFocus(true);
        player.setVolume(logicalVolume);
        player.setPlaybackSpeed(logicalSpeed);
        player.setMediaItem(nativeVideoMediaItem(videoUrl, nativeVideoUsingHls),
            Math.max(0L, positionMs));
        player.prepare();
        player.setPlayWhenReady(shouldPlay);
        Log.d(TAG, "[Playback] Native Media3 video " + (nativeVideoUsingHls ? "HLS" : "MP4")
            + " prepared at " + positionMs + "ms in the existing audio session");
        publishNativeState();
        refreshMediaNotification();
    }

    public static void openNativeVideo(String id, String title, String speaker, String image,
            String audioUrl, String hlsUrl, String mp4Url,
            long positionMs, float speed, boolean shouldPlay) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s != null) s.openNativeVideoInternal(id,title,speaker,image,audioUrl,
                hlsUrl,mp4Url,positionMs,speed,shouldPlay);
        });
    }

    private void recoverNativeVideoSourceInternal(PlaybackException error) {
        if (!nativeVideoSourceActive || player == null) return;
        if (nativeVideoOfflineAudioActive) {
            // A damaged local file must never trap the user in a silent Audio
            // mode. Resume the network audio track at the same logical clock
            // without creating a second engine or silently claiming offline.
            Log.w(TAG, "[Playback] Offline MP3 failed; retrying the original native stream");
            switchNativeVideoPresentationInternal(false, "", true);
            return;
        }
        // A temporary connection loss retries the SAME MediaItem. Replacing
        // adaptive HLS with a large MP4 during a timeout made recovery slower
        // and discarded the native timeline before the connection returned.
        if (scheduleNetworkRecovery(error.errorCode)) return;
        cancelNetworkRecovery();
        long position = Math.max(0L, player.getCurrentPosition());
        boolean intent = player.getPlayWhenReady();
        // Non-transport HLS failures may try MP4 once on this same player.
        if (nativeVideoUsingHls && !nativeVideoMp4FallbackAttempted) {
            nativeVideoMp4FallbackAttempted = true;
            if (!nativeVideoMp4Url.isEmpty()) {
                Log.w(TAG, "[Playback] Native HLS failed (" + error.getErrorCodeName()
                    + "), trying MP4 in the SAME Media3 player");
                nativeVideoUsingHls = false;
                nativeVideoRenderedFrames = 0L;
                nativeVideoFirstFrameRendered = false;
                player.setMediaItem(nativeVideoMediaItem(nativeVideoMp4Url,false),position);
                player.prepare();
                player.setPlayWhenReady(intent);
                publishNativeState();
                return;
            }
        }
        IrgunPlaybackPlugin.handlePlaybackError("Native video could not play: "
            + error.getErrorCodeName());
    }

    private void closeNativeVideoInternal(boolean keepAudio) {
        if (!nativeVideoSourceActive || player == null) return;
        if (keepAudio) {
            switchNativeVideoPresentationInternal(false);
            return;
        }
        cancelNetworkRecovery();
        player.pause();
        player.stop();
        player.clearMediaItems();
        nativeVideoSourceActive = false;
        resumeVideoOnForeground = false;
        nativeVideoSelected = false;
        nativeVideoOfflineAudioActive = false;
        nativeVideoOfflineAudioUri = "";
        nativeVideoFirstFrameRendered = false;
        playbackMode = PlaybackMode.AUDIO;
        externalVideoPlaying = false;
        publishNativeState();
        refreshMediaNotification();
    }

    public static void closeNativeVideo(boolean keepAudio) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s != null) s.closeNativeVideoInternal(keepAudio);
        });
    }

    // ---- Static bridge entry points. All operations are posted to the service main thread. ----

    private static IrgunPlaybackService active() {
        return activeInstance;
    }

    public static boolean isActive() {
        return activeInstance != null;
    }

    private static void onMain(Runnable runnable) {
        if (runnable == null) return;
        IrgunPlaybackService service = active();
        if (service == null) {
            synchronized (pendingBridgeCommands) {
                // The Capacitor bridge can issue loadLecture immediately after
                // startService(). Keep the command rather than silently losing it
                // while Android is still constructing the service.
                if (pendingBridgeCommands.size() >= 32) pendingBridgeCommands.remove(0);
                pendingBridgeCommands.add(runnable);
            }
            return;
        }
        service.mainHandler.post(() -> {
            try {
                runnable.run();
            } catch (Throwable error) {
                Log.e(TAG, "[Playback] native playback operation failed", error);
                IrgunPlaybackPlugin.handlePlaybackError("Native playback failed, so the current source was kept playing.");
            }
        });
    }

    private static void clearPendingBridgeCommands() {
        synchronized (pendingBridgeCommands) {
            pendingBridgeCommands.clear();
        }
    }

    private void drainPendingBridgeCommands() {
        List<Runnable> commands;
        synchronized (pendingBridgeCommands) {
            if (pendingBridgeCommands.isEmpty()) return;
            commands = new ArrayList<>(pendingBridgeCommands);
            pendingBridgeCommands.clear();
        }
        for (Runnable command : commands) {
            mainHandler.post(() -> {
                try {
                    command.run();
                } catch (Throwable error) {
                    Log.e(TAG, "[Playback] queued native playback operation failed", error);
                    IrgunPlaybackPlugin.handlePlaybackError("Native playback failed, so the current source was kept playing.");
                }
            });
        }
    }

    private static Snapshot emptySnapshot() {
        return new Snapshot("", "", "", "", "", "", "", "", "", "", "", PlaybackMode.AUDIO, PresentationMode.FULL, 0L, 0L, false, 1f, 1f, false, 0L, 0L, false, false, false, false, false);
    }

    /**
     * Return a Media3 snapshot without ever touching ExoPlayer from a non-main thread.
     * Capacitor @PluginMethod calls run on the CapacitorPlugins HandlerThread, while
     * ExoPlayer in this service was created on Android's main looper. Media3 therefore
     * requires every player getter (position, duration, isPlaying, etc.) to run on main.
     *
     * Calls already on main are immediate. Off-main callers synchronously marshal the
     * small snapshot read to main with a short timeout so a bridge request can never
     * crash the process with "Player is accessed on the wrong thread".
     */
    public static Snapshot getSnapshot() {
        IrgunPlaybackService service = active();
        if (service == null) return emptySnapshot();

        if (Looper.myLooper() == Looper.getMainLooper()) {
            return service.snapshot();
        }

        final java.util.concurrent.atomic.AtomicReference<Snapshot> result =
            new java.util.concurrent.atomic.AtomicReference<>();
        final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);

        boolean posted = service.mainHandler.post(() -> {
            try {
                // Re-check that this is still the active service before reading player state.
                IrgunPlaybackService current = active();
                if (current == service) result.set(service.snapshot());
            } catch (Throwable error) {
                Log.e(TAG, "[Playback] snapshot read failed on main thread", error);
            } finally {
                latch.countDown();
            }
        });

        if (!posted) return emptySnapshot();

        try {
            if (!latch.await(1500L, java.util.concurrent.TimeUnit.MILLISECONDS)) {
                Log.w(TAG, "[Playback] timed out waiting for main-thread snapshot");
                return emptySnapshot();
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return emptySnapshot();
        }

        Snapshot snapshot = result.get();
        return snapshot == null ? emptySnapshot() : snapshot;
    }

    public static void setLecture(String lectureId, String vimeoId, String title, String speaker, String image, String audioUrl, String videoSource, String mediaKind, String sourceId, String paidAudioId, String trackId, long positionMs, float speed, float volume, boolean prepareAudio) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s != null) s.setLectureInternal(lectureId, vimeoId, title, speaker, image, audioUrl, videoSource, mediaKind, sourceId, paidAudioId, trackId, positionMs, speed, volume, prepareAudio);
        });
    }

    public static void prepareAudioAt(long positionMs, float speed, float volume) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s != null) s.prepareAudioAtInternal(positionMs, speed, volume);
        });
    }

    public static void startAudioAt(long positionMs, boolean shouldPlay, float speed, float volume, boolean commit) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s != null) s.startAudioAtInternal(positionMs, shouldPlay, speed, volume, commit);
        });
    }

    private boolean replaceOfflineAudioSourceInternal(String expectedFileUrl, String replacementUrl) {
        String expected = cleanStatic(expectedFileUrl);
        if (player == null || !expected.startsWith("file:") || !audioUrl.equals(expected)) return false;
        String replacement = cleanStatic(replacementUrl);
        if (!"https".equals(Uri.parse(replacement).getScheme())) {
            throw new IllegalArgumentException("Replacement audio source must use HTTPS");
        }
        if (nativeVideoSourceActive && nativeVideoOfflineAudioActive) {
            nativeVideoNetworkAudioUrl = replacement;
            // Re-select the original network video with the video track OFF
            // before the file is unlinked from private Android storage.
            switchNativeVideoPresentationInternal(false, "", true);
            return true;
        }
        long position = playbackMode == PlaybackMode.VIDEO
            ? externalVideoPositionMs : player.getCurrentPosition();
        boolean wanted = playbackMode == PlaybackMode.VIDEO
            ? externalVideoPlaying : player.getPlayWhenReady();
        suppressVideoMirrorCallbacks();
        boolean previousSync = syncingVideoShadow;
        syncingVideoShadow = true;
        try {
            // Swap the URI in the existing engine before unlinking the file.
            // A later seek must never reopen a deleted offline MP3.
            audioUrl = replacement;
            player.clearMediaItems();
            setCandidateAudioFocus(playbackMode == PlaybackMode.AUDIO);
            player.setVolume(playbackMode == PlaybackMode.VIDEO ? 0f : logicalVolume);
            ensureAudioMediaItemInternal(Math.max(0L, position));
            player.prepare();
            player.setPlayWhenReady(wanted);
        } finally {
            syncingVideoShadow = previousSync;
        }
        Log.d(TAG, "[Playback] replaced offline native source before file deletion");
        publishNativeState();
        return true;
    }

    public static boolean replaceOfflineAudioSourceNow(String expectedFileUrl, String replacementUrl) {
        if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("Audio source swap requires main thread");
        IrgunPlaybackService s = active();
        return s != null && s.replaceOfflineAudioSourceInternal(expectedFileUrl, replacementUrl);
    }

    private void restoreAudioAfterVideoTeardownInternal(String expectedLectureId) {
        String expected = cleanStatic(expectedLectureId);
        if (player == null || playbackMode != PlaybackMode.AUDIO ||
            !lectureId.equals(expected) || expected.isEmpty() ||
            player.getPlayWhenReady() ||
            lastPlayIntentReason != Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS) return;
        // Only repair a focus-loss stop in the same source during WebView
        // teardown. User/notification Pause and different lectures stay paused.
        Log.d(TAG, "[Playback] restoring native Audio focus after parked Video teardown");
        player.play();
    }

    public static void restoreAudioAfterVideoTeardown(String expectedLectureId) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s != null) s.restoreAudioAfterVideoTeardownInternal(expectedLectureId);
        });
    }

    public static void commitAudioHandoff(float volume) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s != null) s.commitAudioHandoffInternal(volume);
        });
    }

    public static void setVideoState(long positionMs, long durationMs, boolean playing, float speed, float volume, boolean authoritative) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s != null) s.setVideoStateInternal(positionMs, durationMs, playing, speed, volume, authoritative);
        });
    }

    public static void switchAuthorityToVideo(String lectureId, long positionMs, long durationMs, boolean playing, float speed, float volume) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s != null) s.switchAuthorityToVideoInternal(lectureId, positionMs, durationMs, playing, speed, volume);
        });
    }

    public static void setPresentationMode(String mode) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s == null) return;
            PresentationMode parsed;
            try { parsed = PresentationMode.valueOf(cleanStatic(mode).toUpperCase()); }
            catch (Exception ignored) { parsed = PresentationMode.FULL; }
            s.setPresentationModeInternal(parsed);
        });
    }

    public static void play() { onMain(() -> { IrgunPlaybackService s = active(); if (s != null) s.playInternal(); }); }
    public static void pause() { onMain(() -> { IrgunPlaybackService s = active(); if (s != null) s.pauseInternal(); }); }
    public static void seekTo(long positionMs) { onMain(() -> { IrgunPlaybackService s = active(); if (s != null) s.seekToInternal(positionMs); }); }
    public static void seekBy(long deltaMs) { onMain(() -> { IrgunPlaybackService s = active(); if (s != null) s.seekByInternal(deltaMs); }); }
    public static void setSpeed(float speed) { onMain(() -> { IrgunPlaybackService s = active(); if (s != null) s.setSpeedInternal(speed); }); }
    public static void setVolume(float volume) { onMain(() -> { IrgunPlaybackService s = active(); if (s != null) s.setVolumeInternal(volume); }); }
    public static void stopAudio(boolean clearLecture) { onMain(() -> { IrgunPlaybackService s = active(); if (s != null) s.stopAudioInternal(clearLecture); }); }
    public static void beginBackgroundVideoHandoff() { onMain(() -> { IrgunPlaybackService s = active(); if (s != null) s.beginBackgroundVideoHandoffInternal(); }); }
    public static void confirmBackgroundVideoPaused(long handoffId, long positionMs) {
        onMain(() -> {
            IrgunPlaybackService s = active();
            if (s != null) s.confirmBackgroundVideoPausedInternal(handoffId, positionMs);
        });
    }
}
