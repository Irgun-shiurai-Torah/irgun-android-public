#!/usr/bin/env bash
set -euo pipefail

# Inspect what AGP actually put in the bundle. A dependency that was already
# stripped by its publisher cannot be symbolicated by changing build.gradle.
AAB="${1:-android/app/build/outputs/bundle/release/app-release.aab}"
MAPPING="${2:-android/app/build/outputs/mapping/release/mapping.txt}"
REPORT_DIR="${3:-symbol-report}"
MODE="${4:-strict}"  # strict in pull requests; warn for production release packaging
mkdir -p "$REPORT_DIR"
if [[ "$MODE" != "strict" && "$MODE" != "warn" ]]; then
  echo "Expected strict or warn mode, got: $MODE" >&2
  exit 2
fi
if [[ ! -s "$AAB" || ! -s "$MAPPING" ]]; then
  echo "::error::Missing release AAB or R8 mapping; native diagnostic verification cannot run"
  exit 1
fi
ENTRIES="$REPORT_DIR/aab-entries.txt"
LIBRARIES="$REPORT_DIR/native-libraries.txt"
STATUS="$REPORT_DIR/native-symbols-status.txt"
unzip -Z1 "$AAB" > "$ENTRIES"
grep -E "^base/lib/[^/]+/[^/]+[.]so$" "$ENTRIES" > "$LIBRARIES" || true
if [[ ! -s "$LIBRARIES" ]]; then
  echo "No native .so libraries in the AAB. R8 mapping is present." | tee "$STATUS"
  exit 0
fi
if grep -Eq "^BUNDLE-METADATA/com[.]android[.]tools[.]build[.]debugsymbols/" "$ENTRIES"; then
  echo "Native debug metadata is embedded in the AAB; R8 mapping is present." | tee "$STATUS"
  exit 0
fi
if grep -Evq "^base/lib/[^/]+/libdatastore_shared_counter[.]so$" "$LIBRARIES"; then
  echo "Native libraries without packaged symbols include more than AndroidX DataStore. R8 mapping is present." | tee "$STATUS"
  echo "::warning::Unexpected native libraries lack debug metadata in the release AAB"
  cat "$LIBRARIES"
  if [[ "$MODE" == "strict" ]]; then
    echo "::error::Resolve missing native symbols for new native libraries before merging"
    exit 1
  fi
else
  echo "Only the pre-stripped third-party AndroidX DataStore libdatastore_shared_counter.so is present. R8 mapping is present; native symbols cannot be reconstructed by Gradle." | tee "$STATUS"
  echo "::warning::AndroidX DataStore ships libdatastore_shared_counter.so with symbols already stripped. Google Play may still show its non-blocking warning."
fi
