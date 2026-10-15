package org.irgunshiuraitorah.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

public class SplashActivity extends Activity {
    public static final String EXTRA_OPEN_EXISTING_PLAYBACK = "org.irgunshiuraitorah.app.OPEN_EXISTING_PLAYBACK";
    private static final long SPLASH_DURATION_MS = 1350L;
    private static boolean splashShownThisProcess = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Warm reopen must not send another Intent through an already-running
        // Capacitor BridgeActivity. Doing so calls BridgeActivity.onNewIntent() while
        // the WebView is resuming and was the one path shared by launcher and media
        // notification reopen crashes. Starting this lightweight launcher already
        // brings the task to the foreground; if MainActivity is alive, just finish
        // this activity and reveal the existing instance underneath.
        if (MainActivity.isInstanceAlive()) {
            finish();
            overridePendingTransition(0, 0);
            return;
        }

        boolean playbackOpen = getIntent() != null
            && getIntent().getBooleanExtra(EXTRA_OPEN_EXISTING_PLAYBACK, false);

        // If the service kept the process alive but Android reclaimed MainActivity,
        // create one fresh BridgeActivity instead of replaying the splash. Media3
        // remains alive and the fresh JS bridge can pull its current playback state.
        if (splashShownThisProcess || playbackOpen) {
            splashShownThisProcess = true;
            openMain(false);
            return;
        }

        splashShownThisProcess = true;
        setContentView(R.layout.activity_splash);
        new Handler(Looper.getMainLooper()).postDelayed(() -> openMain(true), SPLASH_DURATION_MS);
    }

    private void openMain(boolean animate) {
        Intent intent = new Intent(SplashActivity.this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        if (animate) overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
        finish();
    }

    @Override
    public void onBackPressed() {
        // Do nothing while the short branded splash is visible.
    }
}
