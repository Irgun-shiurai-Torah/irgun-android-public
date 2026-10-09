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
adb shell am start -W -n org.irgunshiuraitorah.app/.SplashActivity

# Cold boot can take longer than a fixed four-second delay. Verify that the
# actual app shell has loaded before leaving it to inspect the launcher icon.
node scripts/android-emulator-inspect.mjs | tee emulator-report/webview-before-home.json
adb exec-out screencap -p > emulator-report/after-splash.png || true

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
adb shell am start -W -n org.irgunshiuraitorah.app/.SplashActivity

node scripts/android-emulator-inspect.mjs | tee emulator-report/webview.json
node scripts/android-emulator-tabs.mjs | tee emulator-report/tab-swipes.log
node scripts/android-emulator-mp4.mjs | tee emulator-report/reported-shiur.log

