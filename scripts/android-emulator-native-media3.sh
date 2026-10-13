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
adb shell am start -W -n org.irgunshiuraitorah.app/.SplashActivity
node scripts/android-emulator-inspect.mjs > emulator-report/native-media3-startup.json
node scripts/android-emulator-native-media3.mjs
