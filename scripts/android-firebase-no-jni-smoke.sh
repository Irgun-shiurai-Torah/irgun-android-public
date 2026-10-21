#!/usr/bin/env bash
set -euo pipefail

# Only run on PR experiment branches. This is a real Android instrumentation
# test, not a mocked token response. Never print the FCM token or FID.
mkdir -p emulator-report
capture() {
  adb logcat -d -v threadtime > emulator-report/firebase-no-jni-logcat.txt || true
}
trap capture EXIT

APP_APK=android/app/build/outputs/apk/debug/app-debug.apk
TEST_APK=android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
test -s "$APP_APK"
test -s "$TEST_APK"
adb install -r "$APP_APK"
adb install -r "$TEST_APK"
adb shell am force-stop org.irgunshiuraitorah.app || true
adb logcat -c

# The exit status of 'am instrument' may not reflect failed JUnit assertions;
# require JUnit's explicit success summary in addition to shell success.
adb shell am instrument -w -r \
  -e class org.irgunshiuraitorah.app.NativeDatastoreFirebaseTest \
  org.irgunshiuraitorah.app.test/androidx.test.runner.AndroidJUnitRunner \
  | tee emulator-report/firebase-no-jni-instrumentation.txt
if ! grep -Eq 'OK \(2 tests?\)' emulator-report/firebase-no-jni-instrumentation.txt; then
  echo "::error::Fresh-install Firebase Installations + FCM token test did not pass." >&2
  exit 1
fi
echo 'Firebase Installations and FCM token integration passed with JNI excluded.'
