#!/usr/bin/env bash
set -euo pipefail

mkdir -p emulator-report
capture() {
  adb logcat -d > emulator-report/hls-android.log || true
  adb shell dumpsys activity lastanr > emulator-report/hls-last-anr.txt || true
}
trap capture EXIT

adb install -r android/qa-native-observer/build/outputs/apk/debug/qa-native-observer-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am start -W -n org.irgunshiuraitorah.app/.SplashActivity
node scripts/android-emulator-inspect.mjs > emulator-report/hls-startup.json
if [[ "${1:-}" == "soak" ]]; then
  IRGUN_SOAK_TO_AUDIO=1 timeout --signal=TERM --kill-after=10s 8m node scripts/android-emulator-hls.mjs > emulator-report/handoff-soak.json
  test -s emulator-report/handoff-soak.json
  node scripts/android-emulator-soak.mjs
else
  node scripts/android-emulator-hls.mjs
fi
