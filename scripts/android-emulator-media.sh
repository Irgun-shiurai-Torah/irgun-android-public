#!/usr/bin/env bash
set -euo pipefail

mkdir -p emulator-report
# Stream the playback/bridge trace from the beginning; the bounded Android
# ring buffer can discard the first failure during later independent checks.
log_pid=''
capture() {
  if [[ -n "$log_pid" ]]; then
    kill "$log_pid" 2>/dev/null || true
    wait "$log_pid" 2>/dev/null || true
  fi
  adb logcat -d -b crash > emulator-report/android-crashes.log || true
}
trap capture EXIT

adb install -r android/qa-native-observer/build/outputs/apk/debug/qa-native-observer-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb logcat -v threadtime -s 'IrgunPlayback:V' 'Capacitor/Console:V' 'Capacitor/Plugin:V' 'Capacitor:V' 'AndroidRuntime:E' 'ActivityManager:I' 'ActivityTaskManager:I' '*:S' > emulator-report/android-playback.log &
log_pid=$!
adb shell am force-stop org.irgunshiuraitorah.app || true
adb shell am start -W -n org.irgunshiuraitorah.app/.SplashActivity
node scripts/android-emulator-inspect.mjs > emulator-report/startup.json
node scripts/android-emulator-mp4.mjs > emulator-report/handoff-baseline.json
node scripts/android-regression-extensions.mjs
