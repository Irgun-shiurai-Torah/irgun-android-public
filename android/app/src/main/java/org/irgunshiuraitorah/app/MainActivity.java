package org.irgunshiuraitorah.app;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    private static volatile boolean instanceAlive = false;
    private boolean videoFullscreen = false;
    private boolean irgunPipActive = false;
    // Unlike the provisional entry guard, this only changes after Android has
    // CONFIRMED a real pinned window. Failed entry must not reset fullscreen.
    private boolean confirmedSystemPip = false;
    private int pipEntrySerial = 0;
    private static final String PIP_TAG = "IrgunSystemPiP";
    private OnBackPressedCallback fullscreenBackCallback;
    private IrgunVideoDisplayController videoDisplay;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        instanceAlive = true;
        registerPlugin(IrgunDownloaderPlugin.class);
        registerPlugin(IrgunPushPlugin.class);
        registerPlugin(IrgunGoogleAuthPlugin.class);
        registerPlugin(IrgunFullscreenPlugin.class);
        registerPlugin(IrgunPlaybackPlugin.class);
        registerPlugin(IrgunNativeVideoPlugin.class);
        registerPlugin(IrgunPictureInPicturePlugin.class);
        registerPlugin(IrgunAnalyticsPlugin.class);
        super.onCreate(savedInstanceState);
        videoDisplay = new IrgunVideoDisplayController(this);
        fullscreenBackCallback = new OnBackPressedCallback(false) {
            @Override public void handleOnBackPressed() {
                if (!videoFullscreen) {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    return;
                }
                // DOM fullscreen does not add an Activity back-stack entry.
                // Consume Back here so Android cannot destroy the moving player.
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "Promise.resolve(window.__irgunExitNativeVideoFullscreen && window.__irgunExitNativeVideoFullscreen())" +
                        ".then(() => window.__irgunExitDocumentFullscreen && window.__irgunExitDocumentFullscreen())" +
                        ".catch(e => console.warn('Fullscreen exit failed', e));",
                        null
                    );
                }
            }
        };
        getOnBackPressedDispatcher().addCallback(this, fullscreenBackCallback);
        IrgunAnalyticsReporter.get(this).setForeground(true);
        try {
            // Media is only created after the user explicitly opens a shiur. Allow
            // Vimeo/audio to begin after async setup without Android WebView
            // requiring a second tap just because the user gesture crossed a Promise.
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
                // Keep the Vimeo/WebView surface hardware-composited across Android
                // Activity PiP resize transitions; software-layer fallback can show black.
                getBridge().getWebView().setLayerType(View.LAYER_TYPE_HARDWARE, null);
            }
        } catch (Exception ignored) {}
        restoreNormalSystemBars();
        try {
            FirebaseApp.initializeApp(this);
        } catch (Exception ignored) {
            // Push will report a normal error to the web layer instead of closing the app.
        }
    }

    /**
     * Vimeo puts its fullscreen controls at the lower-right edge. On Android tablets,
     * Samsung's navigation/task bar can sit on top of that control. While a video is
     * fullscreen, use immersive-sticky system UI so the player receives the complete
     * screen and the exit-fullscreen control stays tappable.
     */
    public void setVideoFullscreen(boolean enabled) {
        setVideoFullscreen(enabled, false);
    }

    public void setVideoFullscreen(boolean enabled, boolean fromSensor) {
        if (videoDisplay != null) videoDisplay.fullscreenChanged(enabled, fromSensor);
        videoFullscreen = enabled;
        if (fullscreenBackCallback != null) fullscreenBackCallback.setEnabled(enabled);
        if (enabled) {
            hideSystemBarsForVideo();
        } else if (!isIrgunPipVisible()) {
            restoreNormalSystemBars();
        }
    }

    public void setVideoDisplayPresentation(boolean active, boolean playing, boolean expanded, boolean nativeEngine) {
        if (videoDisplay != null) videoDisplay.presentation(active, playing, expanded, nativeEngine);
    }

    public void setNativeVideoTabletTilt(int direction) {
        // Video presentation only: no media source, MediaSession or settings
        // mutations. This is a fallback when Android locks tablet rotation.
        IrgunNativeVideoPlugin.tabletSensorTilt(direction);
    }

    public void applySensorVideoFullscreen(boolean enabled) {
        setVideoFullscreen(enabled, true);
        if (getBridge() != null && getBridge().getWebView() != null)
            getBridge().getWebView().evaluateJavascript(
                "window.__irgunSetVideoFullscreenFromRotation && window.__irgunSetVideoFullscreenFromRotation("+enabled+");", null);
    }

    private void hideSystemBarsForVideo() {
        try {
            Window window = getWindow();
            View decor = window.getDecorView();

            WindowCompat.setDecorFitsSystemWindows(window, false);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
            if (controller != null) {
                controller.hide(WindowInsetsCompat.Type.systemBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }

            // Fallback for older Android builds and Samsung variants that still rely
            // on the legacy immersive flags for hiding the navigation/task bar.
            decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            );
            window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        } catch (Exception ignored) {}
    }

    private void restoreNormalSystemBars() {
        try {
            Window window = getWindow();
            View decor = window.getDecorView();

            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            WindowCompat.setDecorFitsSystemWindows(window, true);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
            if (controller != null) {
                controller.show(WindowInsetsCompat.Type.systemBars());
                controller.setAppearanceLightStatusBars(true);
            }
            window.setStatusBarColor(Color.parseColor("#F8F9FB"));
            window.setNavigationBarColor(Color.BLACK);
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        } catch (Exception ignored) {}
    }

    /** Enter Android system Picture-in-Picture for the currently playing video. */
    public boolean enterIrgunPictureInPicture() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            explainUnavailablePip();
            return false;
        }
        if (isInPictureInPictureMode()) return true;
        final int attempt = ++pipEntrySerial;
        try {
            // Guard Home's background-Audio handoff while Android enters pinned
            // mode, but DO NOT resize/reparent the native PlayerView yet. The
            // successful onPictureInPictureModeChanged callback owns all PiP
            // presentation changes; otherwise a rejected entry breaks fullscreen.
            irgunPipActive = true;
            if (videoDisplay != null) videoDisplay.pip(true);
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(16, 9));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                builder.setSeamlessResizeEnabled(true);
            boolean entered = enterPictureInPictureMode(builder.build());
            if (!entered && isInPictureInPictureMode()) entered = true;
            if (!entered) {
                Log.w(PIP_TAG, "Android did not confirm PiP immediately; waiting for the real OS callback");
                confirmRejectedPictureInPictureAfterSettling(attempt);
            }
            return entered;
        } catch (Exception error) {
            Log.w(PIP_TAG, "Android PiP entry threw; checking for delayed OS confirmation", error);
            confirmRejectedPictureInPictureAfterSettling(attempt);
            return false;
        }
    }

    private void confirmRejectedPictureInPictureAfterSettling(int attempt) {
        // Some Samsung builds deliver the pinned-window callback shortly AFTER
        // a native enter request returns. An immediate permission AlertDialog
        // can itself end up IN the tiny PiP window, exactly like the screenshot.
        // Give Android a moment to confirm entry before showing any error.
        getWindow().getDecorView().postDelayed(() -> {
            if (attempt != pipEntrySerial || confirmedSystemPip ||
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode()) ||
                isFinishing() || isDestroyed()) return;
            rollbackRejectedPictureInPicture();
            explainUnavailablePip();
        }, 350);
    }

    private void rollbackRejectedPictureInPicture() {
        // Only provisional flags were set. In particular, DO NOT call
        // IrgunNativeVideoPlugin.systemPipChanged(false) or prepareWebForPip
        // here: neither was entered and those calls erase native fullscreen
        // or force a stale mobile viewport onto a still-running PlayerView.
        if (confirmedSystemPip || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
            && isInPictureInPictureMode())) return;
        irgunPipActive = false;
        if (videoDisplay != null) videoDisplay.pip(false);
        if (videoFullscreen) hideSystemBarsForVideo();
        else restoreNormalSystemBars();
    }

    private void explainUnavailablePip() {
        boolean supported=Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE);
        android.app.AlertDialog.Builder dialog=new android.app.AlertDialog.Builder(this)
            .setTitle("Picture-in-Picture").setNegativeButton("Close",null);
        if(supported){
            dialog.setMessage("Picture-in-Picture could not open just now. Try again from the video controls. If it keeps failing, check Picture-in-Picture permission in Android settings.")
                .setPositiveButton("Open settings",(d,which)->{
                    try {
                        startActivity(new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            android.net.Uri.parse("package:"+getPackageName())));
                    } catch(Exception ignored) {}
                });
        }else dialog.setMessage("This device does not report support for Android Picture-in-Picture. You can keep playing with the in-app Mini player or background audio.");
        dialog.show();
    }

    private boolean isIrgunPipVisible() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode()) return true;
        return irgunPipActive;
    }

    private void prepareWebForPip(boolean active) {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().evaluateJavascript(
                "window.__irgunSetSystemPip && window.__irgunSetSystemPip(" + (active ? "true" : "false") + ");",
                null
            );
        } catch (Exception ignored) {}
    }

    private void restoreWebViewportAfterPip() {
        try {
            View decor = getWindow().getDecorView();
            Runnable restore = () -> {
                try {
                    if (getBridge() == null || getBridge().getWebView() == null) return;
                    WebView webView = getBridge().getWebView();
                    ViewGroup.LayoutParams params = webView.getLayoutParams();
                    if (params != null) {
                        params.width = ViewGroup.LayoutParams.MATCH_PARENT;
                        params.height = ViewGroup.LayoutParams.MATCH_PARENT;
                        webView.setLayoutParams(params);
                    }
                    webView.setScaleX(1f);
                    webView.setScaleY(1f);
                    webView.setTranslationX(0f);
                    webView.setTranslationY(0f);
                    webView.requestLayout();
                    webView.invalidate();
                    decor.requestLayout();
                    decor.invalidate();
                    webView.evaluateJavascript(
                        "window.__irgunRestoreViewportAfterPip && window.__irgunRestoreViewportAfterPip();",
                        null
                    );
                } catch (Exception ignored) {}
            };
            decor.post(restore);
            decor.postDelayed(restore, 120);
            decor.postDelayed(restore, 360);
        } catch (Exception ignored) {}
    }

    @Override
    protected void onUserLeaveHint() {
        // Home means normal background playback, not automatic Picture-in-Picture.
        // Start the native handoff here, while the WebView is still fully alive,
        // instead of waiting for onPause(). The background player is pre-warmed, so
        // this gives it time to seek/start before Android suspends Vimeo and makes
        // the Home-button transition much closer to seamless. Explicit PiP sets the
        // PiP guard before this callback and therefore never starts background audio.
        if (!isIrgunPipVisible()) {
            IrgunPlaybackPlugin.handleAppBackgrounded();
        }
        super.onUserLeaveHint();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        final boolean wasConfirmed = confirmedSystemPip;
        confirmedSystemPip = isInPictureInPictureMode;
        irgunPipActive = isInPictureInPictureMode;
        if (videoDisplay != null) videoDisplay.pip(isInPictureInPictureMode);
        IrgunAnalyticsReporter.get(this).setPictureInPictureActive(isInPictureInPictureMode);
        if (isInPictureInPictureMode) {
            ++pipEntrySerial; // Cancel any delayed rejection after real PiP.
            // The ONLY path which converts a running native PlayerView to a
            // pinned-window presentation. Do not run this before Android enters.
            IrgunNativeVideoPlugin.systemPipChanged(true);
            prepareWebForPip(true);
        } else if (wasConfirmed) {
            // A confirmed PiP exit, not a failed attempt or a generic Activity
            // resume. Keep the same ExoPlayer and restore its in-page geometry.
            IrgunNativeVideoPlugin.systemPipChanged(false);
            videoFullscreen = false;
            if (fullscreenBackCallback != null) fullscreenBackCallback.setEnabled(false);
            restoreNormalSystemBars();
            prepareWebForPip(false);
            restoreWebViewportAfterPip();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Android can briefly re-show the navigation/task bar when the Vimeo controls
        // are tapped. Re-apply immersive mode whenever fullscreen regains focus.
        if (hasFocus && videoFullscreen && !isIrgunPipVisible()) {
            hideSystemBarsForVideo();
        }
    }

    @Override
    public void onPause() {
        if (videoDisplay != null) videoDisplay.foreground(false);
        // Stop generic Media3 -> Capacitor events as soon as the Activity pauses.
        // The explicit Home handoff is still allowed to issue its one Vimeo pause
        // command until onStop(), but ticker/state callbacks no longer race WebView
        // teardown or resume.
        IrgunPlaybackPlugin.suspendBridgeEvents();
        // onPause also fires for permission dialogs, sign-in Activities and other
        // temporary interruptions. Those are not a request to replace Vimeo with
        // background audio; the real Home gesture is handled in onUserLeaveHint().
        super.onPause();
    }

    @Override
    public void onStop() {
        IrgunPlaybackPlugin.setAppForeground(false);
        IrgunAnalyticsReporter.get(this).setForeground(false);
        // Keep lifecycle-only stops side-effect free for the same reason. Media3
        // audio already continues without intervention, while video handoff is tied
        // to the explicit user-leave callback above.
        super.onStop();
        // Unlike onPause (which also fires for dialogs), onStop confirms the
        // Video Activity is no longer visible. A pre-buffered native audio
        // shadow may now complete an already-requested Home handoff.
        IrgunPlaybackService.onBackgroundWebViewStopped();
    }

    @Override
    public void onStart() {
        super.onStart();
        // Begin fetching/decoding the video track as soon as the Activity is
        // visible. Do not wait for onResume or a later WebView state poll.
        // The service restores only a Home-backgrounded Video presentation;
        // it keeps the existing player, MediaItem, clock and Pause choice.
        IrgunPlaybackService.restoreNativeVideoOnForeground();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Mark the Activity visible, but do not push JavaScript into the WebView here.
        // Android may call onResume while Capacitor is still restoring/replacing the
        // WebView after Home or a notification tap. The live JS page proves it is
        // ready by calling IrgunPlayback.getState() from visibilitychange/init.
        IrgunPlaybackService.restoreNativeVideoOnForeground();
        IrgunPlaybackPlugin.setAppForeground(true);
        IrgunAnalyticsReporter.get(this).setForeground(true);

        boolean actuallyInPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode();
        boolean pipWasActive = confirmedSystemPip;
        if (!actuallyInPip) {
            irgunPipActive = false;
            if (pipWasActive) {
                // Rare devices resume before the PiP exit callback arrives.
                // Restore only after real confirmed PiP, never after a rejected
                // entry or a generic Home/notification/dialog transition.
                confirmedSystemPip = false;
                IrgunNativeVideoPlugin.systemPipChanged(false);
                if (videoDisplay != null) videoDisplay.pip(false);
                videoFullscreen = false;
                if (fullscreenBackCallback != null) fullscreenBackCallback.setEnabled(false);
                restoreNormalSystemBars();
                getWindow().getDecorView().post(() -> {
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || !isInPictureInPictureMode()) {
                        prepareWebForPip(false);
                        restoreWebViewportAfterPip();
                    }
                });
            } else if (videoFullscreen) {
                // A failed PiP attempt is still the original native fullscreen.
                hideSystemBarsForVideo();
            } else restoreNormalSystemBars();
        }
        if (videoDisplay != null) videoDisplay.foreground(true);
    }

    @Override
    public void onDestroy() {
        if (videoDisplay != null) videoDisplay.destroy();
        instanceAlive = false;
        IrgunPlaybackPlugin.setAppForeground(false);
        IrgunAnalyticsReporter.get(this).setForeground(false);
        super.onDestroy();
    }

    public static boolean isInstanceAlive() {
        return instanceAlive;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
