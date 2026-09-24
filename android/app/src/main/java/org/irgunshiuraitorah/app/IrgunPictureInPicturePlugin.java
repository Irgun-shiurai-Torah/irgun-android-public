package org.irgunshiuraitorah.app;

import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "IrgunPictureInPicture")
public class IrgunPictureInPicturePlugin extends Plugin {
    private static volatile boolean pipEligible = false;

    @Override
    public void load() {
        pipEligible = false;
        super.load();
    }

    @Override
    protected void handleOnDestroy() {
        pipEligible = false;
        super.handleOnDestroy();
    }


    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
        call.resolve(result);
    }

    @PluginMethod
    public void setEligible(PluginCall call) {
        pipEligible = Boolean.TRUE.equals(call.getBoolean("active"));
        JSObject result = new JSObject();
        result.put("active", pipEligible);
        call.resolve(result);
    }

    public static boolean isPipEligible() {
        return pipEligible;
    }

    @PluginMethod
    public void enter(PluginCall call) {
        MainActivity activity = getActivity() instanceof MainActivity ? (MainActivity) getActivity() : null;
        if (activity == null) {
            JSObject result = new JSObject();
            result.put("entered", false);
            call.resolve(result);
            return;
        }
        activity.runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("entered", activity.enterIrgunPictureInPicture());
            call.resolve(result);
        });
    }
}
