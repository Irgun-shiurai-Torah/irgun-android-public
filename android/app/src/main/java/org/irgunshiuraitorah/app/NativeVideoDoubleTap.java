package org.irgunshiuraitorah.app;

/** Recognition and clamping used by real native touches, independently testable. */
final class NativeVideoDoubleTap {
    private long lastTime = -1;
    private float lastX, lastY;
    private int lastSide;
    void cancel() { lastTime = -1; }
    int tap(long time, float x, float y, float width, long timeout, float slop) {
        // The center belongs to the normal Play/Pause controller.
        int side = x < width * .35f ? -1 : x > width * .65f ? 1 : 0;
        boolean twice = side != 0 && lastTime >= 0 && time > lastTime && time-lastTime <= timeout
            && side == lastSide && Math.hypot(x-lastX,y-lastY) <= slop;
        if (twice) { cancel(); return side; }
        lastTime = side == 0 ? -1 : time; lastX=x; lastY=y; lastSide=side;
        return 0;
    }
    static long seekTarget(long position, long duration, int direction) {
        long target = Math.max(0,position + (direction < 0 ? -15000L : 15000L));
        return duration > 0 ? Math.min(target,duration) : target;
    }
}
