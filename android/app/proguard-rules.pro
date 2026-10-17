# Keep only the native Capacitor bridge entry points that JavaScript calls by
# their declared plugin and method names. R8 can still optimize the Media3,
# Firebase, Google Identity, application implementation, and unused code.
# Unlike a blanket '-keep class org.irgunshiuraitorah.app.** { *; }' these
# narrow rules permit meaningful DEX obfuscation.
#
# Native plugin classes are explicitly registered in MainActivity.onCreate.
# Capacitor discovers @PluginMethod and callback methods reflectively.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

-keep @com.getcapacitor.annotation.CapacitorPlugin class org.irgunshiuraitorah.app.*Plugin

-keepclassmembers class org.irgunshiuraitorah.app.*Plugin {
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
}

# Android components named in AndroidManifest.xml (including MediaSession
# service and Firebase messaging service) are kept by the Android Gradle
# plugin. Dependencies supply their own consumer ProGuard rules. Do not
# disable shrinking or keep entire SDK packages.
