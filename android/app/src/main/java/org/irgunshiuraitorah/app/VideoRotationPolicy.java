package org.irgunshiuraitorah.app;

/** Physical orientation, independent of Android's system auto-rotate preference. */
final class VideoRotationPolicy {
    static final int NONE = -1, PORTRAIT = 0, LANDSCAPE = 1, REVERSE_LANDSCAPE = 2;
    private int candidate = NONE, applied = NONE;
    private long since;
    private boolean landscapeSuppressed;

    int observe(int angle, long now, boolean naturalLandscape) {
        int next = classify(angle, naturalLandscape);
        if (next == NONE) { candidate = NONE; return NONE; }
        if (next != candidate) { candidate = next; since = now; return NONE; }
        if (now - since < 400 || next == applied) return NONE;
        applied = next;
        if (next == PORTRAIT) landscapeSuppressed = false;
        return next != PORTRAIT && landscapeSuppressed ? NONE : next;
    }

    void manualExit() { landscapeSuppressed = true; }
    void reset() { candidate = applied = NONE; landscapeSuppressed = false; }

    static int classify(int angle, boolean naturalLandscape) {
        if (angle < 0 || angle >= 360) return NONE;
        if (angle <= 25 || angle >= 335) return naturalLandscape ? LANDSCAPE : PORTRAIT;
        if (angle >= 65 && angle <= 115) return naturalLandscape ? PORTRAIT : REVERSE_LANDSCAPE;
        if (angle >= 245 && angle <= 295) return naturalLandscape ? PORTRAIT : LANDSCAPE;
        if (naturalLandscape && angle >= 155 && angle <= 205) return REVERSE_LANDSCAPE;
        return NONE;
    }

    static boolean keepAwake(boolean foreground, boolean active, boolean playing, boolean pip) {
        return foreground && active && playing && !pip;
    }
}
