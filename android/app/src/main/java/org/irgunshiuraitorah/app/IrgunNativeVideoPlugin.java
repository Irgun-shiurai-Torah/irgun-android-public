package org.irgunshiuraitorah.app;

import android.content.Intent;
import android.net.Uri;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.annotation.Nullable;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.net.URI;
import java.io.File;
import java.io.IOException;

/**
 * Opt-in, Android-only native video. A PlayerView is attached to the existing
 * IrgunPlaybackService ExoPlayer. It does NOT create a second player or audio
 * output. The WebView reserves a video rectangle; Media3 owns that rectangle
 * and renders physical Android play/seek controls.
 */
@CapacitorPlugin(name = "IrgunNativeVideo")
public final class IrgunNativeVideoPlugin extends Plugin {
    private static final String API_HOST = "api.irgunshiuraitorah.com";
    private final Handler main = new Handler(Looper.getMainLooper());
    private PlayerView surface;
    // In MINI the Android PlayerView is above the WebView. A DOM hit test
    // incorrectly reports the thumbnail as clickable while Android routes
    // the physical touch to this native view instead. Place one transparent,
    // native, clickable overlay over ONLY the moving mini thumbnail.
    private View miniExpandTarget;
    private FrameLayout root;
    private boolean visible = false;
    private boolean mini = false;
    private final View.OnLayoutChangeListener rootLayoutListener =
        (view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) ->
            main.post(this::layoutSurface);
    // Expands the SAME PlayerView/ExoPlayer, never a second video instance.
    private boolean fullscreen = false;
    private int surfaceGeneration = 0;
    private float x, y, width, height, viewportWidth, viewportHeight;

