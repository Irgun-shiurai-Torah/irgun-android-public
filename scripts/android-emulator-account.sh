#!/usr/bin/env bash
set -euo pipefail

mkdir -p emulator-report
capture() {
  adb exec-out screencap -p > emulator-report/startup.png || true

}
trap capture EXIT

adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am force-stop org.irgunshiuraitorah.app || true
adb shell am start -n org.irgunshiuraitorah.app/.SplashActivity
sleep 4
adb exec-out screencap -p > emulator-report/after-splash.png || true
node scripts/android-emulator-account.mjs
