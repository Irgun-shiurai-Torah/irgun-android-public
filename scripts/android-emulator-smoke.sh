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

# Capture the actual launcher mask so the selected Torah icon can be checked
# for circle/squircle clipping on a real Android 11 emulator.
adb shell input keyevent KEYCODE_HOME
sleep 2
# Open the app drawer so the Irgun launcher icon is actually visible.
adb shell input swipe 160 610 160 120 500
sleep 2
adb shell uiautomator dump /sdcard/irgun-launcher.xml >/dev/null 2>&1 || true
adb pull /sdcard/irgun-launcher.xml emulator-report/launcher.xml >/dev/null 2>&1 || true
grep -q "Irgun Shiurai Torah" emulator-report/launcher.xml || { echo "Irgun launcher icon label was not visible in the app drawer"; exit 1; }
adb exec-out screencap -p > emulator-report/launcher-icon.png || true
adb shell am start -n org.irgunshiuraitorah.app/.SplashActivity
sleep 3

node scripts/android-emulator-inspect.mjs | tee emulator-report/webview.json
node scripts/android-emulator-tabs.mjs | tee emulator-report/tab-swipes.log
node scripts/android-emulator-auth.mjs | tee emulator-report/authenticated-session.log

node scripts/android-emulator-mp4.mjs | tee emulator-report/reported-shiur.log
