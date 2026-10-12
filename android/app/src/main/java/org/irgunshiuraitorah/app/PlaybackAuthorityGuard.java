package org.irgunshiuraitorah.app;

/** Only an explicit Video transaction may reclaim authority after Audio commits. */
final class PlaybackAuthorityGuard {
    private boolean audioCommitted;

    void commitAudio() { audioCommitted = true; }

    void allowVideo() { audioCommitted = false; }
    boolean isAudioCommitted() { return audioCommitted; }

    boolean acceptsVideoUpdate(boolean authoritative) {
        return authoritative && !audioCommitted;
    }
}
