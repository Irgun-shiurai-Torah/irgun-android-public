#!/usr/bin/env bash
set -euo pipefail

mkdir -p emulator-report
log_pid=''
capture() {
  if [[ -n "$log_pid" ]]; then
    kill "$log_pid" 2>/dev/null || true
    wait "$log_pid" 2>/dev/null || true
  fi
  adb logcat -d -b crash > emulator-report/android-crashes.log || true
  adb shell dumpsys activity lastanr > emulator-report/android-last-anr.txt || true
  adb shell dumpsys activity exit-info org.irgunshiuraitorah.app > emulator-report/android-process-exits.txt || true
  adb exec-out screencap -p > emulator-report/startup.png || true

}
trap capture EXIT

adb install -r android/qa-native-observer/build/outputs/apk/debug/qa-native-observer-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
# Avoid console/HTTP dumps in the credential-bearing account run.
adb logcat -v threadtime -s 'IrgunPlayback:V' 'AndroidRuntime:E' 'IrgunQAAudioFocus:I' '*:S' > emulator-report/android-playback.log &
log_pid=$!
adb shell am force-stop org.irgunshiuraitorah.app || true
adb shell am start -n org.irgunshiuraitorah.app/.SplashActivity
sleep 4
adb exec-out screencap -p > emulator-report/after-splash.png || true
export IRGUN_KEEP_QA_SESSION=1
node scripts/android-emulator-account.mjs
# A separate signed-in playback report uses the same real media assertions as
# the logged-out matrix. Never substitute account/API responses for playback.
export IRGUN_EXPECT_SIGNED_IN=1
node scripts/android-emulator-mp4.mjs > emulator-report/handoff-baseline.json
node scripts/android-regression-extensions.mjs
