#!/usr/bin/env bash
set -euo pipefail

mkdir -p emulator-report
capture() {
  adb exec-out screencap -p > emulator-report/startup.png || true
  adb logcat -d -v threadtime > emulator-report/logcat.txt || true
  adb shell dumpsys activity activities > emulator-report/activities.txt || true
  adb shell uiautomator dump /sdcard/irgun-window.xml >/dev/null 2>&1 &&
    adb pull /sdcard/irgun-window.xml emulator-report/window.xml >/dev/null 2>&1 || true
}
trap capture EXIT

adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am force-stop org.irgunshiuraitorah.app || true
adb shell am start -n org.irgunshiuraitorah.app/.SplashActivity
sleep 4
adb exec-out screencap -p > emulator-report/after-splash.png || true
node scripts/android-emulator-inspect.mjs | tee emulator-report/webview.json
node scripts/android-emulator-tabs.mjs | tee emulator-report/tab-swipes.log
