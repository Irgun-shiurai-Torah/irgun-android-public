#!/usr/bin/env bash
# GitHub runners sometimes receive a truncated Android emulator/system-image ZIP.
# Install and validate both packages before the emulator runner action. This
# ensures the action reuses verified packages instead of hitting a flaky mirror
# while starting a device. Do NOT skip the real emulator or its assertions.
set -euo pipefail

api="${1:?Usage: android-emulator-sdk-preflight.sh <API level>}"
case "$api" in 30|34|35|36) ;; *) echo "Unsupported Android test API: $api" >&2; exit 2 ;; esac
sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/usr/local/lib/android/sdk}}"
sdkmanager="$sdk_root/cmdline-tools/latest/bin/sdkmanager"
image="$sdk_root/system-images/android-$api/google_apis/x86_64"

if [[ ! -x "$sdkmanager" ]]; then
  echo "Android SDK package manager is missing: $sdkmanager" >&2
  exit 1
fi

retry_sdk_package() {
  local package="$1" required="$2" cleanup="$3" attempt
  if [[ -s "$required" ]]; then
    echo "Validated existing $package"
    return 0
  fi
  for attempt in 1 2 3; do
    echo "Installing $package (attempt $attempt of 3)"
    if "$sdkmanager" --install "$package" --channel=0 && [[ -s "$required" ]]; then
      echo "Validated $package"
      return 0
    fi
    echo "Package $package did not install completely; clearing only its partial installation" >&2
    rm -rf "$cleanup"
    if [[ "$attempt" -lt 3 ]]; then sleep "$((attempt * 5))"; fi
  done
  echo "Failed to install usable $package; emulator test must remain failed" >&2
  return 1
}

retry_sdk_package 'emulator' "$sdk_root/emulator/emulator" "$sdk_root/emulator"
retry_sdk_package "system-images;android-$api;google_apis;x86_64" "$image/system.img" "$image"
