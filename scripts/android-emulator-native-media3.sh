#!/usr/bin/env bash
set -euo pipefail
mkdir -p emulator-report
capture() {
  adb logcat -d > emulator-report/native-media3-android.log || true
  adb shell dumpsys activity lastanr > emulator-report/native-media3-last-anr.txt || true
}
trap capture EXIT
adb install -r android/qa-native-observer/build/outputs/apk/debug/qa-native-observer-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
if [[ "${1:-}" == "tablet-display" ]]; then
  # Pixel Tablet's natural orientation is landscape. Start physically upright
  # with the system rotation lock ON before opening the real app.
  adb shell settings put system accelerometer_rotation 0
  adb shell settings put system user_rotation 1
  adb emu sensor set acceleration 9.81:0:0
fi
adb shell am start -W -n org.irgunshiuraitorah.app/.SplashActivity
node scripts/android-emulator-inspect.mjs > emulator-report/native-media3-startup.json
if [[ "${1:-}" == "soak" ]]; then
  IRGUN_NATIVE_MEDIA3_SOAK=1 timeout --signal=TERM --kill-after=15s 28m node scripts/android-emulator-native-media3.mjs
elif [[ "${1:-}" == "tablet-display" ]]; then
  IRGUN_VIDEO_DISPLAY_ONLY=1 IRGUN_TABLET_NATURAL_LANDSCAPE=1 node scripts/android-emulator-native-media3.mjs
else
  node scripts/android-emulator-native-media3.mjs
  # The native suite physically dismisses the task as its final lifecycle test.
  # This is an explicit new launch, not a retry of a failed gesture.
  adb shell am start -W -n org.irgunshiuraitorah.app/.SplashActivity
  node scripts/android-emulator-inspect.mjs > emulator-report/after-task-dismissal-startup.json
  node scripts/android-emulator-vimeo.mjs
fi
