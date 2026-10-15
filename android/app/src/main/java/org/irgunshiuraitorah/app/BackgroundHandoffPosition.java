package org.irgunshiuraitorah.app;

/**
 * Picks a coherent Home/lock-screen playback timestamp without rewinding an
 * already-buffered, advancing Media3 shadow to a stale WebView timeupdate.
 *
 * Use the native clock only when it is actually playing and no more than a
 * short decoder/event reporting delay ahead of the most recent WebView clock.
 * A large offset could instead mean an unrelated seek/lecture and must never
 * be silently accepted.
 */
final class BackgroundHandoffPosition {
    private BackgroundHandoffPosition() {}

    static long choose(long lastWebViewPositionMs, long media3PositionMs,
            boolean media3ReadyAndPlaying, float speed) {
        long video = Math.max(0L, lastWebViewPositionMs);
        long nativeClock = Math.max(0L, media3PositionMs);
        long allowedAdvanceMs = Math.round(2500f * Math.max(1f, Math.min(4f, speed)));
        if (media3ReadyAndPlaying && nativeClock >= video &&
                nativeClock <= video + allowedAdvanceMs) return nativeClock;
        return video;
    }
}
