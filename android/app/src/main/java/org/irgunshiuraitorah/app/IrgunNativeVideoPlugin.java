package org.irgunshiuraitorah.app;

import android.content.Intent;
import android.app.AlertDialog;
import android.os.Build;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.Toast;
import androidx.media3.common.C;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import com.getcapacitor.JSArray;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;
import android.net.Uri;
import android.graphics.Color;
import android.graphics.Rect;
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
    private static WeakReference<IrgunNativeVideoPlugin> current = new WeakReference<>(null);
    private LinearLayout videoActions;
    private Button qualityButton;
    private ImageButton pipButton, sizeButton, minimizeButton, speedButton;
    private AlertDialog qualityDialog, speedDialog;
    private boolean systemPip;
    private int requestedQualityHeight;
    private boolean controllerVisible;
    private long doubleTapSeekCount, doubleTapSeekTargetMs, doubleTapSeekAtMs;

    public static void systemPipChanged(boolean active) {
        IrgunNativeVideoPlugin plugin = current.get();
        if (plugin == null) return;
        plugin.systemPip = active;
        if (!active) plugin.fullscreen = false;
        plugin.layoutSurface();
    }

    private int dp(float value) {
        return Math.round(value * getContext().getResources().getDisplayMetrics().density);
    }

    private void webAction(String expression) {
        if (getBridge() != null && getBridge().getWebView() != null)
            getBridge().getWebView().evaluateJavascript(expression, null);
    }

    private void minimizeNativeVideo() {
        if (!visible || mini || systemPip) return;
        webAction("window.__irgunMinimizeNativeVideo && window.__irgunMinimizeNativeVideo();");
    }

    // Observe gestures before child controls consume them. Leave taps, horizontal
    // seeks, bottom transport controls and multitouch with the native controller.
    private final class NativePlayerView extends PlayerView {
        private float downX, downY;
        private boolean canSwipe, canDoubleTap;
        private boolean holdingActionBar;
        private long downTime;
        private final NativeVideoDoubleTap doubleTap = new NativeVideoDoubleTap();
        NativePlayerView() { super(getActivity()); }
        private boolean interactiveAt(View view, float x, float y) {
            if (!view.isShown() || x < 0 || y < 0 || x >= view.getWidth() || y >= view.getHeight()) return false;
            if (view != this && !(view instanceof ViewGroup) && view.isEnabled() && view.isClickable()) return true;
            if (view instanceof ViewGroup) {
                ViewGroup group=(ViewGroup)view;
                for(int i=group.getChildCount()-1;i>=0;i--) {
                    View child=group.getChildAt(i);
                    if(interactiveAt(child,x-child.getLeft()+group.getScrollX(),
                        y-child.getTop()+group.getScrollY())) return true;
                }
            }
            return false;
        }
        @Override public boolean dispatchTouchEvent(MotionEvent event) {
            Rect clip=getClipBounds();
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN && clip != null
                    && !clip.contains((int)event.getX(),(int)event.getY())) {
                canSwipe=false; canDoubleTap=false; doubleTap.cancel();
                // Covered header/content remains owned by the WebView below.
                return false;
            }
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                downX = event.getX(); downY = event.getY(); downTime=event.getEventTime();
                holdingActionBar = videoActions != null && videoActions.isShown()
                    && !mini && !systemPip && downY >= 0 && downY < dp(44);
                // These custom buttons sit outside Media3's controller. Hold
                // its hide timer through DOWN/UP so it cannot cancel a click.
                if (holdingActionBar) setControllerShowTimeoutMs(0);
                canSwipe = visible && !mini && !systemPip
                    && downY > dp(44) && downY < getHeight() - dp(40);
                canDoubleTap=canSwipe && !interactiveAt(this,downX,downY);
                if(!canDoubleTap) doubleTap.cancel();
            } else if (event.getPointerCount() > 1 || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                canSwipe = false; doubleTap.cancel();
            } else if (canSwipe && event.getActionMasked() == MotionEvent.ACTION_MOVE
                    && NativeVideoSwipe.shouldMinimize(event.getX()-downX, event.getY()-downY,
                        getResources().getDisplayMetrics().density)) {
                canSwipe = false; doubleTap.cancel();
                MotionEvent cancel = MotionEvent.obtain(event);
                cancel.setAction(MotionEvent.ACTION_CANCEL);
                super.dispatchTouchEvent(cancel);
                cancel.recycle();
                minimizeNativeVideo();
                return true;
            }
            if (holdingActionBar && (event.getActionMasked() == MotionEvent.ACTION_UP
                    || event.getActionMasked() == MotionEvent.ACTION_CANCEL)) {
                holdingActionBar=false;
                if ((qualityDialog == null || !qualityDialog.isShowing())
                        && (speedDialog == null || !speedDialog.isShowing())) setControllerShowTimeoutMs(8000);
            }
            if (event.getActionMasked() == MotionEvent.ACTION_UP) {
                float slop = ViewConfiguration.get(getContext()).getScaledTouchSlop();
                boolean tap = canSwipe && canDoubleTap && event.getEventTime()-downTime < ViewConfiguration.getLongPressTimeout() && Math.hypot(event.getX()-downX,event.getY()-downY) <= slop;
                int direction = tap ? doubleTap.tap(event.getEventTime(),event.getX(),event.getY(),
                    getWidth(),ViewConfiguration.getDoubleTapTimeout(),
                    ViewConfiguration.get(getContext()).getScaledDoubleTapSlop()) : 0;
                if (!tap) doubleTap.cancel();
                if (direction != 0) {
                    ExoPlayer player = IrgunPlaybackService.nativeVideoPlayer();
                    if (player != null) {
                        doubleTapSeekTargetMs=NativeVideoDoubleTap.seekTarget(
                            player.getCurrentPosition(),player.getDuration(),direction);
                        doubleTapSeekCount++;
                        doubleTapSeekAtMs=android.os.SystemClock.elapsedRealtime();
                        IrgunPlaybackService.seekTo(doubleTapSeekTargetMs);
                        Toast.makeText(getContext(),direction < 0 ? "−15 seconds" : "+15 seconds",
                            Toast.LENGTH_SHORT).show();
                    }
                    MotionEvent cancel = MotionEvent.obtain(event);
                    cancel.setAction(MotionEvent.ACTION_CANCEL);
                    super.dispatchTouchEvent(cancel); cancel.recycle();
                    return true;
                }
            }
            return super.dispatchTouchEvent(event);
        }
    }

    private Button actionButton(String label, String description, Runnable action) {
        Button button = new Button(getActivity());
        button.setText(label);
        button.setTextSize(12);
        button.setAllCaps(false);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setStateListAnimator(null);
        button.setElevation(0); button.setTranslationZ(0);
        button.setMinWidth(0); button.setMinimumWidth(0);
        button.setPadding(0,0,0,0);
        button.setContentDescription(description);
        button.setOnClickListener(view -> action.run());
        videoActions.addView(button, new LinearLayout.LayoutParams(dp(72), dp(44)));
        return button;
    }

    private ImageButton iconButton(int drawable, String description, Runnable action) {
        ImageButton button=new ImageButton(getActivity());
        button.setImageResource(drawable);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setStateListAnimator(null);
        button.setElevation(0); button.setTranslationZ(0);
        button.setPadding(dp(10),dp(10),dp(10),dp(10));
        button.setContentDescription(description);
        if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)button.setTooltipText(description);
        button.setOnClickListener(view -> action.run());
        videoActions.addView(button,new LinearLayout.LayoutParams(dp(44),dp(44)));
        return button;
    }

    private void showSpeedMenu() {
        ExoPlayer player=IrgunPlaybackService.nativeVideoPlayer();
        if (player == null || systemPip || mini) return;
        final float[] speeds={.75f,1f,1.25f,1.5f,1.75f,2f};
        final String[] labels={"0.75×","1×","1.25×","1.5×","1.75×","2×"};
        int checked=-1;
        for(int i=0;i<speeds.length;i++)
            if(Math.abs(player.getPlaybackParameters().speed-speeds[i])<.01f)checked=i;
        surface.setControllerShowTimeoutMs(0);
        speedDialog=new AlertDialog.Builder(getActivity()).setTitle("Playback speed")
            .setSingleChoiceItems(labels,checked,(dialog,which)->{
                if(player == IrgunPlaybackService.nativeVideoPlayer())
                    IrgunPlaybackService.setSpeed(speeds[which]);
                dialog.dismiss();
            }).setNegativeButton("Cancel",null).create();
        speedDialog.setOnDismissListener(dialog->{
            if(surface != null){surface.setControllerShowTimeoutMs(8000);surface.showController();}
        });
        speedDialog.show();
    }

    private static final class Resolution {
        final Tracks.Group group; final int track; final int height;
        Resolution(Tracks.Group group, int track, int height) {
            this.group=group; this.track=track; this.height=height;
        }
    }

    private List<Resolution> availableResolutions(ExoPlayer player) {
        TreeMap<Integer, Resolution> choices = new TreeMap<>(java.util.Collections.reverseOrder());
        if (player != null) for (Tracks.Group group : player.getCurrentTracks().getGroups()) {
            if (group.getType() != C.TRACK_TYPE_VIDEO) continue;
            for (int i=0; i<group.length; i++) {
                int height=group.getTrackFormat(i).height;
                if (height > 0 && group.isTrackSupported(i))
                    choices.putIfAbsent(height, new Resolution(group,i,height));
            }
        }
        return new ArrayList<>(choices.values());
    }

    private void showQualityMenu() {
        ExoPlayer player=IrgunPlaybackService.nativeVideoPlayer();
        if (player == null || systemPip || mini) return;
        List<Resolution> choices=availableResolutions(player);
        String[] labels=new String[choices.size()+1]; labels[0]="Auto";
        int checked=0;
        for (int i=0; i<choices.size(); i++) {
            labels[i+1]=choices.get(i).height+"p";
            if (requestedQualityHeight==choices.get(i).height) checked=i+1;
        }
        surface.setControllerShowTimeoutMs(0);
        qualityDialog=new AlertDialog.Builder(getActivity()).setTitle("Video quality")
            .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                // Dialog may outlive a source switch. Never apply a stale TrackGroup.
                if (player != IrgunPlaybackService.nativeVideoPlayer()) { dialog.dismiss(); return; }
                TrackSelectionParameters.Builder selection=player.getTrackSelectionParameters()
                    .buildUpon().clearOverridesOfType(C.TRACK_TYPE_VIDEO);
                if (which > 0) {
                    Resolution choice=choices.get(which-1);
                    if (!player.getCurrentTracks().getGroups().contains(choice.group)) { dialog.dismiss(); return; }
                    selection.setOverrideForType(new TrackSelectionOverride(choice.group.getMediaTrackGroup(),choice.track));
                    requestedQualityHeight=choice.height;
                } else requestedQualityHeight=0;
                // Track selection only: no seek, prepare, source replacement or player.
                player.setTrackSelectionParameters(selection.build());
                qualityButton.setText(requestedQualityHeight==0 ? "Auto" : requestedQualityHeight+"p");
                dialog.dismiss();
            }).setNegativeButton("Cancel", null).create();
        qualityDialog.setOnDismissListener(dialog -> {
            if (surface != null) {
                surface.setControllerShowTimeoutMs(8000);
                surface.showController();
            }
        });
        qualityDialog.show();
    }

    private void updateVideoActions() {
        if (videoActions == null) return;
        videoActions.setVisibility(visible && !mini && !systemPip && controllerVisible
            ? View.VISIBLE : View.GONE);
        sizeButton.setImageResource(fullscreen ? R.drawable.irgun_shrink : R.drawable.irgun_fullscreen);
        sizeButton.setContentDescription(fullscreen ? "Exit video fullscreen" : "Enter video fullscreen");
    }
    // In MINI the Android PlayerView is above the WebView. A DOM hit test
    // incorrectly reports the thumbnail as clickable while Android routes
    // the physical touch to this native view instead. Place one transparent,
    // native, clickable overlay over ONLY the moving mini thumbnail.
    private View miniExpandTarget;
    private Button miniPlayPauseTarget;
    private float miniPlayX, miniPlayY, miniPlayWidth, miniPlayHeight;
    private ExoPlayer observedMiniPlayer;
    private final Player.Listener miniPlaybackListener = new Player.Listener() {
        @Override public void onPlayWhenReadyChanged(boolean playing, int reason) { refreshMiniTransport(); }
        @Override public void onIsPlayingChanged(boolean playing) { refreshMiniTransport(); }
    };

    private void refreshMiniTransport() {
        ExoPlayer player = IrgunPlaybackService.nativeVideoPlayer();
        if (observedMiniPlayer != player) {
            if (observedMiniPlayer != null) observedMiniPlayer.removeListener(miniPlaybackListener);
            observedMiniPlayer = player;
            if (player != null) player.addListener(miniPlaybackListener);
        }
        if (miniPlayPauseTarget == null) return;
        boolean playIntent = player != null && player.getPlayWhenReady();
        miniPlayPauseTarget.setText(playIntent ? "II" : "▶");
        miniPlayPauseTarget.setContentDescription(playIntent ? "Pause mini video" : "Play mini video");
    }

    private void hideMiniTargets() {
        if (miniExpandTarget != null) miniExpandTarget.setVisibility(View.GONE);
        if (miniPlayPauseTarget != null) miniPlayPauseTarget.setVisibility(View.GONE);
    }
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
    private float clipLeft, clipTop, clipRight, clipBottom;

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
            requestedQualityHeight = 0;
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
            surface = new NativePlayerView();
            current = new WeakReference<>(this);
            surface.setUseController(true);
            surface.setControllerAutoShow(true);
            surface.setControllerShowTimeoutMs(8000);
            surface.setShowPreviousButton(false);
            surface.setShowNextButton(false);
            // Quality and speed already have dedicated controls in our top row.
            // Remove Media3's duplicate gear, including from its overflow layout.
            View settings = surface.findViewById(androidx.media3.ui.R.id.exo_settings);
            if (settings != null && settings.getParent() instanceof ViewGroup)
                ((ViewGroup) settings.getParent()).removeView(settings);
            surface.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
            surface.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
            surface.setKeepContentOnPlayerReset(true);
            surface.setBackgroundColor(Color.BLACK);
            surface.setElevation(12f);
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(1,1);
            params.gravity = Gravity.TOP | Gravity.LEFT;
            root.addView(surface, params);
            videoActions = new LinearLayout(getActivity());
            videoActions.setOrientation(LinearLayout.HORIZONTAL);
            videoActions.setGravity(Gravity.END);
            videoActions.setElevation(dp(8));
            videoActions.setBackgroundColor(0x99000000);
            FrameLayout.LayoutParams actionParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(44), Gravity.TOP);
            surface.addView(videoActions, actionParams);
            pipButton=iconButton(R.drawable.irgun_pip, "Enter Picture-in-Picture", () -> {
                if(getActivity() instanceof MainActivity)
                    ((MainActivity)getActivity()).enterIrgunPictureInPicture();
            });
            pipButton.setVisibility(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? View.VISIBLE : View.GONE);
            qualityButton=actionButton("Auto", "Choose video quality", this::showQualityMenu);
            speedButton=iconButton(R.drawable.irgun_speed,"Choose playback speed",this::showSpeedMenu);
            sizeButton=iconButton(R.drawable.irgun_fullscreen, "Enter video fullscreen", () -> webAction(
                "window.__irgunToggleNativeVideoFullscreen && window.__irgunToggleNativeVideoFullscreen();"));
            minimizeButton=iconButton(R.drawable.irgun_mini, "Minimize video", this::minimizeNativeVideo);
            controllerVisible = surface.isControllerFullyVisible();
            surface.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> {
                // VISIBLE is sent when Media3 STARTS its show animation. A
                // fully-visible query at that moment can still be false, and
                // no second visibility callback follows animation completion.
                // Track the actual visibility event so our independent native
                // action bar cannot stay hidden after a real video tap.
                controllerVisible = visibility == View.VISIBLE;
                updateVideoActions();
            });
            ExoPlayer existing = IrgunPlaybackService.nativeVideoPlayer();
            if (existing != null) surface.setPlayer(existing);
        }
        if (miniExpandTarget == null) {
            miniExpandTarget = new View(getActivity());
            miniExpandTarget.setBackgroundColor(Color.TRANSPARENT);
            miniExpandTarget.setContentDescription("Expand mini video");
            miniExpandTarget.setElevation(16f);
            miniExpandTarget.setVisibility(View.GONE);
            miniExpandTarget.setOnClickListener(clickedView -> {
                if (!mini || !visible || getBridge() == null) return;
                WebView web = getBridge().getWebView();
                if (web != null) web.evaluateJavascript(
                    "window.__irgunExpandNativeMiniVideo && window.__irgunExpandNativeMiniVideo();", null);
            });
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(1,1);
            params.gravity = Gravity.TOP | Gravity.LEFT;
            root.addView(miniExpandTarget, params);
        }
        if (miniPlayPauseTarget == null) {
            miniPlayPauseTarget = new Button(getActivity());
            miniPlayPauseTarget.setTextColor(Color.WHITE);
            miniPlayPauseTarget.setTextSize(18);
            miniPlayPauseTarget.setBackgroundColor(Color.rgb(15,31,53));
            miniPlayPauseTarget.setPadding(0,0,0,0);
            miniPlayPauseTarget.setMinWidth(0); miniPlayPauseTarget.setMinimumWidth(0);
            // Native thumbnail/Expand can overlap a WebView button in RTL or on
            // narrow phones. Own the actual Pause rectangle ABOVE that surface.
            // Material Button's default StateListAnimator lowers elevation to
            // 2dp when released. That put RTL Pause BELOW the 16px thumbnail
            // Expand overlay, so the physical Pause touch expanded Video.
            miniPlayPauseTarget.setStateListAnimator(null);
            miniPlayPauseTarget.setTranslationZ(0f);
            miniPlayPauseTarget.setElevation(20f);
            miniPlayPauseTarget.setVisibility(View.GONE);
            miniPlayPauseTarget.setOnClickListener(view -> {
                if (!mini || !visible || systemPip) return;
                ExoPlayer player = IrgunPlaybackService.nativeVideoPlayer();
                if (player == null) return;
                // Buffering is not Pause. Honor the actual Media3 play intent.
                if (player.getPlayWhenReady()) IrgunPlaybackService.pause();
                else IrgunPlaybackService.play();
                refreshMiniTransport();
            });
            root.addView(miniPlayPauseTarget, new FrameLayout.LayoutParams(1,1));
        }
        refreshMiniTransport();
    }

    private void layoutSurface() {
        if (surface == null || root == null || getBridge() == null) return;
        WebView web = getBridge().getWebView();
        updateVideoActions();
        if ((fullscreen || systemPip) && visible) {
            // Use the real Android root, not the old WebView HLS stage. Media3
            // keeps decoding on the SAME existing ExoPlayer while switching
            // between in-page and fullscreen native PlayerView dimensions.
            FrameLayout.LayoutParams full = new FrameLayout.LayoutParams(
                Math.max(1, root.getWidth()), Math.max(1, root.getHeight()));
            full.gravity = Gravity.TOP | Gravity.LEFT;
            full.leftMargin = 0;
            full.topMargin = 0;
            surface.setLayoutParams(full);
            surface.setClipBounds(null);
            surface.setUseController(!systemPip);
            surface.setVisibility(View.VISIBLE);
            updateVideoActions();
            hideMiniTargets();
            return;
        }
        if (web == null || viewportWidth <= 0 || viewportHeight <= 0
                || width <= 0 || height <= 0 || !visible) {
            surface.setVisibility(View.GONE);
            hideMiniTargets();
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
        surface.setClipBounds(new Rect(Math.round(clipLeft*scaleX),Math.round(clipTop*scaleY),
            Math.round(clipRight*scaleX),Math.round(clipBottom*scaleY)));
        surface.setUseController(!mini);
        updateVideoActions();
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
        if (miniPlayPauseTarget != null) {
            if (mini && miniPlayWidth > 0 && miniPlayHeight > 0) {
                FrameLayout.LayoutParams control = new FrameLayout.LayoutParams(
                    Math.max(1,Math.round(miniPlayWidth*scaleX)), Math.max(1,Math.round(miniPlayHeight*scaleY)));
                control.gravity = Gravity.TOP | Gravity.LEFT;
                control.leftMargin = webScreen[0]-rootScreen[0]+Math.round(miniPlayX*scaleX);
                control.topMargin = webScreen[1]-rootScreen[1]+Math.round(miniPlayY*scaleY);
                miniPlayPauseTarget.setLayoutParams(control);
                miniPlayPauseTarget.setVisibility(View.VISIBLE);
                refreshMiniTransport();
            } else miniPlayPauseTarget.setVisibility(View.GONE);
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
        JSObject clip = call.getObject("clip");
        clipLeft = clip == null ? 0f : (float)clip.optDouble("left",0);
        clipTop = clip == null ? 0f : (float)clip.optDouble("top",0);
        clipRight = clip == null ? width : (float)clip.optDouble("right",width);
        clipBottom = clip == null ? height : (float)clip.optDouble("bottom",height);
        JSObject transport = call.getObject("miniPlay");
        miniPlayX = transport == null ? 0f : (float)transport.optDouble("x",0);
        miniPlayY = transport == null ? 0f : (float)transport.optDouble("y",0);
        miniPlayWidth = transport == null ? 0f : (float)transport.optDouble("width",0);
        miniPlayHeight = transport == null ? 0f : (float)transport.optDouble("height",0);
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
                hideMiniTargets();
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

    private JSObject controlRect(View control) {
        android.graphics.Rect rect = new android.graphics.Rect();
        if (control == null || !control.isShown() || !control.getGlobalVisibleRect(rect)
                || rect.width() <= 0 || rect.height() <= 0) return null;
        JSObject result = new JSObject();
        result.put("x", rect.left); result.put("y", rect.top);
        result.put("width", rect.width()); result.put("height", rect.height());
        return result;
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
            response.put("doubleTapSeekCount", doubleTapSeekCount);
            response.put("doubleTapSeekTargetMs", doubleTapSeekTargetMs);
            response.put("doubleTapSeekAgeMs", doubleTapSeekAtMs == 0 ? 0
                : Math.max(0,android.os.SystemClock.elapsedRealtime()-doubleTapSeekAtMs));
            response.put("durationMs", state.durationMs);
            response.put("bufferedPositionMs", state.bufferedPositionMs);
            response.put("width", state.width);
            response.put("height", state.height);
            response.put("sourceType", state.source);
            response.put("error", state.error);
            response.put("fullscreen", fullscreen);
            response.put("mini", mini);
            response.put("systemPip", systemPip);
            response.put("pipButtonVisible", pipButton != null && pipButton.isShown());
            response.put("qualityButtonVisible", qualityButton != null && qualityButton.isShown());
            View settings = surface == null ? null : surface.findViewById(androidx.media3.ui.R.id.exo_settings);
            response.put("settingsButtonVisible", settings != null && settings.isShown());
            response.put("qualityHeight", requestedQualityHeight);
            response.put("qualityMenuVisible", qualityDialog != null && qualityDialog.isShowing());
            response.put("speedMenuVisible", speedDialog != null && speedDialog.isShowing());
            response.put("playbackSpeed", state.active && IrgunPlaybackService.nativeVideoPlayer()!=null
                ? IrgunPlaybackService.nativeVideoPlayer().getPlaybackParameters().speed : 1f);
            response.put("speedButtonRect", controlRect(speedButton));
            // Read-only actual Android geometry. No UI/controller state mutation.
            response.put("pipButtonRect", controlRect(pipButton));
            response.put("qualityButtonRect", controlRect(qualityButton));
            response.put("sizeButtonRect", controlRect(sizeButton));
            response.put("miniExpandRect", controlRect(miniExpandTarget));
            response.put("miniPlayPauseRect", controlRect(miniPlayPauseTarget));
            response.put("miniPlayPauseZ", miniPlayPauseTarget == null ? 0f : miniPlayPauseTarget.getZ());
            response.put("miniExpandZ", miniExpandTarget == null ? 0f : miniExpandTarget.getZ());
            response.put("miniPlayPauseLabel", miniPlayPauseTarget == null ? "" : miniPlayPauseTarget.getContentDescription());
            ExoPlayer player = IrgunPlaybackService.nativeVideoPlayer();
            response.put("playerIdentity", player == null ? 0 : System.identityHashCode(player));
            response.put("mediaItemIdentity", player == null || player.getCurrentMediaItem() == null
                ? 0 : System.identityHashCode(player.getCurrentMediaItem()));
            JSArray resolutions = new JSArray();
            for (Resolution choice : availableResolutions(player)) resolutions.put(choice.height);
            response.put("availableResolutions", resolutions);
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
            if (visibleOnScreen && surface.getClipBounds() != null) {
                Rect clip = new Rect(surface.getClipBounds());
                int[] location = new int[2]; surface.getLocationOnScreen(location);
                clip.offset(location[0],location[1]);
                visibleOnScreen = onScreen.intersect(clip) && onScreen.width()>0 && onScreen.height()>0;
            }
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
        if (observedMiniPlayer != null) observedMiniPlayer.removeListener(miniPlaybackListener);
        observedMiniPlayer = null;
        if (miniPlayPauseTarget != null) {
            ViewGroup parent = (ViewGroup)miniPlayPauseTarget.getParent();
            if (parent != null) parent.removeView(miniPlayPauseTarget);
            miniPlayPauseTarget = null;
        }
        if (qualityDialog != null) { qualityDialog.dismiss(); qualityDialog=null; }
        if (speedDialog != null) { speedDialog.dismiss(); speedDialog=null; }
        videoActions=null; pipButton=null; qualityButton=null; sizeButton=null; minimizeButton=null; speedButton=null;
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
