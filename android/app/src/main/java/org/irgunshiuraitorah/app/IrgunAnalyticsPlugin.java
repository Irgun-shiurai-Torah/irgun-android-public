package org.irgunshiuraitorah.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "IrgunAnalytics")
public class IrgunAnalyticsPlugin extends Plugin {
    private IrgunAnalyticsReporter reporter() { return IrgunAnalyticsReporter.get(getContext()); }

    @PluginMethod
    public void configure(PluginCall call) {
        reporter().configure(call.getString("appVersion", ""));
        call.resolve();
    }

    @PluginMethod
    public void getDeviceId(PluginCall call) {
        JSObject out = new JSObject();
        out.put("deviceId", reporter().getDeviceId());
        call.resolve(out);
    }

    @PluginMethod
    public void setState(PluginCall call) {
        reporter().updateClientState(
            call.getString("screen", "Home"),
            call.getString("mediaType", "none"),
            Boolean.TRUE.equals(call.getBoolean("isPlaying", false)),
            call.getString("playerState", "browsing"),
            call.getString("shiurId", "")
        );
        call.resolve();
    }

    @PluginMethod
    public void event(PluginCall call) {
        reporter().event(
            call.getString("eventId", ""),
            call.getString("eventType", ""),
            call.getString("shiurId", ""),
            call.getString("mediaType", "none"),
            call.getString("screen", "")
        );
        call.resolve();
    }
}
