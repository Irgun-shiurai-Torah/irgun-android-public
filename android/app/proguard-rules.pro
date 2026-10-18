# Keep only native Capacitor bridge entry points that JavaScript calls by
# their declared plugin and method names. R8 can still optimize Media3,
# Firebase, Google Identity, application implementation, and unused code.
# These rules intentionally avoid keeping the entire app package.
#
# MainActivity registers native plugins explicitly. Capacitor discovers
# @PluginMethod and callback methods reflectively; preserve their annotations.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

-keep @com.getcapacitor.annotation.CapacitorPlugin class org.irgunshiuraitorah.app.*Plugin

-keepclassmembers class org.irgunshiuraitorah.app.*Plugin {
    @com.getcapacitor.PluginMethod <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
}

# Android components named in AndroidManifest.xml (including the playback
# service and Firebase messaging service) are kept by the Android Gradle
# plugin. Dependencies provide their own consumer ProGuard rules.
