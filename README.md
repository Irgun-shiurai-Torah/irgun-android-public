# Irgun Android

Public build source for the Irgun Shiurai Torah Android app.

This repository intentionally does not store Android signing keys, passwords, or Google Play service-account credentials. Those are supplied to GitHub Actions through repository secrets.

The public workflow builds:
- a signed Release APK and AAB when signing secrets are configured;
- a Debug APK if signing secrets are not configured;
- an Internal testing upload to Google Play when the Play service-account secret is configured.

The older private repository remains available as a fallback until this public build pipeline is fully verified.
