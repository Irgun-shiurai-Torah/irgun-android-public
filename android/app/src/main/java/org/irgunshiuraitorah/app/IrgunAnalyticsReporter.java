package org.irgunshiuraitorah.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * Small, fail-open analytics reporter. It never touches playback controls and never
 * throws network failures back into Activity/Media3 code.
 */
public final class IrgunAnalyticsReporter {
    private static final String API = "https://api.irgunshiuraitorah.com";
    private static final String PREFS = "irgun_usage_analytics";
    private static final String DEVICE_KEY = "anonymous_device_id_v1";
    private static final Object LOCK = new Object();
    private static IrgunAnalyticsReporter instance;

    private final Context context;
    private final ScheduledThreadPoolExecutor executor = new ScheduledThreadPoolExecutor(2);
    private final String deviceId;
    private final String instanceId = UUID.randomUUID().toString();
    private String screen = "Home";
    private String mediaType = "none";
    private String playerState = "browsing";
    private String shiurId = "";
    private String appVersion = "";
    private boolean playing = false;
    private boolean foreground = false;
    private boolean pipActive = false;

    private IrgunAnalyticsReporter(Context ctx) {
        context = ctx.getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String id = prefs.getString(DEVICE_KEY, "");
        if (id == null || id.trim().isEmpty()) {
            id = UUID.randomUUID().toString();
            prefs.edit().putString(DEVICE_KEY, id).apply();
        }
        deviceId = id;
        try { appVersion = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName; }
        catch (Exception ignored) { appVersion = "android"; }
        executor.setRemoveOnCancelPolicy(true);
        executor.scheduleAtFixedRate(this::sendPresenceIfActive, 1L, 30L, TimeUnit.SECONDS);
    }

    public static IrgunAnalyticsReporter get(Context context) {
        synchronized (LOCK) {
            if (instance == null) instance = new IrgunAnalyticsReporter(context);
            return instance;
        }
    }

    public String getDeviceId() { return deviceId; }

    public void configure(String version) {
        synchronized (this) { if (version != null && !version.trim().isEmpty()) appVersion = clean(version, 60); }
        sendPresenceIfActive();
    }

    public void setForeground(boolean value) {
        synchronized (this) { foreground = value; }
        if (value) sendPresenceIfActive();
    }

    public void setPictureInPictureActive(boolean value) {
        synchronized (this) { pipActive = value; }
        sendPresenceIfActive();
    }

    public void updateClientState(String newScreen, String newMediaType, boolean isPlaying, String newPlayerState, String newShiurId) {
        synchronized (this) {
            if (newScreen != null && !newScreen.trim().isEmpty()) screen = clean(newScreen, 80);
            if ("audio".equals(newMediaType) || "video".equals(newMediaType) || "none".equals(newMediaType)) mediaType = newMediaType;
            playing = isPlaying && !"none".equals(mediaType);
            playerState = normalizeState(newPlayerState, playing);
            shiurId = clean(newShiurId, 100);
        }
        sendPresenceIfActive();
    }

    public void updatePlayback(String newShiurId, String newMediaType, boolean isPlaying) {
        synchronized (this) {
            shiurId = clean(newShiurId, 100);
            mediaType = ("video".equals(newMediaType) || "audio".equals(newMediaType)) && !shiurId.isEmpty() ? newMediaType : "none";
            playing = isPlaying && !"none".equals(mediaType);
            playerState = playing ? "playing" : ("none".equals(mediaType) ? "browsing" : "paused");
        }
        sendPresenceIfActive();
    }

    public void event(String eventId, String eventType, String eventShiurId, String eventMediaType, String eventScreen) {
        final JSONObject body = new JSONObject();
        try {
            Snapshot snap = snapshot();
            body.put("deviceId", deviceId);
            body.put("instanceId", instanceId);
            body.put("platform", "android");
            body.put("eventId", clean(eventId, 180));
            body.put("eventType", clean(eventType, 40));
            body.put("screen", clean(eventScreen, 80).isEmpty() ? snap.screen : clean(eventScreen, 80));
            body.put("mediaType", normalizeMedia(eventMediaType));
            body.put("shiurId", clean(eventShiurId, 100));
            body.put("isPlaying", snap.playing);
            body.put("playerState", snap.playerState);
            body.put("appVersion", snap.appVersion);
            body.put("timestamp", System.currentTimeMillis());
        } catch (Exception ignored) { return; }
        executor.execute(() -> postJson("/analytics/event", body));
    }

    private void sendPresenceIfActive() {
        final Snapshot snap = snapshot();
        if (!snap.foreground && !snap.playing) return;
        final JSONObject body = new JSONObject();
        try {
            body.put("deviceId", deviceId);
            body.put("instanceId", instanceId);
            body.put("platform", "android");
            body.put("screen", effectiveScreen(snap));
            body.put("isPlaying", snap.playing);
            body.put("mediaType", snap.mediaType);
            body.put("playerState", snap.playerState);
            body.put("shiurId", snap.shiurId);
            body.put("appVersion", snap.appVersion);
            body.put("timestamp", System.currentTimeMillis());
        } catch (Exception ignored) { return; }
        executor.execute(() -> postJson("/analytics/presence", body));
    }

    private String effectiveScreen(Snapshot snap) {
        if (!snap.foreground && snap.playing) {
            if (snap.pipActive && "video".equals(snap.mediaType)) return "Picture in Picture";
            if ("audio".equals(snap.mediaType)) return "Background audio";
        }
        return snap.screen;
    }

    private synchronized Snapshot snapshot() {
        return new Snapshot(screen, mediaType, playerState, shiurId, appVersion, playing, foreground, pipActive);
    }

    private void postJson(String path, JSONObject body) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(API + path).openConnection();
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("X-Irgun-App", "1");
            conn.setDoOutput(true);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = conn.getOutputStream()) { out.write(bytes); }
            conn.getResponseCode();
        } catch (Throwable ignored) {
            // Analytics is never allowed to interrupt playback/navigation.
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String clean(String value, int max) {
        String v = value == null ? "" : value.replaceAll("[\\p{Cntrl}]", " ").trim().replaceAll("\\s+", " ");
        return v.length() <= max ? v : v.substring(0, max);
    }
    private static String normalizeMedia(String value) { return "audio".equals(value) || "video".equals(value) ? value : "none"; }
    private static String normalizeState(String value, boolean isPlaying) {
        return "playing".equals(value) || "paused".equals(value) || "browsing".equals(value) ? value : (isPlaying ? "playing" : "browsing");
    }

    private static final class Snapshot {
        final String screen, mediaType, playerState, shiurId, appVersion;
        final boolean playing, foreground, pipActive;
        Snapshot(String screen, String mediaType, String playerState, String shiurId, String appVersion, boolean playing, boolean foreground, boolean pipActive) {
            this.screen=screen; this.mediaType=mediaType; this.playerState=playerState; this.shiurId=shiurId; this.appVersion=appVersion; this.playing=playing; this.foreground=foreground; this.pipActive=pipActive;
        }
    }
}
