# Android QA coverage and verification

This is a coverage audit, not a claim that the expanded suite has passed.
All new emulator checks below are pending on the PR head until their actual
reports, logs and screenshots are inspected. Local unit checks are separate.
Do not merge this PR based on unit tests or a green subset of matrix jobs.

## Evidence checked

- Main production tree `7fbf1982eae458f2fbb18468a9fd2dd6b1748941`:
  [run #72](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38183037078)
  had 12 successful jobs. Its downloaded reports prove 10 baseline and 17
  extension checks on API 30/34/35/36, five HLS checks on each API, native QA
  account checks on API 30, HTTP media checks and a real 900,088 ms audio soak.
  This does **not** cover every item in the user's complete checklist.
- [Run #73](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38184980367):
  native API 36 failed before opening the lecture, with zero playback checks.
  HLS API 36 passed separately. Its missing later scenarios are unverified.
- [Run #74](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38186221735):
  completed with **11 successful jobs and one failed native API 35 job**.
  The actual failed log/report says the Watch target did not settle; no tap
  was performed. The failure screenshot is a different lecture, and zero
  baseline playback checks completed. The collected native crash buffer is empty.
  Neither this failed job nor later scenarios it never reached count as passes.
- [PR #35](https://github.com/Irgun-shiurai-Torah/irgun-android-public/pull/35)
  remains draft. Its newer source and expanded tests need new emulator evidence.

## Checklist audit

| Requested area | Previously verified in actual Android runs | New assertions awaiting emulator evidence | Still outside complete verification |
| --- | --- | --- | --- |
| 1. Audio/Video switching | Automatic continuation, repeated switches, clocks, decoded moving picture and single audible output | Same scenarios in separate logged-in and logged-out matrices; video-selected rates across both handoffs | Immediate first-frame latency has no strict user-visible deadline assertion |
| 2. Home/background/reopen | Video to native background Audio; notification reopening; audio-only Home/reopen during soak | Both account states on API 30/34/35/36 | Hardware-specific background policies |
| 3. Notification | Actual posted notification/title tap; OS MediaSession Play/Pause and 15-second skips; native clock | Physical Android notification buttons and its visible elapsed timer; denied/granted notification permission on API 34/35/36 | Physical headset/Bluetooth buttons |
| 4. Mini/full/PiP | Three mini/full cycles, real Android PiP, moving frames, unchanged player count | True WebView fullscreen/Android Back; portrait/landscape video; mini/full cycles during 15-minute soak | Full player layout on every small-screen/device configuration |
| 5. Account | Native QA login/name/restart, likes/later/follows/history/logout/relogin; playlist creation; real independent API sessions | Native incorrect-password error; playlist add/remove checked independently on server, temporary playlist cleanup; actual app token revocation and restart; account plus playback on all four APIs | Time-based expiry (actual revocation is the covered alternative); playlist rename has no current UI |
| 6. Comments | Native owner create/edit/delete, anonymous/invalid rejection and fresh API session checks | Deleted comment absent after actual process restart and successful comment reload; temporary comments cleaned | Denial for a second **valid different user** requires another approved QA account |
| 7. HLS | Real decoded moving frames; actual selected variant; localhost CORS | Actual Vimeo network requests blocked while HLS and quality change still work | Additional lecture/quality combinations outside fixed real fixtures |
| 8. Offline | Full real MP3 downloaded, local URI/bytes, network disabled, advancing native clock and physical delete | Force-stop/relaunch while offline, reopen saved file from Library; real authenticated server history after reconnect, bounded against current native clock | Native download retry branch has unit proof; prior complete downloads needed one attempt only |
| 9. Speed/controls | Native 1.25/1.5/2x, settings restart, 15-second skips, actual mid-lecture seek and Pause/Play | Fresh 1x assertion before any rate change; native Video speed popup and both handoffs; near-end seek/pause/resume/restore | End-of-lecture completion/queue transitions |
| 10. Internet | Wi-Fi/data off/on and clock/frame recovery | Actual WebView transport throttling with transferred-byte/latency evidence; unbuffered HLS request failure and recovery | Every prolonged or unstable cellular pattern |
| 11. Hebrew/English | Real narrow 240x320 navigation, RTL and language toggle | Actual player accessible labels and moving playback in both languages; native account translated controls and unchanged identity | Full translation review of every app page, message and catalog name |
| 12. Reliability | Real 15-minute Audio, locks/unlocks, Home/reopen, unchanged PID, memory samples | Repeated Audio/Video and mini/full during that real 15-minute interval; declared memory budget asserted | A 30-minute continuous video run and long-term memory-leak investigation |
| 13. Android specifics | Basic notification/session and lock/background behavior | Separate foreground Android QA app takes real transient audio focus and plays a tone; pause/resume tested; Doze, rotation, Back and notification permission checks | Real calls/call audio, Bluetooth hardware, physical headphone disconnect, manufacturer battery restrictions |
| 14. Devices | Actual emulators API 30/34/35/36 (Android 11/14/15/16) | Separate logged-out playback and sequential logged-in account/playback matrix on all four APIs | A physical Cat S22 Flip or other hardware phone |

## Fixes in this PR

1. Preserve Home search text/focus/cursor across unrelated background renders.
   The test must observe actual focused input, typed value and correct search
   screen/query before opening the explicit Watch button.
2. Native taps require two stable, hit-tested DOM/native geometry observations.
3. A user selection in the Video speed popup updates the shared preference and
   native player. Internal catch-up rates do not overwrite the preference.
4. Add missing Hebrew HLS control translations and translate dynamically updated
   Play/Pause and Mute/Unmute accessible labels.

None of those production fixes has a new emulator pass until the new run finishes.

## Reporting rules and test limits

- The matrix uses physical ADB gestures. CDP observes real state; transport
  blocking/throttling changes the real WebView network without fake responses.
- Logged-in playback explicitly asserts an authenticated state; logged-out
  playback explicitly asserts the opposite. The same QA account runs sequentially.
- A second QA session reads actual server history/playlists; in-memory optimistic
  state alone is insufficient. A stale history position ahead of the live native
  clock cannot satisfy the new synchronization assertions.
- Each extension scenario records its expected behavior, pass/fail state, actual
  snapshot on failure, timestamp and screenshot path. Original failures remain.
- QA audio-focus Activity belongs to the separate observer APK and is absent from
  production builds. No native service playback behavior is replaced for testing.
- The real 15-minute soak checks PSS <=384 MiB and growth <=128 MiB. This is a
  regression budget, not proof that every possible memory leak is absent.
- No assertions are disabled; zero executed scenarios cannot produce a passed
  extension report. Logs and reports must be read before final Pass/Fail claims.
- Temporary comments/playlists created by this run are removed; credentials and
  actual app tokens remain in memory and are never written to artifacts.
