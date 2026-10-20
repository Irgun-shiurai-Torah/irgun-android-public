#!/usr/bin/env bash
set -euo pipefail
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
VERIFY="scripts/verify_android_native_symbols.sh"
printf "sample R8 mapping\n" > "$ROOT/mapping.txt"

# A valid AAB with native symbols passes strict checks.
mkdir -p "$ROOT/with/base/lib/arm64-v8a" "$ROOT/with/BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a"
printf "native\n" > "$ROOT/with/base/lib/arm64-v8a/libexample.so"
printf "symbols\n" > "$ROOT/with/BUNDLE-METADATA/com.android.tools.build.debugsymbols/arm64-v8a/libexample.so.dbg"
(cd "$ROOT/with" && zip -qr "$ROOT/with-symbols.aab" .)
bash "$VERIFY" "$ROOT/with-symbols.aab" "$ROOT/mapping.txt" "$ROOT/with-report" strict
grep -q "Native debug metadata is embedded" "$ROOT/with-report/native-symbols-status.txt"

# AndroidX DataStore ships pre-stripped binaries; flag the Play warning but
# do not make release builds fail over symbols the app publisher cannot add.
mkdir -p "$ROOT/datastore/base/lib/arm64-v8a"
printf "native\n" > "$ROOT/datastore/base/lib/arm64-v8a/libdatastore_shared_counter.so"
(cd "$ROOT/datastore" && zip -qr "$ROOT/datastore.aab" .)
bash "$VERIFY" "$ROOT/datastore.aab" "$ROOT/mapping.txt" "$ROOT/datastore-report" strict
grep -q "pre-stripped third-party" "$ROOT/datastore-report/native-symbols-status.txt"

# Unexpected native libraries must fail strict PR verification, but only warn
# on production release packaging, where metadata is not a Play blocker.
mkdir -p "$ROOT/unknown/base/lib/arm64-v8a"
printf "native\n" > "$ROOT/unknown/base/lib/arm64-v8a/libnewnative.so"
(cd "$ROOT/unknown" && zip -qr "$ROOT/unknown.aab" .)
if bash "$VERIFY" "$ROOT/unknown.aab" "$ROOT/mapping.txt" "$ROOT/unknown-report" strict; then
  echo "Expected unknown native library without symbols to fail strict checking" >&2
  exit 1
fi
bash "$VERIFY" "$ROOT/unknown.aab" "$ROOT/mapping.txt" "$ROOT/unknown-warn" warn
if bash "$VERIFY" "$ROOT/with-symbols.aab" "$ROOT/missing-mapping.txt" "$ROOT/missing-report" strict; then
  echo "Expected missing R8 mapping to fail" >&2
  exit 1
fi
echo "Native symbols release-check regression cases passed."
