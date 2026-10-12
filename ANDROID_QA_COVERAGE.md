# Android QA coverage and verification

This is a coverage audit, not a claim that the expanded suite has passed.
The latest inspected runtime evidence is recorded below. Checks on a newer PR
head remain pending until its actual reports, logs and screenshots are inspected.
Local unit checks are separate.
Do not merge this PR based on unit tests or a green subset of matrix jobs.

Latest inspected attempt: [regression #80](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38276337676)
had **7 successful jobs and 8 failed jobs**. Native preparation and compilation
passed. Actual HLS passed on all four APIs; mixed 15-minute reliability and
startup #120 passed. Native account scenarios now ran, including real login.
Remaining failures and their corrections are recorded in the final section.
The separate signed-in media suite remains unexecuted because its preceding
account jobs failed. New corrections require a complete new emulator run.

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

Verification differs by commit; the dated run sections below record actual
passes and failures. New corrections require new runtime evidence.

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

## Run #75 failures and the next fix attempt

[Run #75](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38223770685)
is a failed attempt, not proof that the expanded checklist passes.
The actual reports/logs and failure images establish:

| Device/job | Expected | Actual evidence | New change; runtime result pending |
| --- | --- | --- | --- |
| API 30 and 34 native media | Back exits true video fullscreen and retains the lecture | Activity destroyed after Back; WebView observer disconnects. Later scenarios cannot be counted as executed playback passes | Consume native Back during fullscreen and call the actual document fullscreen exit |
| API 35 native media | Audio to Video at the ten-minute position completes with moving synchronized picture | First frames appeared about ten seconds after the seek. Fixed 2x catch-up was still behind Audio when the unchanged 15s deadline expired; it rolled back to Audio | Adapt bounded catch-up to measured clock drift; restore user speed; tighten synchronization to one second |
| API 36 native media | Physical keyboard enters IST-DL6067 completely | Actual focused input contained I-DL6067, missing S/T; zero baseline playback checks completed | Defer background Home renders while the original input connection is focused; observe each real native key without retries or DOM text setters |
| API 30 startup | Read-only search/playback state exists in the disposable APK | Startup workflow never appended the observer now required by the shared baseline; screen/query were undefined | Append the same read-only observer before building the startup APK |
| Native QA account and independent comment/session probes | Valid login returns HTTP 200 and creates a real session | Native UI login failed and independent API requests returned HTTP 500, Login failed. Wrong-password rejection passed | Still blocked by the shared authentication server; Android-side success must not be substituted. Actual backend exception is required to confirm its cause |

Run #75's API 30 and 34 baseline reports contain 11 completed real playback
checks. Their repeated-switch, near-end seek and Video-selected speed handoff
scenarios passed before fullscreen Back destroyed the Activity. Later failures
from the disconnected observer are consequences of that original failure,
not independent verified failures of every playback feature.
API 35's baseline completed nine checks before the real handoff rollback.
Actual moving HLS/quality changes with blocked Vimeo transport passed on API
30/34/35 in the reviewed reports; all production changes below require a new run.

## Initial video loading request

The user reported Play for a second, wait, Play briefly, wait again, then stable
playback. The new initial Play transaction waits for **six seconds of actual
buffered media at 1x**, twelve at 2x, or the remaining duration for a near-end
resume. Metadata or a resolved Play promise alone cannot release it.
Play requests while preparing the same buffer share one transaction. Pause,
Home and Audio handoff cancel the pending Play. Buffer timeout remains a real
failure with a visible retry message; there is no forced successful response.

The new real HLS test records required buffer/actual buffer at first Play and
then requires moving decoded frames/clock without repeated waiting during
initial playback. Those emulator assertions remain pending until the new run.
The six-second buffer reduces startup stop/start behavior; it cannot guarantee
uninterrupted playback through every later network outage.

Local validation for this attempt: 104 checks passed with zero skips, including
real-function regression models for a ten-second decoder delay, native key loss,
fullscreen exit, initial byte buffering, cancellation and timeout. Vite build,
syntax/YAML and whitespace checks pass. These are not emulator passes.

## Run #76: shared startup-buffer regression

The expanded matrix contains 15 jobs rather than the original 12 because the
single API 30 account job was expanded to sequential account/playback jobs on
API 30/34/35/36. Several red jobs can share one cause; a red job is not a count
of distinct application bugs. Independent login/comment/session probes repeat
one actual authentication-server HTTP 500 across those account jobs.

I introduced an initial HLS-buffer regression in the previous commit. The real
failed reports show currentTime=0, readyState=4 and buffered media spanning
**[0.066666, 60.013333]**. The helper allowed only a 50ms gap, so it measured zero
available buffer and never released Play even with almost one minute available.
HLS and soak could not start, and native baseline jobs stopped before later
scenarios. Those later scenarios remain unverified, not passed.

The correction accepts only a small encoding/priming gap up to 100ms, counts
actual buffered media from max(currentTime, rangeStart), and never changes the
media clock. The six-second requirement, real moving-picture checks, stall
assertions and timeout failures remain active. Regression tests use the actual
failed 66ms/60s range and also reject short media buffers and distant ranges.
Local validation: 106 checks passed, zero skips; Vite build passed. The new
emulator result is pending. This correction is not merged.


## Run #77: real HLS recovery, fresh-decoder failure and test observations

[Regression #77](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38229934572)
on `b946cfca1cff333353113ab2e2aac5e408a3a996` finished **7 jobs passed, 8 failed**.
All eight failed job logs and their reports were read. The separate
[startup #117](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38229934580)
passed its actual baseline playback and English/Hebrew physical tab tests.

Verified successes in #77:
- HLS on API 30/34/35/36: seven actual checks each, including moving decoded
  video/quality selection with Vimeo requests blocked. Initial playback had
  11.946667 seconds of real buffer, preparation took 1215/1508/3103/2737 ms
  respectively, and six subsequent samples showed no initial waiting stalls.
- Downloadable MP3 and HLS HTTP/CORS delivery passed their real responses.
- The mixed API 30 reliability report records **900,071 ms**, 16 samples,
  Audio/Video plus mini/full changes at minutes 2/7/11, actual locks at 4/9/13,
  Home/reopen at 6/12 and an unchanged process. PSS baseline was 139,699 KB,
  peak 149,356 KB, within the declared budget. This is not a 30-minute/leak claim.
- Native API 30/34/36 baseline completed all 11 clock/frame/single-output checks.
  Repeated switches, near-end seeking and Video speed handoffs passed on those
  devices. Fullscreen/Back, rotation and PiP passed on API 30/34.
- Real transient audio focus and Doze passed on API 30/34/36; notification
  permission revoke/grant passed on API 34/36. API 30 actually downloaded
  60,268,750 bytes and reopened the local file after an offline process restart.
  Its later online Video/delete scenario failed, so the offline section as a
  whole remains failed. API 34 did not complete offline reopening.

Confirmed failures and corrections on the next head:
- API 30/34: after closing Watch from Audio and changing language, a newly
  created Video decoder remained moving but muted while native Audio continued.
  The fresh-player initialization used a separate 4.2-second readiness path,
  and an unresolved Play promise/readiness timeout could leave the handoff flag
  active indefinitely. Reopened native Video now uses the existing 15-second
  live-clock/decoded-frame transaction, adaptive catch-up and explicit rollback.
  This fixes the shared path, not merely the language test. Actual emulator
  rerun proof is pending; later errors on the stuck state are not independent
  verified bugs or passes.
- API 36 fullscreen failure screenshot shows Android's first-use "Viewing full
  screen" / "Got it" help overlay holding focus. The test now identifies that
  exact SystemUI prompt and physically taps Got it, then requires app focus
  before testing actual Back. It never dismisses ANRs or unidentified dialogs.
  Fullscreen/Back and moving-frame assertions are unchanged.
- API 36 notification timer was present in the real accessibility hierarchy as
  **"12 minutes, 29 seconds of 1 hour, 1 minute, 3 seconds"**. The old parser
  required colon text and incorrectly failed. The parser now reads that actual
  spoken elapsed duration or a visible media elapsed-time node, never the status
  clock. The advancing timer and physical button assertions remain mandatory.

Unresolved failures:
- API 35 native job completed zero baseline checks: the screenshot shows an
  Irgun ANR dialog. ActivityManager identifies SplashActivity focus-loss input
  dispatch timeout after 5000 ms, with heavy CPU/memory pressure. An empty Java
  crash buffer does not clear this real ANR. Its blocking main-thread stack was
  not included in the original artifact; new runs collect last-ANR/exit reason
  and a logged-out bugreport when an Irgun ANR occurs. No ANR fix is claimed.
- Native account login on API 30/35/36 failed, and API 34 lost its app process
  during login observation. Its original native crash buffer is empty; the
  process-exit cause remains unverified and new capture records exit reasons.
- All four independent account/comment session probes still report server
  **HTTP 500 Login failed** for valid QA credentials. Wrong-password UI/API
  rejection passed. New probes record only status/date/Cloudflare request IDs
  for server-log correlation, never passwords, cookies or session tokens.
  Valid login, account features and the signed-in media suite remain failed or
  unexecuted. The actual Worker exception is needed to diagnose the server.

Next-head local validation: **115 checks passed, zero skipped**, Vite build,
script syntax, workflow YAML and whitespace checks passed. These corrections
remain draft and unmerged pending a new complete real emulator run.


## Run #78: remaining races and actual confirmation failures

[Regression #78](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38233574337)
on `b00cf838355f797b0f75e31851ca5d1e2503dfd9` finished **6 jobs passed, 9 failed**.
All nine failed job logs and emulator reports were inspected. The separate
[startup #118](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38233574351)
passed its actual 11 baseline playback checks and three English/Hebrew tab checks.

Real passes:
- HLS API 30/35/36: seven moving-picture/buffer/quality/blocked-Vimeo checks each.
- MP3 response and HLS HTTP/CORS delivery.
- API 30 mixed reliability: **900,066 ms**, 16 samples, unchanged process,
  Audio/Video and mini/full changes, locks and Home/reopening. PSS baseline
  142,120 KB/peak 151,640 KB stayed within the existing declared budget.
- All four native media jobs completed their 11 baseline checks, repeated
  Audio/Video switches, near-end seek, Video speed changes, true fullscreen Back,
  rotation and PiP. The API 35 launch ANR from #77 did not recur in #78; that
  single successful launch does not establish that its original cause is fixed.
- Hebrew/English moving player checks passed on API 30/34/36. Actual Home,
  notification buttons and advancing spoken timer passed on API 36. Real audio
  focus and Doze passed on API 30/34/36; permission checks passed on API 34/36.
- API 34 completed offline playback/restart/UI removal and the simple Wi-Fi/data
  interruption scenario. New direct filesystem deletion proof is still pending.

| Failed job/scenario | Expected vs actual observed | Correction or open finding |
| --- | --- | --- |
| HLS API 34 startup | Moving HLS Video; instead the Watch view changed to paused Audio at 0:00, no video element and zero completed playback checks | Initial native MP3 prewarming can report AUDIO before Video decodes. Native snapshots now expose whether Audio authority was actually committed; metadata cannot replace a foreground Video choice |
| Native API 35 Hebrew/English reopen | Audio continues and Video starts moving/audible; instead native Audio stopped, with logged play-intent reason=2 (audio focus loss), then Video remained paused | Closing a parked decoder now invokes a guarded native focus-loss repair for the same continuing Audio source. Explicit user/notification Pause, changed lectures and Video authority cannot trigger duplicate Audio |
| Native API 34 Home | Audible advancing native Audio; instead Audio was paused while the foreground Video commit was still busy | Home cancels the foreground readiness/audibility transaction. Late foreground completion/rollback cannot restart Video, clear background Audio or seek its clock |
| Native API 30 notification timer | Visible elapsed timer advances; actual Android 11 shade showed a collapsed media card with controls but no timer | Expand actual Quick Settings before asserting the visible timer. The elapsed/advancing timer assertion remains active; no status-clock substitution |
| Native API 30/36 offline confirmation | Physical OK closes dialog and deletes file; actual screenshots still show the confirmation and JavaScript observation times out | Require two consistent actual native dialog bounds before one physical OK tap, then observe actual dialog dismissal before inspecting paused JavaScript. Failed confirmation stays failed and is cancelled only to allow independent later checks |
| Native API 34 slow transport | Video retains native VIDEO ownership; decoded Video moved but native snapshot became an empty AUDIO session | Further log inspection identifies ERROR_CODE_IO_FILE_NOT_FOUND after the active native shadow retained the deleted offline MP3. Replace that native URI before unlinking the file; real rerun proof remains pending |
| Logged-in API 30/34/35/36 | Valid QA login and real account/playback scenarios; native login failed and independent requests returned HTTP 500 Login failed | Shared server failure remains unresolved. Incorrect password UI/API rejection passed. Account features and signed-in playback were not executed and cannot be marked passed |

The source also swallowed native offline-file deletion errors and removed the
saved record/toasted success anyway. A real deletion failure now retains the
record and reports failure. The emulator test additionally verifies the actual
MP3 path exists before deletion and is absent afterwards using Android's app
storage access; removing only the UI entry is insufficient.

Later inspector errors on API 30/36 follow the still-open synchronous dialog and
are not independent proof of failed network/speed/layout behaviour. Later API 35
errors follow the parked stopped source. They remain failed/unverified, not
silently passed. The new physical-confirmation checks never use a synthetic OK
response, repeat a destructive tap or disable file-deletion assertions.

Server log correlation for the valid-login HTTP 500s (UTC):
- API 30: 2026-10-12 10:05:55, Cloudflare `a49549f33941277d-SEA`.
- API 34: 2026-10-12 10:12:06, Cloudflare `a49552fe8b5490db-SEA`.
- API 35: 2026-10-12 10:17:20, Cloudflare `a4955aa9df15e6c7-IAD`.
- API 36: 2026-10-12 10:28:56, Cloudflare `a4956ba7dff66be3-DFW`.

The actual Worker exception is still required to diagnose that server operation;
no server authentication fix is claimed. Native account API 34's process loss
from #77 did not recur here; its old exit cause remains unverified.

Next-head validation: **131 local checks passed, zero skipped**, including the
actual production Java focus-loss guard, user-Pause/source-change guards, initial
prewarm reconciliation, foreground/Home cancellation, native confirmation
settling and deletion failure retention. Vite build, script/Bash syntax,
workflow YAML and whitespace checks passed. Complete new real emulator
compilation/runtime results remain pending. PR #35 remains draft and unmerged.


### Confirmed source of the API 34 empty native session

Additional inspection of #78's actual native trace identified the cause, rather
than leaving the empty session unexplained. At 10:09:31 UTC, native loadLecture
selected the downloaded `file://` MP3. After offline deletion and a later video
seek, the log at 10:10:06 records **ERROR_CODE_IO_FILE_NOT_FOUND**, then “Native
player disabled for this session; using HTML audio fallback” and stopAudio with
clearLecture=true. The moving Video survived, but the native session was cleared.

Before unlinking a download, the native engine now replaces that exact active
file URI with its HTTPS audio source in the existing player. It preserves the
current Video or Audio position/play intent, leaves the Video shadow silent,
and never changes another lecture's source. The native main-thread swap must
acknowledge before Filesystem.deleteFile runs. If swapping fails, deletion is
not attempted and the saved record remains. The current Audio item is updated
to its actual network source so a later Play cannot select the removed file.

The production Java method is tested against the observed post-deletion seek,
unchanged native player/item count, Video shadow silence and paused Audio intent.
These are local source regressions; the complete real emulator rerun is still
required and no new runtime pass is claimed.


## Run #79: setup failure and recovered account API

[Regression #79](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38248725709)
on `0d513db9a7c62eec24e19e06af43891355649a52` completed with **2 successful jobs
and 13 failed jobs**. Every failed job log was read, including all four sequential
account jobs. The separate [startup #119](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38248725664)
failed for the same reason.

Expected: add read-only native volume/window observation to the disposable QA
APK, then compile and run the actual Android app. Actual: Python raised
**RuntimeError: Native volume observation insertion point changed**. The
production Snapshot gained audioAuthorityCommitted, but the preparer still
matched the previous exact constructor tail. This was an error in the prior
change. Android compilation, playback, HLS, soak and native account scenarios
were never executed in this attempt; they cannot be counted as passes. The
soak evidence upload also failed because no emulator evidence was generated.

The preparer now locates the one supported active Snapshot constructor and
preserves every original argument, including the Audio-authority field. It
still fails on missing/ambiguous insertion points before writing either native
source. QA observes actual player.getVolume(), read-only getSnapshot(), and
real WebView geometry/focus; production playback and bridge methods remain
unchanged. The optional hierarchy observer remains a separate instrumentation
target and never targets the Irgun app process. Release workflows do not run
this preparation.

Four new checks run the actual Python preparer against temporary copies of the
current Java source. They prove byte-for-byte preservation of production code,
actual volume/snapshot observations, the separate observer package, rejection
of missing/ambiguous anchors without file writes, and rejection of repeated
instrumentation. Regression and startup workflows execute these checks before
building their disposable APKs. No app assertion was removed or relaxed.

Actual server checks did run despite the Android setup failure:
- MP3 response and HLS HTTP/CORS jobs passed.
- Each of the four account jobs passed six independent comment checks:
  real temporary comment creation/author/video, edit, fresh-session persistence,
  deletion persistence, anonymous creation rejection and anonymous/invalid-token
  edit/delete rejection. Temporary comments were deleted.
- Each passed nine independent account/session checks: wrong-password HTTP 401,
  valid token/cookie login to the same non-admin account, invalid-session denial,
  matching Likes/Watch Later/Following/playlists, Like changes in both directions,
  temporary playlist creation/deletion across sessions, and real token logout
  without invalidating the independent website session. Original Like state was
  restored and temporary playlists were deleted.

These are real API requests, not Android UI/account passes. The previous valid
login HTTP 500 did not recur in #79's API probes. Its cause or a server fix is
not established by this Android change. Native UI login, app identity persistence,
revoked actual app sessions, account controls and signed-in playback remain
unverified on this head because no emulator launched.

Next-head local validation: **135 checks passed, zero skipped**, including the
four actual preparation checks. Vite build, Python/Node syntax and whitespace
checks passed. Full Android SDK compilation and the new complete emulator
results remain pending. PR #35 stays draft and unmerged.


## Run #80: actual remaining failures after preparation recovered

[Regression #80](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38276337676)
on `3b25230e3bb0605c763e98ea6377ab9818c37fe4` finished **7 successful jobs and
8 failed jobs**. All eight failed job logs, downloaded reports, relevant native
traces and failure images were inspected. The #79 setup fix passed; actual SDK
compilation completed in these jobs. [Startup #120](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38276337337)
passed its real baseline and navigation checks.

Real passes on this commit:
- HLS API 30/34/35/36 each passed seven actual moving-picture, quality/position,
  buffered-startup and blocked-Vimeo transport checks. Initial waits were
  1728/1544/2344/1919 ms respectively, with 11.946667/11.946667/11.6/11.946667
  actual buffered seconds and zero initial waiting events. This verifies the
  repeated-startup-loading change for these fixtures; it does not cover every
  video/network condition.
- API 30 mixed reliability passed **900,107 ms**: repeated Audio/Video and
  mini/full changes, Home/reopening, screen locks, unchanged app process,
  advancing clocks and retained controls. PSS baseline 142,158 KB/peak 147,727 KB
  stayed inside the declared memory budget.
- MP3 response and HLS HTTP/CORS passed.
- Native API 30/34 each passed all 11 baseline checks, repeated switches,
  near-end seek, Video-selected speed, fullscreen Back, rotation, PiP and
  Hebrew/English moving player labels. Real audio focus and Doze passed on both;
  notification permission revoke/grant passed on API 34. Both completed actual
  offline download/playback and process restart while offline before deletion
  confirmation failed.
- Native account API 30/34 each completed **25 actual checks**; API 35/36 each
  completed **20**. All four passed native wrong-password denial, valid QA login,
  visible correct account name/English-Hebrew controls, Like/Watch Later/Follow,
  real advancing playback/server history, native comment create/edit/delete,
  native playlist creation/add/remove, account/flags/history/playlist persistence
  across process restart and deleted-comment absence after restart. API 30/34
  additionally passed temporary playlist removal, restored lecture flags, logout,
  subsequent native login/name and subsequent logout. Temporary QA comments and
  playlists were cleaned in all four reports. These are actual Android account
  passes, distinct from the still-unexecuted separate signed-in media matrix.
- Independent comment and account/session API probes passed in all four jobs.

| Failed device/scenario | Expected versus actual | Correction; new runtime result pending |
| --- | --- | --- |
| Native API 35 Audio to Video at ten minutes | Synchronized moving audible Video; first HLS frames took about eight seconds, catch-up reached 4x, then the clock froze near 611.14 seconds while Audio advanced. The unchanged deadline caused an honest rollback to Audio | After observed decoded motion, recover a catch-up clock stall once at user speed, seeking only into actual cached media at the live Audio position. Keep the original one-second synchronization/decoded-frame checks and deadline; unavailable bytes still fail |
| Native API 36 before baseline playback | Actual app remains on search results; instead Activity was destroyed after search/keyboard handling and the screenshot showed Launcher. CDP timed out, with zero completed baseline checks. No ANR or Java crash was recorded | Avoid sending Android Back during the Enter/IME-hide race; physical Escape and the unchanged actual-search-screen assertion cannot finish the Activity in that way. Cause remains an inference from trace/gesture timing pending rerun |
| Native API 30 Home | Native Audio ownership within the background observation; instead mode remained VIDEO with silent Audio, and the actual handoff completed about 6.9 seconds after Home | Continue the transaction on the real isPlaying transition as well as READY; stop repeatedly rewinding a ready advancing shadow to the fixed Home timestamp. Positions remain bounded by actual elapsed time |
| Native API 34 notification Pause | Actual Pause icon/tap stops Media3; XML showed Play on actionPlayPause while native Audio was playing. The old selector tapped Play as though it were Pause | Rebind the logical session view when authority changes, retaining the same MediaSession and actual engine; require the real requested Play/Pause accessibility label before any tap. This does not substitute a fabricated Pause response |
| Native API 30/34 offline deletion | Physical confirmation removes the real MP3; actual OK at [252,356] left the synchronous native WebView confirm open. Later inspector checks timed out behind it | Replace offline deletion's blocking confirm with an asynchronous translated app dialog. Physical Cancel must retain the real file; physical Remove still must acknowledge native source replacement, delete the file, remove its record and prove actual filesystem absence. Assert decoded Video/clock advance while the dialog is open |
| Account API 30/34 actual-token revocation | Read/revoke the application's actual session; instead the CDP expression JSON.stringify(state.token) raised an observer exception after 25 completed checks. The module-private state variable is not a global CDP variable | A QA-only read-only accessor returns the real module token in memory, outside snapshots/reports/screenshots. Retain actual server revocation, HTTP 401 and restart/session-clearing assertions; improve redacted exception diagnostics |
| Account API 35/36 navigation after restart | Back closes Watch, revealing Library; actual image still shows the Watch header and scrolled recommendations, so Library is inaccessible | Queue Video history writes without waiting for network reconciliation before closing. Require stable fresh physical account tap bounds and the actual Watch-closed postcondition before navigation. Slow queued history/stale tap geometry are possible causes; runtime confirmation is required |

Native API 35 never ran the extension scenarios after its failed baseline;
API 36 completed zero baseline checks. API 30/34's later network, lock, speed
and small-screen inspector failures follow the still-open native confirmation;
they are failed/unverified scenarios, not independent proven failures of every
feature. No revoked-session or separate logged-in playback pass is claimed.

Next-head validation: **142 local checks passed, zero skipped**. New checks run
the actual native Home/session-view methods, preserve the same actual engine,
reject wrong source positions, prove the real QA-only token accessor, keep the
observed wrong notification action failed, test asynchronous confirmation/Cancel
and duplicate approval, close Video despite a pending history write, and exercise
the observed HLS catch-up stall with/without cached media. Vite build, script
syntax and whitespace checks passed. Full SDK compilation and new emulator
results remain pending. No failing assertion was disabled or changed to a fake
success. PR #35 remains draft and unmerged.


## Run #81: completed results and transport/startup corrections

[Regression #81](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38305569143)
on `cc445512fafe8a62e644243f8c81ccb8279d705a` finished **6 successful jobs and
9 failed jobs**. All nine actual failed job logs were read, along with their
JSON evidence, relevant Android traces and failure screenshots. Job conclusions
are not substituted for individual scenario verification.

Actual verified results:
- All four logged-out native baselines completed all **11 checks**, including
  actual ten-minute Audio/Video synchronization and moving audible picture.
- HLS API 30/34/36 each passed seven checks with moving decoded picture,
  buffered startup, real quality changes preserving position and blocked Vimeo.
  HLS API 35 failed and is not counted as passed. MP3 bytes and HLS HTTP passed.
- All four native account reports completed **27 checks**: wrong-password denial,
  real QA login/name, Like/Unlike, Watch Later, Follow/Unfollow, comment CRUD and
  deletion surviving restart, playlist create/add/remove, name/flags/history
  persistence, logout/relogin, actual-token external revocation/401 and cleared
  session after restart. QA comments/playlists were cleaned. Independent
  authenticated comments and account/session probes passed on all four versions.
  This does not imply the separate signed-in playback matrix passed.
- Native API 30/34/35 verified actual MP3 download, offline advancing playback,
  process restart offline, physical Cancel retaining the file while Video moves,
  physical Remove and actual filesystem absence. API 36 did not complete these.
- API 34/35/36 background notification buttons, advancing visible timer and
  notification reopening passed. API 30's timer observation failed as below.
- The API 30 mixed reliability session passed **900,097 ms**, including repeated
  Audio/Video and mini/full transitions, Home, locks, unchanged app process and
  moving media. PSS baseline 142,230 KB / peak 149,584 KB stayed within its budget.

| Failed job/device and actual scenario | Expected versus observed; likely cause | Correction; next runtime status |
| --- | --- | --- |
| Native API 30: Home notification timer | Actual elapsed media time must be readable and advance. XML exposes 12:28, but the parser selected the brightness SeekBar, whose description is empty | Select only the actual media progress resource; read its visible elapsed text where the progress description is empty. Brightness/status clocks still fail. Pending emulator rerun |
| Native API 30/34/35: network interruption, subsequent slow transport/locks/speed | The same native lecture must survive disconnection and recover. Logs show `ERROR_CODE_IO_NETWORK_CONNECTION_FAILED` followed by JavaScript disabling native playback for the session and `stopAudio(clearLecture:true)`; later snapshots have an empty lecture despite moving WebView video | Bounded same-engine HTTPS transport recovery, plus a real connectivity-return callback. Keep actual position, Pause intent and Audio/Video volume ownership; cancel stale source/Stop callbacks. HTTP/file errors still fail normally. Pending emulator rerun |
| HLS API 35: actual HLS picture/source and initial buffer | HLS-supported lecture must remain HLS with moving picture. Actual source fell back to MP4, paused at zero with only 2.282667 seconds buffered, never meeting six-second startup requirement. Original HLS attachment error was not captured, so its exact cause is unverified | Bundle the HLS SDK/inline worker in the APK, capture actual attachment failure reasons, and silently prepare a stalled paused MP4 decoder under the loading cover before restoring its requested position. The HLS-only assertion stays unchanged. Pending emulator rerun |
| Account API 30 and native API 36: Hebrew/English reopen, followed by media scenarios | Reopened Video should regain moving audible authority. Actual fresh MP4 stayed paused/muted with only a short preload while native Audio advanced; later dependent media scenarios failed. No pass is claimed for these downstream scenarios | Silent initial MP4 decoder preparation still requires real six-second buffered media, restores the actual position, suppresses preparatory playback/history events, and respects Pause/Home/Audio/new Play cancellation. Pending emulator rerun |
| Account API 34/35/36: separate signed-in playback baseline | Baseline must execute actual checks. All three stopped with `TypeError: fetch failed`, zero checks and no CDP/catalog/source observations, immediately after account cleanup's process relaunch | Bounded read-only discovery of the same real app process's WebView socket; log actual attempts and fail on process change, HTTP errors or exhausted discovery. No app restart or fake page is used. Pending emulator rerun |
| Native API 36: offline Library Downloads navigation | Physical Downloads tab must be reachable. Screenshot shows Hebrew RTL tabs, Downloads beyond the left edge; repeated LTR swipes never expose the target | Observe actual tab-strip direction and reverse physical Android swipe for RTL. Still require real settled target, offline playback/restart and file deletion. Pending emulator rerun |
| Native API 36: small-screen English/Hebrew setup | Both real translated layouts must be tested. A previous failed section left Hebrew active; English-only setup then timed out | Physically restore English when needed before testing both actual layouts. Original failed language/media section remains failed. Pending emulator rerun |

Native API 30/34/35 later failures share the cleared native session; native API
36 later failures follow failed reopen/offline navigation. These are still
failed/unverified scenarios, not proof that each dependent feature separately
has a distinct defect. Signed-in API 34/35/36 playback executed zero checks.

Next-head local validation: **150 checks passed, zero skipped**, including actual
extracted Java recovery methods, bounded retry/Pause/stale source cancellation,
MP4 two-second preload and exact-position restore, Pause/Home/Audio cancellation,
newer-Play ownership, observed Android 11 timer XML, and real-socket discovery
failure cases. Vite build, changed script syntax and whitespace checks passed.
Full Android SDK compilation and complete new emulator results remain pending.
PR #35 remains draft and unmerged. No failing assertion was weakened, disabled,
or replaced by a fake successful response.

Still unverified: another valid user's comment ownership (second dedicated QA
account needed), time-based expiry distinct from tested actual revocation,
physical Bluetooth/headset/call behavior and manufacturer battery restrictions,
all translation pages, and a full 30-minute session. The 15-minute pass must not
be reported as 30 minutes or proof of no possible memory leak.


## Run #82: runtime progress, offline identity and remaining switching failures

[Regression #82](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38310846812)
on `4ef3c8e013637d3ed42e9407c7be6e636abfc253` finished **5 successful jobs and
10 failed jobs**. All ten actual failed job logs and all available failure
artifacts were inspected. [Startup #122](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38310846929)
passed. Native API 34/35 never started their emulators and produced no media
artifacts: SDK downloads failed with `Error on ZipFile unknown archive`.
These are unexecuted tests, not app playback failures.

Actual runtime progress:
- All four account reports again completed **27 checks**, including actual
  native login, comment/playlist cleanup, persistence, logout/relogin and actual
  externally revoked session rejection. Separate signed-in playback now executes:
  API 30/34 completed 11 baseline checks and 21/22 extension checks before failure;
  API 35 completed 9 baseline checks; API 36 completed 5 baseline checks.
- API 30 notification timer/buttons/reopening passed. API 36 Hebrew/English
  reopen, actual offline download/play/restart, Cancel/Remove/file absence,
  network loss/recovery, locks, notification permissions, focus/Doze, small-screen
  layouts and all selected speeds through handoffs/restart passed. The same
  features passed API 30 except the later 1.5x Audio-to-Video transition.
  This confirms the #81 native network shutdown/timer/RTL fixes on these devices.
- HLS API 30/34 passed actual HLS moving-picture/quality/position checks. HLS
  API 35/36 did not execute any playback checks. MP3 bytes and HLS HTTP passed.
- Mixed reliability again passed **900,098 ms**, 11 checks, with PSS baseline
  144,051 KB / peak 148,690 KB within the declared budget.

| Failed device/scenario | Expected versus actual; evidence and next action |
| --- | --- |
| Native API 34/35 emulator setup | Actual Android runtime tests; instead Google SDK system-image/emulator ZIP installation failed before emulator launch. No app test ran. Retry the complete new-head matrix; no application regression is inferred |
| HLS API 35 initial foreground | App must own the physical tap window. No gestures/checks executed because focus was absent. `lastanr` names the Launcher focused-window timeout, not an Irgun ANR. Exact focus-stealing cause remains unverified; rerun and retain this failure |
| HLS API 36 after Home search submit | Physical Watch target must remain in the app. Search succeeded, then keyboard dismissal sent Back and lost native app focus. Retain concurrent commit e922841 removing the stale-IME Back gesture and asserting actual search-screen/foreground ownership. New runtime pending |
| Signed-in API 30/34 offline process restart | The declared signed-in account must remain available without internet. Token remains saved, but user identity is absent because startup restores `/me` only after online catalog loading. Preserve the concurrently added display-only profile cache, bound to the current token tag, with a 30-day cache limit and offline startup restoration. Reconnect still validates `/me`; real 401/logout/new token clears the profile, and cached identity cannot restore admin rights. New runtime pending |
| Native API 30/36 slow/unbuffered HLS interruption | A real disconnected request must fail. Actual trace contains `net::ERR_INTERNET_DISCONNECTED`, but the request was labelled `slow` because it began before offline activation. Record completion phase too and still require that exact real network error during offline operation. Select a target beyond every observed buffered range, with actual duration/end bounds. New runtime pending |
| Signed-in API 35 ten-minute Audio-to-Video | Moving audible Video at live Audio position; actual HLS stopped around 614.536s while Audio advanced, then transaction honestly rolled back. This remains unresolved; no fix/pass is claimed for this device |
| Signed-in API 36 initial playback and Audio switch | Account resume used MP4. The initial test accepted silent decoder priming as moving playback and then pressed Pause/Play before preparation finished; later Audio remained paused. Strengthen initial emulator verification to require actual ready, unmuted moving playback before controls. During priming, adapter reads/UI retain requested position and paused state rather than exposing preparatory motion. Original five completed checks do not prove audible initial playback. New runtime pending |
| Native API 30 1.5x Audio-to-Video after restart | Selected 1.5x survives moving audible handoff. Actual HLS stopped near 527.202s, later rolled back to Audio; overlapping overlay count was two. Remains unresolved pending trace investigation; no pass claimed |

Signed-in API 30/34's later network/locks/speed failures follow the offline
account assertion stopping before reopening the downloaded shiur. Those later
scenarios remain unverified, rather than independent confirmed failures of
all these features. HLS API 35/36 zero-check runs remain failures.

Next-head validation: **152 local checks passed, zero skipped**, including the
actual Android profile cache/restore methods reconciled with concurrent commits, token mismatch/logout/real 401
invalidation and disabled admin restoration, and unbuffered target bounds.
All prior Java/source regressions still pass. Vite build, changed script syntax
and whitespace checks passed. These local tests do not replace emulator results.
No failing assertion was removed; initial playback and real network error
assertions are stricter. PR #35 stays draft and unmerged. Further emulator
results and the two outstanding handoff investigations remain required.

Concurrent commits through `b776399f352d3984e924c4d6fb692ae89b00352a` already
implemented the display-only offline profile cache, real HLS completion-phase
evidence and four additional tests wired into CI. They were retained; duplicate
local implementations were discarded. Current-head checks below supersede the
152-check count above.

Reconciled-head validation: **156 local checks passed, zero skipped**, plus
Vite build, script syntax and whitespace checks. The startup fixture now includes
the actual online navigator state required by the concurrent bootstrap change;
its original account-ready assertions remain unchanged. New emulator results
remain pending.

Concurrent commits through `959721b90b4878f88c34732ca05b8224b651a56e` also
add bounded SDK package installation retries and one-shot HLS fragment retargeting
at the live Audio clock for the two stalled handoffs above. These changes were
reviewed and retained; their real runtime outcome is pending. Combined validation
now passes **157 local checks, zero skipped**, plus Vite build, JavaScript syntax,
SDK preflight shell syntax and whitespace checks. No emulator pass is inferred.

The isolated review branch is based on `355d27e47548599637c527455df690ac72696d1b`,
retaining the newer HLS-search focus fix and live-clock retarget regression. Its
additional changes require actual audible startup, hide silent priming from
public clock/paused observations, require a truly unbuffered interruption target,
keep profile caching Android-only, and test actual profile restore/401/logout.
Combined validation: **158 local checks passed, zero skipped**; actual new-head
emulator results remain pending. The separate draft PR must not be merged until
important real runtime results pass.
