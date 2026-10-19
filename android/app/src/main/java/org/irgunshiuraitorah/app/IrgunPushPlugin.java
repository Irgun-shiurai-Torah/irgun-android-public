package org.irgunshiuraitorah.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
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
    // Android 13+ permission is a platform permission. Do not look it up via
    // Capacitor's reflective permission-state lookup: on R8-optimized builds
    // that path saw missing plugin annotation metadata and threw NPE in
    // Bridge.getPermissionStates() on the native plugin HandlerThread.
    // That fatal exception happened after account sign-in (while hydrating
    // user-specific notification settings) on Samsung Android 16.
    private boolean isNotificationPermissionGranted() {
        if (Build.VERSION.SDK_INT < 33) return true;
        android.content.Context context = getContext();
        return context != null
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", isNotificationPermissionGranted());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (isNotificationPermissionGranted()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        try {
            // Capacitor's alias request still needs the reflected metadata.
            // Reject gracefully instead of letting a missing annotation
            // bring down the entire Android process.
            if (getPluginHandle() == null || getPluginHandle().getPluginAnnotation() == null) {
                call.reject("Notification permission metadata is unavailable.");
                return;
            }
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
        } catch (RuntimeException error) {
            call.reject("Could not request notification permission.", error);
        }
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", isNotificationPermissionGranted());
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
