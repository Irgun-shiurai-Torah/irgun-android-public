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
                ((MainActivity) getActivity()).setVideoFullscreen(enabled,
                    Boolean.TRUE.equals(call.getBoolean("fromSensor", false)));
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void livePlayback(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity)
                ((MainActivity)getActivity()).setLiveVideoPlaying(
                    Boolean.TRUE.equals(call.getBoolean("playing", false)));
            call.resolve();
        });
    }

    @PluginMethod
    public void playback(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity)
                ((MainActivity)getActivity()).setVideoDisplayPresentation(
                    Boolean.TRUE.equals(call.getBoolean("active", false)),
                    Boolean.TRUE.equals(call.getBoolean("playing", false)),
                    Boolean.TRUE.equals(call.getBoolean("expanded", false)),
                    Boolean.TRUE.equals(call.getBoolean("nativeEngine", false)));
            call.resolve();
        });
    }
}
