# Android QA coverage and verification

This is a coverage audit, not a claim that the expanded suite has passed.
The latest inspected runtime evidence is recorded below. Checks on a newer PR
head remain pending until its actual reports, logs and screenshots are inspected.
Local unit checks are separate.
Do not merge this PR based on unit tests or a green subset of matrix jobs.

Latest inspected attempt: [regression #79](https://github.com/Irgun-shiurai-Torah/irgun-android-public/actions/runs/38248725709)
had **2 successful jobs and 13 failed jobs**. All emulator jobs failed during
native observer preparation, before SDK compilation or app/emulator execution.
The separate startup #119 failed at the same point. This setup regression was
introduced by the new Audio-authority snapshot field; it is not evidence of
13 distinct app bugs. The correction and actual API-only passes are recorded
in the final section below. A complete new emulator run is required.

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
