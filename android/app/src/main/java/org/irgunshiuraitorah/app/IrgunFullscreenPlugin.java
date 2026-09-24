package org.irgunshiuraitorah.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "IrgunFullscreen")
public class IrgunFullscreenPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled"));
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).setVideoFullscreen(enabled);
            }
            call.resolve();
        });
    }
}
