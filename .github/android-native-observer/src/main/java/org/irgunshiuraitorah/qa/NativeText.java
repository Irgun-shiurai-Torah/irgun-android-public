package org.irgunshiuraitorah.qa;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.os.Bundle;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;

/** Actual Android keyboard events, with key-up queued before waiting for UI work. */
public class NativeText extends Instrumentation {
    private String text;
    @Override public void onCreate(Bundle args) {
        super.onCreate(args); text = args.getString("text"); start();
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            if (text == null || !text.matches("[A-Z0-9]"))
                throw new IllegalArgumentException("One lecture search character required");
            UiAutomation ui = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
            KeyEvent[] events = KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD).getEvents(text.toCharArray());
            if (events == null) throw new IllegalStateException("No physical key mapping");
            // adb input text waits for DOWN to finish before injecting UP. On a
            // slow WebView this unintentionally holds the key past auto-repeat.
            // Queue every mapped DOWN/UP in order without holding any key. The
            // caller verifies the real field after each character; no retries.
            for (KeyEvent event : events)
                if (!ui.injectInputEvent(event, false)) throw new IllegalStateException("Android rejected key event");
            result.putString("text", text);
            finish(-1, result);
        } catch (Throwable error) {
            result.putString("error", error.toString()); finish(0, result);
        }
    }
}
