#!/usr/bin/env bash
set -euo pipefail

mkdir -p emulator-report
# The emulator-runner executes separate script lines in separate shells. Keep
# this EXIT trap in the same shell as the tests so it captures the final logs.
trap 'adb logcat -d > emulator-report/android-playback.log || true' EXIT

adb install -r android/qa-native-observer/build/outputs/apk/debug/qa-native-observer-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am force-stop org.irgunshiuraitorah.app || true
adb shell am start -W -n org.irgunshiuraitorah.app/.SplashActivity
node scripts/android-emulator-inspect.mjs > emulator-report/startup.json
node scripts/android-emulator-mp4.mjs > emulator-report/handoff-baseline.json
node scripts/android-regression-extensions.mjs
