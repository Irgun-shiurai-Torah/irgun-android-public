package org.irgunshiuraitorah.qa;

import android.app.Activity;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Bundle;
import android.os.Handler;
import android.util.Log;
import android.widget.TextView;

/** A separate foreground QA audio app: real OS focus and an audible test tone. */
public class AudioFocusActivity extends Activity {
    private AudioManager manager;
    private AudioFocusRequest request;
    private ToneGenerator tone;
    private boolean started;
    private final Handler handler = new Handler();
    private final Runnable finishProbe = this::finish;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView label = new TextView(this);
        label.setText("Irgun QA: another audio app holds transient audio focus for 8 seconds");
        setContentView(label);
        manager = (AudioManager) getSystemService(AUDIO_SERVICE);
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (!focused || started) return;
        started = true;
        // API 35+ requires the requesting audio app to be in the foreground.
        request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            .setOnAudioFocusChangeListener(change -> Log.i("IrgunQAAudioFocus", "focus=" + change))
            .build();
        int result = manager.requestAudioFocus(request);
        Log.i("IrgunQAAudioFocus", "requestResult=" + result);
        if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            tone = new ToneGenerator(AudioManager.STREAM_MUSIC, 15);
            boolean started = tone.startTone(ToneGenerator.TONE_DTMF_0, 8000);
            Log.i("IrgunQAAudioFocus", "toneStarted=" + started);
        }
        handler.postDelayed(finishProbe, 8000);
    }

    @Override public void onDestroy() {
        handler.removeCallbacks(finishProbe);
        if (tone != null) { tone.stopTone(); tone.release(); }
        if (manager != null && request != null) manager.abandonAudioFocusRequest(request);
        super.onDestroy();
    }
}
