package org.irgunshiuraitorah.app;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
    private static volatile boolean instanceAlive = false;
    private boolean videoFullscreen = false;
    private boolean irgunPipActive = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        instanceAlive = true;
        registerPlugin(IrgunDownloaderPlugin.class);
        registerPlugin(IrgunPushPlugin.class);
        registerPlugin(IrgunGoogleAuthPlugin.class);
        registerPlugin(IrgunFullscreenPlugin.class);
        registerPlugin(IrgunPlaybackPlugin.class);
        registerPlugin(IrgunPictureInPicturePlugin.class);
        registerPlugin(IrgunAnalyticsPlugin.class);
        super.onCreate(savedInstanceState);
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
        videoFullscreen = enabled;
        if (enabled) {
            hideSystemBarsForVideo();
        } else if (!isIrgunPipVisible()) {
            restoreNormalSystemBars();
        }
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
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        try {
            // Mark PiP as active BEFORE Android begins the transition. onPause() can
            // run before onPictureInPictureModeChanged(); without this guard the app
            // may hand video playback to the background-audio service during the PiP
            // transition and the floating video never appears or immediately stops.
            irgunPipActive = true;
            // Do not resize/reflow the WebView before Android captures the current
            // video frame for PiP. The PiP callback applies the compact layout after
            // entry, which avoids the black-frame regression seen on WebView/Vimeo.
            PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(16, 9));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                builder.setSeamlessResizeEnabled(true);
            }
            boolean entered = enterPictureInPictureMode(builder.build());
            if (!entered) {
                irgunPipActive = false;
                prepareWebForPip(false);
            }
            return entered;
        } catch (Exception ignored) {
            irgunPipActive = false;
            prepareWebForPip(false);
            return false;
        }
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
        irgunPipActive = isInPictureInPictureMode;
        IrgunAnalyticsReporter.get(this).setPictureInPictureActive(isInPictureInPictureMode);
        prepareWebForPip(isInPictureInPictureMode);
        if (!isInPictureInPictureMode) {
            // Returning from PiP is not Vimeo fullscreen. Always restore the normal
            // app window immediately so the web player comes back at its regular
            // in-page size instead of briefly remaining stretched to the PiP surface.
            videoFullscreen = false;
            restoreNormalSystemBars();
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
    }

    @Override
    public void onResume() {
        super.onResume();
        // Mark the Activity visible, but do not push JavaScript into the WebView here.
        // Android may call onResume while Capacitor is still restoring/replacing the
        // WebView after Home or a notification tap. The live JS page proves it is
        // ready by calling IrgunPlayback.getState() from visibilitychange/init.
        IrgunPlaybackPlugin.setAppForeground(true);
        IrgunAnalyticsReporter.get(this).setForeground(true);

        boolean actuallyInPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode();
        boolean pipWasActive = irgunPipActive;
        if (!actuallyInPip) {
            irgunPipActive = false;
            videoFullscreen = false;
            restoreNormalSystemBars();

            // Only a real PiP exit needs WebView cleanup. A normal Home -> reopen
            // never evaluates JavaScript from Activity.onResume.
            if (pipWasActive) {
                getWindow().getDecorView().post(() -> {
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || !isInPictureInPictureMode()) {
                        irgunPipActive = false;
                        prepareWebForPip(false);
                        restoreWebViewportAfterPip();
                    }
                });
            }
        }
    }

    @Override
    public void onDestroy() {
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
