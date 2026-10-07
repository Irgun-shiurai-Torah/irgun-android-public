# Native logged-in account checks

Use a dedicated, email-verified non-admin account for this repository. Keep separate iOS and Android QA accounts to avoid concurrent changes to shared data. Add Actions repository secrets `IRGUN_TEST_EMAIL` and `IRGUN_TEST_PASSWORD` (Android native text input currently requires an ASCII password using letters, numbers, @ . _ + ! or -). Never commit credentials.

The account workflow fails before building if credentials are absent. Every interaction is a native touch or keyboard event. Debug-only observations read state and hit-tested coordinates; they never sign in or change collections directly.

Checks: login, profile and settings display, like/Watch Later/follow toggles, playback history, creating a uniquely named QA playlist, process termination/relaunch, persisted server-loaded collections, logout and account state clearing. iPhone and iPad run sequentially. Original production code and playback workflows are unchanged.

The test restores the selected lecture flags after success. Uniquely named `Irgun-QA-*` playlists and history remain for inspection; a failed run may leave test flags for diagnosis. Tests do not edit personal accounts, submit comments, send follow emails, change notification subscriptions, charge payments or delete accounts. Profile edits, registration/verification, password reset, Google/Apple login, cross-device simultaneous sync, offline downloads and payment sandbox flows are not covered by this initial suite. Native success is required; syntax validation is not a test pass.
