package org.irgunshiuraitorah.app;

/** JDK-only behavioral tests for the actual native URL policy. */
public final class NativeVideoSourcePolicyTest {
    private static int checked;

    private static void assertAllowed(String url) {
        checked++;
        if (!NativeVideoSourcePolicy.isPermitted(url))
            throw new AssertionError("Expected approved media source: " + url);
    }

    private static void assertRejected(String url) {
        checked++;
        if (NativeVideoSourcePolicy.isPermitted(url))
            throw new AssertionError("Unsafe or unrelated source allowed: " + url);
    }

    public static void main(String[] args) {
        // Existing Worker-hosted Drive-backed lectures must keep playing.
        assertAllowed("https://api.irgunshiuraitorah.com/media/1234/hls/master.m3u8");
        assertAllowed("https://api.irgunshiuraitorah.com/media/1234/video.mp4?token=signed");

        // Vimeo recorded-video URLs returned by our own Worker. Tested against
        // an actual 1237352749 API response (HLS /play/, MP4 redirect).
        assertAllowed("https://player.vimeo.com/play/1237352749.m3u8?exp=123&signature=abc");
        assertAllowed("https://player.vimeo.com/progressive_redirect/playback/1237352749/720p?key=abc");
        assertAllowed("https://player.vimeo.com/external/1237352749.hd.mp4?s=signed");
        assertAllowed("https://vod-adaptive-ak.vimeocdn.com/exp=123/path/master.m3u8");
        assertAllowed("https://download-video-ak.vimeocdn.com/video.mp4?token=signed");

        // HTTPS and Vimeo ownership are mandatory. Never weaken the existing
        // native bridge into an arbitrary HTTPS URL loader.
        assertRejected(null);
        assertRejected("");
        assertRejected("not-a-url");
        assertRejected("http://player.vimeo.com/play/123.m3u8");
        assertRejected("https://player.vimeo.com.evil.example/play/123.m3u8");
        assertRejected("https://evil.example/player.vimeo.com/play/123.m3u8");
        assertRejected("https://vimeocdn.com.evil.example/seg.ts");
        assertRejected("https://evil-vimeocdn.com/seg.ts");
        assertRejected("https://evil.example/video.mp4");
        assertRejected("https://user:pass@player.vimeo.com/play/123.m3u8");
        assertRejected("https://user@api.irgunshiuraitorah.com/media/1234/master.m3u8");
        assertRejected("https://player.vimeo.com:8080/play/123.m3u8");
        assertRejected("https://api.irgunshiuraitorah.com:8080/media/1234/master.m3u8");
        assertRejected("https://player.vimeo.com/video/1237352749");
        assertRejected("https://player.vimeo.com/settings");
        assertRejected("https://player.vimeo.com/");
        assertRejected("https://www.vimeo.com/1237352749");
        assertRejected("https://api.irgunshiuraitorah.com/play/1234");
        assertRejected("https://api.irgunshiuraitorah.com/mediafile/1234");
        assertRejected("https://api.irgunshiuraitorah.com/media");
        assertRejected("https://player.vimeo.com/play/123#fragment");
        System.out.println("PASS: " + checked + " native URL policy cases");
    }
}
