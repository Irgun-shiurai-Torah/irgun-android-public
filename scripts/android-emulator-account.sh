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
# Default to the ordinary minified debug variant. The Samsung tablet QA
# explicitly installs the R8-optimised release variant with a QA-only
# debuggable flag; normal Play Store APKs remain non-debuggable.
adb install -r "${IRGUN_ANDROID_TEST_APK:-android/app/build/outputs/apk/debug/app-debug.apk}"
adb logcat -c
# Avoid console/HTTP dumps in the credential-bearing account run.
adb logcat -v threadtime -s 'IrgunPlayback:V' 'AndroidRuntime:E' 'IrgunQAAudioFocus:I' '*:S' > emulator-report/android-playback.log &
log_pid=$!
adb shell am force-stop org.irgunshiuraitorah.app || true
adb shell am start -n org.irgunshiuraitorah.app/.SplashActivity
sleep 4
adb exec-out screencap -p > emulator-report/after-splash.png || true
export IRGUN_KEEP_QA_SESSION=1
# A confirmed Android 14 emulator failure was NOT an application crash:
# ActivityManager terminated the app because the emulator's Google Play
# Services FontsProvider process died (DEPENDENCY DIED). Do not treat other
# failures as infrastructure, and never replay account mutations.
if ! node scripts/android-emulator-account.mjs; then
  adb shell dumpsys activity exit-info org.irgunshiuraitorah.app > emulator-report/android-exit-before-retry.txt || true
  if node --input-type=module - <<'NODE'
import {readFileSync} from 'node:fs';
let allowed=false;
try {
  const report=JSON.parse(readFileSync('emulator-report/account.json','utf8'));
  const exit=readFileSync('emulator-report/android-exit-before-retry.txt','utf8');
  const earlyRoute=/^Signed-in Android route crashed\/stalled on /.test(String(report.stage||''));
  const noMutations=!report.accountMutationsStartedAt;
  const vanished=/pidof org\.irgunshiuraitorah\.app|process disappeared/.test(String(report.error||''));
  const entries=exit.split(/(?=ApplicationExitInfo #\d+:)/);
  const externalGmsProviderDeath=entries.some(entry =>
    /process=org\.irgunshiuraitorah\.app reason=12 \(DEPENDENCY DIED\)/.test(entry) &&
    /depends on provider com\.google\.android\.gms\/\.fonts\.provider\.FontsProvider in dying proc com\.google\.android\.gms\.persistent/.test(entry)
  );
  allowed=earlyRoute&&noMutations&&vanished&&externalGmsProviderDeath;
} catch (_) { allowed=false; }
if (!allowed) process.exit(1);
console.log('Detected external emulator GMS FontsProvider death before account mutations: retry full native account suite once.');
NODE
  then
    # Preserve both the original failure and the recovered test report. The
    # second attempt must execute every actual UI/account/playback assertion;
    # never mark a partial run green.
    cp emulator-report/account.json emulator-report/account-external-provider-first-attempt.json
    cp emulator-report/account-android-errors.log emulator-report/account-external-provider-first-attempt.log 2>/dev/null || true
    adb shell am force-stop org.irgunshiuraitorah.app || true
    adb shell pm clear org.irgunshiuraitorah.app
    adb shell am start -n org.irgunshiuraitorah.app/.SplashActivity
    sleep 5
    node scripts/android-emulator-account.mjs
  else
    echo 'Account regression failed for a cause other than the confirmed external GMS provider death; not retrying.'
    exit 1
  fi
fi
# Exercise the already-entitled Belsky purchased lectures on the real native
# Media3 player when this CI account has the collection. No new purchase.
node scripts/android-emulator-paid-playback.mjs
# A separate signed-in playback report uses the same real media assertions as
# the logged-out matrix. Never substitute account/API responses for playback.
export IRGUN_EXPECT_SIGNED_IN=1
node scripts/android-emulator-mp4.mjs > emulator-report/handoff-baseline.json
node scripts/android-regression-extensions.mjs
