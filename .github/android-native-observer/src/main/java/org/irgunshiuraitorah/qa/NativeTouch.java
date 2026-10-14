package org.irgunshiuraitorah.qa;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;

/** Send actual Android touchscreen events from a separate QA APK, never app commands. */
public class NativeTouch extends Instrumentation {
    private Bundle arguments;
    @Override public void onCreate(Bundle args) { super.onCreate(args); arguments=args; start(); }
    private void event(UiAutomation ui, long down, int action, float x, float y) {
        MotionEvent event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,x,y,0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try { if(!ui.injectInputEvent(event,true)) throw new IllegalStateException("Android rejected touch event"); }
        finally { event.recycle(); }
    }
    @Override public void onStart() {
        Bundle result=new Bundle();
        try {
            float x=Float.parseFloat(arguments.getString("x")), y=Float.parseFloat(arguments.getString("y"));
            UiAutomation ui=getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
            long first=SystemClock.uptimeMillis();
            event(ui,first,MotionEvent.ACTION_DOWN,x,y); SystemClock.sleep(25);
            event(ui,first,MotionEvent.ACTION_UP,x,y); SystemClock.sleep(80);
            long second=SystemClock.uptimeMillis();
            if(second-first>250) throw new IllegalStateException("Double tap injection exceeded Android interval");
            event(ui,second,MotionEvent.ACTION_DOWN,x,y); SystemClock.sleep(25);
            event(ui,second,MotionEvent.ACTION_UP,x,y);
            result.putLong("tapIntervalMs",second-first);
            result.putString("gesture","double-tap");
            finish(-1,result);
        } catch(Throwable error) { result.putString("error",error.toString()); finish(0,result); }
    }
}
