#!/usr/bin/env bash
set -euo pipefail

mkdir -p emulator-report
capture() {
  adb exec-out screencap -p > emulator-report/startup.png || true
  adb logcat -d -v threadtime > emulator-report/logcat.txt || true
  adb shell dumpsys activity activities > emulator-report/activities.txt || true
  adb shell dumpsys activity lastanr > emulator-report/android-last-anr.txt || true
  adb shell dumpsys activity exit-info org.irgunshiuraitorah.app > emulator-report/android-process-exits.txt || true
  adb shell dumpsys meminfo org.irgunshiuraitorah.app > emulator-report/app-meminfo.txt || true
  adb shell dumpsys gfxinfo org.irgunshiuraitorah.app framestats > emulator-report/app-framestats.txt || true
  adb shell uiautomator dump /sdcard/irgun-window.xml >/dev/null 2>&1 &&
    adb pull /sdcard/irgun-window.xml emulator-report/window.xml >/dev/null 2>&1 || true
}
trap capture EXIT

adb install -r android/qa-native-observer/build/outputs/apk/debug/qa-native-observer-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am force-stop org.irgunshiuraitorah.app || true

# Check the installed launcher icon BEFORE starting the heavy WebView catalog.
# The previous order launched the full Home page and immediately sent KEYCODE_HOME
# during cold emulator/Google Play Services startup. That produced a 5s focus-loss
# ANR and extreme RenderThread pressure, obscuring the real startup/tab tests.
# Other dedicated regression jobs already cover backgrounding during playback.
adb shell input keyevent KEYCODE_HOME
drawer_ready=false
for attempt in $(seq 1 10); do
  adb shell uiautomator dump /sdcard/irgun-launcher.xml >/dev/null 2>&1 || true
  adb pull /sdcard/irgun-launcher.xml emulator-report/launcher.xml >/dev/null 2>&1 || true
  if grep -q "Irgun Shiurai Torah" emulator-report/launcher.xml 2>/dev/null; then
    drawer_ready=true
    break
  fi

  # The Pixel launcher's Apps list accessibility node is above the dock.
  # A physical tap on this virtual accessibility node does not open the
  # drawer. Swipe from the workspace above its observed bounds instead.
  drawer_point=$(python3 - <<'DRAWER_POINT'
import re
import xml.etree.ElementTree as ET
from pathlib import Path
path = Path('emulator-report/launcher.xml')
if path.exists():
    try:
        for node in ET.parse(path).iter('node'):
            a = node.attrib
            if a.get('content-desc') == 'Apps list' and a.get('clickable') == 'true':
                numbers = list(map(int, re.findall(r'\d+', a.get('bounds', ''))))
                if len(numbers) == 4:
                    print((numbers[0] + numbers[2]) // 2, (numbers[1] + numbers[3]) // 2)
                    break
    except ET.ParseError:
        pass
DRAWER_POINT
)
  if [ -n "$drawer_point" ]; then
    read -r drawer_x drawer_y <<< "$drawer_point"
    adb shell input swipe "$drawer_x" "$((drawer_y - 20))" "$drawer_x" "$((drawer_y / 4))" 500
  else
    # Fallback for launchers without an accessible drawer button. Use the
    # observed screen dimensions and start above the search/navigation area.
    read -r screen_width screen_height <<< "$(adb shell wm size | python3 -c 'import re,sys; m=re.findall(r"(\d+)x(\d+)",sys.stdin.read()); print(*m[-1])')"
    adb shell input swipe "$((screen_width / 2))" "$((screen_height * 3 / 4))" "$((screen_width / 2))" "$((screen_height / 5))" 500
  fi
  sleep 1
done
if [ "$drawer_ready" != true ]; then
  echo "Irgun launcher icon label was not visible after waiting for the app drawer"
  [ ! -f emulator-report/launcher.xml ] || cat emulator-report/launcher.xml
  exit 1
fi
adb exec-out screencap -p > emulator-report/launcher-icon.png || true

# Start the app once the launcher check is finished. Wait for the actual shell
# to load before driving native gestures; do not immediately background it again.
adb shell am start -W -n org.irgunshiuraitorah.app/.SplashActivity
node scripts/android-emulator-inspect.mjs | tee emulator-report/webview.json
adb exec-out screencap -p > emulator-report/after-splash.png || true
node scripts/android-emulator-tabs.mjs | tee emulator-report/tab-swipes.log
# Android Video is now native Media3 exclusively. Do not require the retired
# WebView <video> element or accidentally pass because a shadow MP3 advanced.
# The native test physically taps Watch, Audio and Video and requires actual
# HLS decoded frame movement and one continuous ExoPlayer position.
node scripts/android-emulator-native-media3.mjs | tee emulator-report/native-media3-startup-test.log