    private boolean permitted(String url) {
        if (url == null || url.isEmpty()) return false;
        try {
            URI uri = URI.create(url);
            return "https".equalsIgnoreCase(uri.getScheme())
                && API_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getPath() != null && uri.getPath().startsWith("/media/");
        } catch (RuntimeException exception) {
            return false;
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        String hls = call.getString("hlsUrl", "");
        String mp4 = call.getString("mp4Url", "");
        if ((!hls.isEmpty() && !permitted(hls)) || (!mp4.isEmpty() && !permitted(mp4))
                || (hls.isEmpty() && mp4.isEmpty())) {
            call.reject("Native Media3 requires an approved Irgun HLS or MP4 media URL");
            return;
        }
        String id = call.getString("lectureId", "");
        if (id.isEmpty()) { call.reject("Lecture ID required"); return; }
        try {
            // The same existing MediaSessionService used by native Audio.
            getContext().startService(new Intent(getContext(), IrgunPlaybackService.class));
            IrgunPlaybackService.openNativeVideo(
                id, call.getString("title", "Shiur"),
                call.getString("speaker", ""), call.getString("image", ""),
                call.getString("audioUrl", ""), hls, mp4,
                Math.max(0L, Math.round(call.getDouble("positionMs", 0.0))),
                (float)Math.max(0.25, call.getDouble("speed", 1.0)),
                Boolean.TRUE.equals(call.getBoolean("playing", true)));
            visible = true;
            fullscreen = false;
            attachWhenReady(++surfaceGeneration, 0);
            JSObject response = new JSObject();
            response.put("accepted", true);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Could not initialize native Media3 video", error);
        }
    }

    private void attachWhenReady(int expectedGeneration, int attempt) {
        main.postDelayed(() -> {
            if (surfaceGeneration != expectedGeneration || !visible || getActivity() == null) return;
            ExoPlayer player = IrgunPlaybackService.nativeVideoPlayer();
            if (player == null) {
                if (attempt < 30) attachWhenReady(expectedGeneration, attempt + 1);
                return;
            }
            ensureSurface();
            surface.setPlayer(player);
            layoutSurface();
        }, attempt == 0 ? 100 : 150);
    }

    private void ensureSurface() {
        if (getActivity() == null) return;
        View v = getActivity().findViewById(android.R.id.content);
        if (!(v instanceof FrameLayout)) return;
        FrameLayout nextRoot = (FrameLayout)v;
        if (root != nextRoot) {
            removeSurface();
            root = nextRoot;
            root.addOnLayoutChangeListener(rootLayoutListener);
        }
        if (surface == null) {
            surface = new PlayerView(getActivity());
            surface.setUseController(true);
            surface.setControllerAutoShow(true);
            surface.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
            surface.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
            surface.setKeepContentOnPlayerReset(true);
            surface.setBackgroundColor(Color.BLACK);
            surface.setElevation(12f);
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(1,1);
            params.gravity = Gravity.TOP | Gravity.LEFT;
            root.addView(surface, params);
            ExoPlayer existing = IrgunPlaybackService.nativeVideoPlayer();
            if (existing != null) surface.setPlayer(existing);
        }
        if (miniExpandTarget == null) {
            miniExpandTarget = new View(getActivity());
            miniExpandTarget.setBackgroundColor(Color.TRANSPARENT);
            miniExpandTarget.setContentDescription("Expand mini video");
            miniExpandTarget.setElevation(16f);
            miniExpandTarget.setVisibility(View.GONE);
            miniExpandTarget.setOnClickListener(v -> {
                if (!mini || !visible || getBridge() == null) return;
                WebView web = getBridge().getWebView();
                if (web != null) web.evaluateJavascript(
                    "window.__irgunExpandNativeMiniVideo && window.__irgunExpandNativeMiniVideo();", null);
            });
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(1,1);
            params.gravity = Gravity.TOP | Gravity.LEFT;
            root.addView(miniExpandTarget, params);
        }
    }

    private void layoutSurface() {
        if (surface == null || root == null || getBridge() == null) return;
        WebView web = getBridge().getWebView();
        if (fullscreen && visible) {
            // Use the real Android root, not the old WebView HLS stage. Media3
            // keeps decoding on the SAME existing ExoPlayer while switching
            // between in-page and fullscreen native PlayerView dimensions.
            FrameLayout.LayoutParams full = new FrameLayout.LayoutParams(
                Math.max(1, root.getWidth()), Math.max(1, root.getHeight()));
            full.gravity = Gravity.TOP | Gravity.LEFT;
            full.leftMargin = 0;
            full.topMargin = 0;
            surface.setLayoutParams(full);
            surface.setUseController(true);
            surface.setVisibility(View.VISIBLE);
            if (miniExpandTarget != null) miniExpandTarget.setVisibility(View.GONE);
            return;
        }
        if (web == null || viewportWidth <= 0 || viewportHeight <= 0
                || width <= 0 || height <= 0 || !visible) {
            surface.setVisibility(View.GONE);
            if (miniExpandTarget != null) miniExpandTarget.setVisibility(View.GONE);
            return;
        }
        int[] webScreen = new int[2], rootScreen = new int[2];
        web.getLocationOnScreen(webScreen);
        root.getLocationOnScreen(rootScreen);
        float scaleX = (float)web.getWidth() / viewportWidth;
        float scaleY = (float)web.getHeight() / viewportHeight;
        int left = webScreen[0] - rootScreen[0] + Math.round(x * scaleX);
        int top = webScreen[1] - rootScreen[1] + Math.round(y * scaleY);
        int w = Math.max(1, Math.round(width * scaleX));
        int h = Math.max(1, Math.round(height * scaleY));
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(w,h);
        params.gravity = Gravity.TOP | Gravity.LEFT;
        params.leftMargin = left;
        params.topMargin = top;
        surface.setLayoutParams(params);
        surface.setUseController(!mini);
        surface.setVisibility(View.VISIBLE);
        if (miniExpandTarget != null) {
            if (mini) {
                FrameLayout.LayoutParams hit = new FrameLayout.LayoutParams(w,h);
                hit.gravity = Gravity.TOP | Gravity.LEFT;
                hit.leftMargin = left;
                hit.topMargin = top;
                miniExpandTarget.setLayoutParams(hit);
                miniExpandTarget.setVisibility(View.VISIBLE);
            } else miniExpandTarget.setVisibility(View.GONE);
        }
    }

    @PluginMethod
    public void frame(PluginCall call) {
        x = (float)(double)call.getDouble("x", 0.0);
        y = (float)(double)call.getDouble("y", 0.0);
        width = (float)(double)call.getDouble("width", 0.0);
        height = (float)(double)call.getDouble("height", 0.0);
        viewportWidth = (float)(double)call.getDouble("viewportWidth", 0.0);
        viewportHeight = (float)(double)call.getDouble("viewportHeight", 0.0);
        mini = Boolean.TRUE.equals(call.getBoolean("mini", false));
        getActivity().runOnUiThread(() -> {
            // Device rotation may have rebuilt the Android root while the
            // single ExoPlayer service kept playing. Rebind the PlayerView to
            // the CURRENT Activity/root rather than positioning a stale view.
            if (visible) ensureSurface();
            layoutSurface();
            call.resolve();
        });
    }

    @PluginMethod
    public void fullscreen(PluginCall call) {
        final boolean expand = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            if (expand && (!visible || surface == null)) {
                call.reject("Native Media3 fullscreen requires a visible video surface");
                return;
            }
            fullscreen = expand;
            if (expand) mini = false;
            layoutSurface();
            call.resolve();
        });
    }

    // Capacitor Filesystem returns a file:// URI for private offline MP3s.
    // Never let an untrusted WebView argument turn Media3 into an arbitrary
    // Android file reader. Canonicalize and confine it to this app's offline
    // folder; the downloader has already validated its length.
    private String approvedOfflineAudio(String supplied) throws IOException {
        if (supplied == null || supplied.trim().isEmpty()) return "";
        Uri uri = Uri.parse(supplied);
        if (!"file".equalsIgnoreCase(uri.getScheme()) || uri.getPath() == null)
            throw new IllegalArgumentException("Offline Media3 requires a private file URI");
        File dir = new File(getContext().getFilesDir(), "irgun-offline").getCanonicalFile();
        File audio = new File(uri.getPath()).getCanonicalFile();
        if (!audio.getPath().startsWith(dir.getPath() + File.separator)
                || !audio.getName().endsWith(".mp3") || !audio.isFile()
                || !audio.canRead() || audio.length() < 65536L)
            throw new IllegalArgumentException("Offline file is missing or outside Irgun private storage");
        return Uri.fromFile(audio).toString();
    }

    @PluginMethod
    public void mode(PluginCall call) {
        boolean video = "video".equals(call.getString("mode", ""));
        String requestedOffline = video ? "" : call.getString("offlineUri", "");
        final String approved;
        try { approved = approvedOfflineAudio(requestedOffline); }
        catch (Exception error) {
            call.reject("Offline audio source is not a verified private MP3", error);
            return;
        }
        visible = video;
        if (!video) { fullscreen = false; mini = false; }
        IrgunPlaybackService.nativeVideoPresentation(video, approved);
        getActivity().runOnUiThread(() -> {
            if (video) {
                ensureSurface();
                if (surface != null) surface.setPlayer(IrgunPlaybackService.nativeVideoPlayer());
                layoutSurface();
            } else if (surface != null) {
                surface.setVisibility(View.GONE);
                surface.setPlayer(null);
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void playback(PluginCall call) {
        String operation = call.getString("operation", "");
        switch (operation) {
            case "play": IrgunPlaybackService.play(); break;
            case "pause": IrgunPlaybackService.pause(); break;
            case "seek": IrgunPlaybackService.seekTo(Math.max(0L,Math.round(call.getDouble("positionMs",0.0)))); break;
            case "speed": IrgunPlaybackService.setSpeed((float)Math.max(.25,call.getDouble("speed",1.0))); break;
            case "volume": IrgunPlaybackService.setVolume((float)Math.max(0,Math.min(1,call.getDouble("volume",1.0)))); break;
            default: call.reject("Unsupported native playback command"); return;
        }
        call.resolve();
    }

    @PluginMethod
    public void snapshot(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            IrgunPlaybackService.NativeVideoInfo state = IrgunPlaybackService.nativeVideoInfo();
            JSObject response = new JSObject();
            response.put("active", state.active);
            response.put("videoSelected", state.videoSelected);
            response.put("playing", state.isPlaying);
            response.put("playWhenReady", state.playWhenReady);
            response.put("firstFrame", state.firstFrame);
            response.put("frames", state.frameCount);
            response.put("positionMs", state.positionMs);
            response.put("durationMs", state.durationMs);
            response.put("bufferedPositionMs", state.bufferedPositionMs);
            response.put("width", state.width);
            response.put("height", state.height);
            response.put("sourceType", state.source);
            response.put("error", state.error);
            response.put("fullscreen", fullscreen);
            response.put("mini", mini);
            response.put("miniHitTargetVisible", miniExpandTarget != null && miniExpandTarget.isShown());
            response.put("surfaceVisible", surface != null && surface.getVisibility() == View.VISIBLE);
            // Native decoder counters alone cannot prove a visible picture.
            // Check the REAL Android global-visible view rectangle: earlier
            // Audio -> Video reports showed x=-12000 and a black screenshot
            // while Media3 was happily decoding video frames.
            android.graphics.Rect onScreen = new android.graphics.Rect();
            boolean visibleOnScreen = surface != null && surface.isShown()
                && surface.getGlobalVisibleRect(onScreen)
                && onScreen.width() > 0 && onScreen.height() > 0;
            response.put("surfaceVisibleOnScreen", visibleOnScreen);
            response.put("surfaceX", visibleOnScreen ? onScreen.left : -1);
            response.put("surfaceY", visibleOnScreen ? onScreen.top : -1);
            response.put("surfaceVisibleWidth", visibleOnScreen ? onScreen.width() : 0);
            response.put("surfaceVisibleHeight", visibleOnScreen ? onScreen.height() : 0);
            response.put("surfaceWidth", surface == null ? 0 : surface.getWidth());
            response.put("surfaceHeight", surface == null ? 0 : surface.getHeight());
            response.put("rootWidth", root == null ? 0 : root.getWidth());
            response.put("rootHeight", root == null ? 0 : root.getHeight());
            call.resolve(response);
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        boolean keepAudio = Boolean.TRUE.equals(call.getBoolean("keepAudio", false));
        visible = false;
        fullscreen = false;
        mini = false;
        ++surfaceGeneration;
        getActivity().runOnUiThread(this::removeSurface);
        IrgunPlaybackService.closeNativeVideo(keepAudio);
        call.resolve();
    }

    private void removeSurface() {
        if (root != null) root.removeOnLayoutChangeListener(rootLayoutListener);
        if (miniExpandTarget != null) {
            ViewGroup hitParent = (ViewGroup)miniExpandTarget.getParent();
            if (hitParent != null) hitParent.removeView(miniExpandTarget);
            miniExpandTarget = null;
        }
        if (surface != null) {
            surface.setPlayer(null);
            ViewGroup parent = (ViewGroup)surface.getParent();
            if (parent != null) parent.removeView(surface);
            surface = null;
        }
        root = null;
    }

    @Override
    protected void handleOnDestroy() {
        ++surfaceGeneration;
        visible = false;
        fullscreen = false;
        mini = false;
        if (getActivity() != null) getActivity().runOnUiThread(this::removeSurface);
        super.handleOnDestroy();
    }
}
