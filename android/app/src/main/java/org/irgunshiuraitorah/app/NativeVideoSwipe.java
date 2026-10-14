package org.irgunshiuraitorah.app;

/** Direction/threshold shared by the actual native touch path and executable tests. */
final class NativeVideoSwipe {
    static boolean shouldMinimize(float dx, float dy, float density) {
        return density > 0 && dy >= 48f * density && dy > Math.abs(dx) * 1.5f;
    }
}
