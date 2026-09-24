package org.irgunshiuraitorah.app;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
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
            boolean audioPlayWhenReady
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
        }
    }

    private static volatile IrgunPlaybackService activeInstance;
    private static final List<Runnable> pendingBridgeCommands = new ArrayList<>();

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private Player sessionPlayer;
    private MediaSession mediaSession;
    private AudioAttributes mediaAudioAttributes;

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
    private float logicalSpeed = 1f;
    private float logicalVolume = 1f;

    private boolean pendingBackgroundHandoff = false;
    private long pendingBackgroundPositionMs = 0L;
    private boolean pendingBackgroundWasPlaying = false;
    private long backgroundHandoffId = 0L;
    private boolean backgroundPauseRequested = false;

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
            return playbackMode == PlaybackMode.VIDEO && !cleanStatic(lectureId).isEmpty();
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
        return !syncingVideoShadow
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
            if (!isSessionAdded(mediaSession)) addSession(mediaSession);
            triggerNotificationUpdate();
        } catch (Throwable error) {
            Log.w(TAG, "[Playback] media notification refresh skipped", error);
        }
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
            
            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int state) {
                    if (state == Player.STATE_READY) {
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
                    publishNativeState();
                    refreshMediaNotification();
                }

                @Override
                public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
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
                    Log.w(TAG, "[Playback] native audio error: " + error.getErrorCodeName());
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
        if (playbackMode == PlaybackMode.VIDEO) {
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
            logicalSpeed, logicalVolume, audioReadyInternal(), audioPosition, audioDuration, audioPlaying, audioPlayWhenReady
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
        } else if (playbackMode == PlaybackMode.AUDIO && player.getMediaItemCount() > 0 && startPositionMs > 0L && Math.abs(player.getCurrentPosition() - startPositionMs) > DRIFT_LIMIT_MS) {
            player.seekTo(startPositionMs);
        }

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

        if (authoritative) playbackMode = PlaybackMode.VIDEO;

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
        String requestedId = cleanStatic(requestedLectureId);
        if (!requestedId.isEmpty() && !requestedId.equals(cleanStatic(lectureId))) {
            Log.w(TAG, "[Playback] ignored stale AUDIO -> VIDEO authority request for " + requestedId + "; active=" + lectureId);
            return;
        }
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
        if (playbackMode == PlaybackMode.AUDIO && player != null) player.play();
    }

    private void pauseInternal() {
        if (playbackMode == PlaybackMode.AUDIO && player != null) player.pause();
    }

    private void seekToInternal(long positionMs) {
        long target = Math.max(0L, positionMs);
        if (playbackMode == PlaybackMode.AUDIO && player != null) {
            player.seekTo(target);
        } else {
            externalVideoPositionMs = target;
        }
        publishNativeState();
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
        if (pendingBackgroundHandoff) return;
        if (playbackMode != PlaybackMode.VIDEO || !externalVideoPlaying || player == null || audioUrl.isEmpty()) return;
        pendingBackgroundHandoff = true;
        backgroundPauseRequested = false;
        backgroundHandoffId += 1L;
        pendingBackgroundPositionMs = Math.max(0L, externalVideoPositionMs);
        pendingBackgroundWasPlaying = externalVideoPlaying;
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
        if (backgroundPauseRequested) return;
        if (pendingBackgroundWasPlaying && !player.isPlaying()) return;
        long drift = Math.abs(player.getCurrentPosition() - pendingBackgroundPositionMs);
        if (drift > DRIFT_LIMIT_MS) {
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
        return new Snapshot("", "", "", "", "", "", "", "", "", "", "", PlaybackMode.AUDIO, PresentationMode.FULL, 0L, 0L, false, 1f, 1f, false, 0L, 0L, false, false);
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
