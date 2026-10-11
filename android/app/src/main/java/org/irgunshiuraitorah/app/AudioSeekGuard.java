package org.irgunshiuraitorah.app;

/** Verifies an explicit seek after actual native buffering, never a predicted UI clock. */
final class AudioSeekGuard {
    enum Decision { NONE, ACCEPT, RELOAD, FAIL }
    private long targetMs = -1L;
    private long requestedAtMs;
    private boolean retried;

    void begin(long target, long now) {
        targetMs = Math.max(0L, target);
        requestedAtMs = now;
        retried = false;
    }

    long targetMs() { return targetMs; }

    void clear() { targetMs = -1L; }

    Decision verify(long actualMs, long now) {
        if (targetMs < 0L) return Decision.NONE;
        // A later unrelated network buffer must not replay an old seek.
        if (now - requestedAtMs > 30_000L) {
            boolean wasRetried = retried;
            clear();
            return wasRetried ? Decision.FAIL : Decision.NONE;
        }
        if (Math.abs(actualMs - targetMs) <= 4_000L) {
            clear();
            return Decision.ACCEPT;
        }
        if (retried) {
            clear();
            return Decision.FAIL;
        }
        retried = true;
        return Decision.RELOAD;
    }
}
