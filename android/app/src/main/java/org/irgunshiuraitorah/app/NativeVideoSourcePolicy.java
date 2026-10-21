package org.irgunshiuraitorah.app;

import java.net.URI;
import java.util.Locale;

/**
 * Native Media3 can play the Worker-hosted Drive recordings as before, plus
 * recorded Vimeo play URLs returned by our own Worker source descriptor.
 *
 * This validation is intentionally host- and path-specific: it must not accept
 * arbitrary HTTPS URLs, Vimeo iframe pages, or lookalike hostnames.
 *
 * The signed Vimeo "play" URLs begin at player.vimeo.com and may redirect to
 * Vimeo-owned subdomains of vimeocdn.com. No token enters the Android app.
 */
public final class NativeVideoSourcePolicy {
    private static final String API_HOST = "api.irgunshiuraitorah.com";
    private static final String VIMEO_PLAYER_HOST = "player.vimeo.com";
    private static final String VIMEO_CDN_SUFFIX = ".vimeocdn.com";

    private NativeVideoSourcePolicy() {}

    public static boolean isPermitted(String url) {
        if (url == null || url.isEmpty()) return false;
        try {
            URI uri = URI.create(url);
            if (!"https".equalsIgnoreCase(uri.getScheme())
                || uri.getRawUserInfo() != null || uri.getRawFragment() != null
                || (uri.getPort() != -1 && uri.getPort() != 443)) return false;

            String host = uri.getHost();
            String path = uri.getPath();
            if (host == null || path == null || path.length() < 2) return false;
            host = host.toLowerCase(Locale.ROOT);

            if (API_HOST.equals(host)) {
                // Existing Drive-backed media source. Keep its original scope.
                return path.startsWith("/media/");
            }
            if (VIMEO_PLAYER_HOST.equals(host)) {
                // Video API "play.hls.link" and "play.progressive[].link":
                // Vimeo issues /play/... and /progressive_redirect/... URLs.
                // Some older recorded videos use /external/... media URLs.
                return path.startsWith("/play/")
                    || path.startsWith("/progressive_redirect/")
                    || path.startsWith("/external/");
            }
            // Vimeo may return a direct CDN URL on other recorded videos.
            // Match a true DNS suffix, not e.g. vimeocdn.com.evil.example.
            return host.endsWith(VIMEO_CDN_SUFFIX)
                && host.length() > VIMEO_CDN_SUFFIX.length();
        } catch (IllegalArgumentException error) {
            return false;
        }
    }
}
