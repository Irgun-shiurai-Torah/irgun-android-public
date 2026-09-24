package org.irgunshiuraitorah.app;

/**
 * V15.1.1 compatibility shell. The legacy IrgunMediaSession implementation owned
 * a second MediaSession/notification and is intentionally retired. New builds use
 * IrgunPlaybackPlugin + IrgunPlaybackService. Old installed app versions are not
 * affected because this only ships inside the new APK/AAB.
 */
public final class IrgunMediaSessionPlugin {
    private IrgunMediaSessionPlugin() {}
}
