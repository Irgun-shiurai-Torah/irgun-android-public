package org.irgunshiuraitorah.app;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.OrientationEventListener;
import android.view.Surface;
import android.view.WindowManager;

/** Window/sensor policy only. Never loads, seeks, pauses, or replaces media. */
final class IrgunVideoDisplayController {
    private final MainActivity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final VideoRotationPolicy policy = new VideoRotationPolicy();
    private final OrientationEventListener sensor;
    private boolean foreground, active, playing, expanded, nativeEngine, pip, listening, rotatedFullscreen, livePlaying;
    private int physicalAngle = -1;
    private Integer previousOrientation;
    private final boolean naturalLandscape;

    IrgunVideoDisplayController(MainActivity activity) {
        this.activity = activity;
        int rotation = activity.getWindowManager().getDefaultDisplay().getRotation();
        boolean sideways = rotation == Surface.ROTATION_90 || rotation == Surface.ROTATION_270;
        boolean landscape = activity.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        naturalLandscape = landscape != sideways;
        sensor = new OrientationEventListener(activity) {
            @Override public void onOrientationChanged(int angle) { physicalAngle = angle; }
        };
    }

    void presentation(boolean active, boolean playing, boolean expanded, boolean nativeEngine) {
        this.active = active; this.playing = playing; this.expanded = expanded; this.nativeEngine = nativeEngine;
        refresh();
    }

    void livePlayback(boolean value) { livePlaying = value; refresh(); }
    void foreground(boolean value) { foreground = value; refresh(); }
    void pip(boolean value) { pip = value; refresh(); }

    void fullscreenChanged(boolean enabled, boolean fromSensor) {
        if (!enabled && !fromSensor && rotatedFullscreen) {
            policy.manualExit();
            rotatedFullscreen = false;
            if (useFullSensorWindow()) {
                activity.setNativeVideoTabletTilt(VideoRotationPolicy.PORTRAIT);
                restoreOrientation();
            } else activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }
    }

    private final Runnable poll = this::refresh;
    private void refresh() {
        main.removeCallbacks(poll);
        boolean wantsPlayback = playing;
        if (active && nativeEngine) {
            IrgunPlaybackService.NativeVideoInfo video = IrgunPlaybackService.nativeVideoInfo();
            wantsPlayback = video.active && video.videoSelected && video.playWhenReady && video.error.isEmpty()
                && (video.durationMs <= 0 || video.positionMs < video.durationMs);
        }
        boolean keep = VideoRotationPolicy.keepAwake(foreground, active || livePlaying, wantsPlayback || livePlaying, pip);
        boolean kept = (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) != 0;
        if (keep != kept) {
            if (keep) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        boolean watch = foreground && active && expanded && !pip;
        if (watch && sensor.canDetectOrientation()) {
            if (!listening) { physicalAngle = -1; policy.reset(); sensor.enable(); listening = true; }
            int direction = policy.observe(physicalAngle, SystemClock.uptimeMillis(), naturalLandscape);
            if (direction != VideoRotationPolicy.NONE) rotate(direction);
        } else {
            if (listening) { sensor.disable(); listening = false; physicalAngle = -1; policy.reset(); }
            // PiP owns its window sizing. Do not rotate that window during entry.
            if (!pip) restoreOrientation();
            if (!active || !expanded) {
                rotatedFullscreen = false;
                if (useFullSensorWindow()) activity.setNativeVideoTabletTilt(VideoRotationPolicy.PORTRAIT);
            }
        }
        if (foreground && active) main.postDelayed(poll, 200);
    }

    private void rotate(int direction) {
        if (direction == VideoRotationPolicy.PORTRAIT && !rotatedFullscreen) return;
        // On sw600dp+ displays Android 16 can IGNORE orientation requests and
        // letterbox the Activity while the physical screen stays portrait.
        // Never fight the user's rotation lock: let the OS own tablet window
        // orientation, and rotate the ONE native PlayerView when locked.
        // Phones still honor fixed orientation for immersive Video.
        if (useFullSensorWindow()) {
            activity.setNativeVideoTabletTilt(direction);
        } else {
            if (previousOrientation == null) previousOrientation = activity.getRequestedOrientation();
            int orientation = direction == VideoRotationPolicy.PORTRAIT
                ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                : direction == VideoRotationPolicy.LANDSCAPE
                    ? ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE;
            if (activity.getRequestedOrientation() != orientation)
                activity.setRequestedOrientation(orientation);
        }
        rotatedFullscreen = direction != VideoRotationPolicy.PORTRAIT;
        activity.applySensorVideoFullscreen(rotatedFullscreen);
    }

    private boolean useFullSensorWindow() {
        return activity.getResources().getConfiguration().smallestScreenWidthDp >= 600;
    }

    private void restoreOrientation() {
        if (previousOrientation != null) {
            int original = previousOrientation; previousOrientation = null;
            activity.setRequestedOrientation(original);
        }
    }

    void destroy() {
        foreground = active = false;
        sensor.disable(); main.removeCallbacks(poll);
        activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        restoreOrientation();
    }
}
