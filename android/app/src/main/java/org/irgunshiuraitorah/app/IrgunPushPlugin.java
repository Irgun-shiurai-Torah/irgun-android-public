package org.irgunshiuraitorah.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(
    name = "IrgunPush",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class IrgunPushPlugin extends Plugin {
    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED;
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject ret = new JSObject(); ret.put("granted", true); call.resolve(ret); return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        try {
            FirebaseApp app;
            try {
                app = FirebaseApp.getInstance();
            } catch (IllegalStateException notInitialized) {
                app = FirebaseApp.initializeApp(getContext());
            }
            if (app == null) {
                call.reject("Firebase push is not configured on this app.");
                return;
            }
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful()) {
                    Exception error = task.getException();
                    if (error != null) call.reject("Could not get Firebase push token", error);
                    else call.reject("Could not get Firebase push token");
                    return;
                }
                String token = task.getResult();
                if (token == null || token.isEmpty()) {
                    call.reject("Firebase did not return a push token.");
                    return;
                }
                JSObject ret = new JSObject();
                ret.put("token", token);
                call.resolve(ret);
            });
        } catch (Exception error) {
            // Never let a Firebase configuration/runtime problem close the app.
            call.reject("Could not initialize Firebase push notifications", error);
        }
    }

    @PluginMethod
    public void getPendingUrl(PluginCall call) {
        Intent intent = getActivity().getIntent();
        String url = intent != null ? intent.getStringExtra("url") : null;
        JSObject ret = new JSObject();
        ret.put("url", url == null ? "" : url);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearPendingUrl(PluginCall call) {
        Intent intent = getActivity().getIntent();
        if (intent != null) intent.removeExtra("url");
        call.resolve();
    }
}
