"""Add read-only volume observability to the disposable emulator debug build.

Release workflows do not run this script. No playback behavior is changed.
The native service deliberately runs a silent audio shadow in Video mode, so
isPlaying alone cannot detect overlapping audible outputs.
"""
from pathlib import Path
import shutil
import sys

root = Path('android/app/src/main/java/org/irgunshiuraitorah/app')
service = root / 'IrgunPlaybackService.java'
plugin = root / 'IrgunPlaybackPlugin.java'
s = service.read_text()
p = plugin.read_text()
field = '        public final boolean audioPlayWhenReady;'
start = '        return new Snapshot(\n            lectureId, vimeoId, title, speaker, image, mediaKind, sourceId, paidAudioId, trackId, audioUrl, videoSource,'
end = '            logicalSpeed, logicalVolume, audioReadyInternal(), audioPosition, audioDuration, audioPlaying, audioPlayWhenReady\n        );'
serialize = '        out.put("audioPlayWhenReady", s.audioPlayWhenReady);'
for text, token in [(s, field), (s, start), (s, end), (p, serialize)]:
    if text.count(token) != 1:
        raise RuntimeError('Native volume observation insertion point changed')
s = s.replace(field, field + '\n        public float audioOutputVolume; // Emulator-only read-only observation')
s = s.replace(start, start.replace('return new Snapshot(', 'Snapshot observed = new Snapshot('))
s = s.replace(end, end + '\n        observed.audioOutputVolume = player == null ? 0f : player.getVolume();\n        return observed;')
p = p.replace(serialize, serialize + '\n        out.put("audioOutputVolume", s.audioOutputVolume);')
method = '    @PluginMethod\n    public void getState(PluginCall call) {'
if p.count(method) != 1:
    raise RuntimeError('Native window observation insertion point changed')
p = p.replace(method, '''    // Disposable QA APK only: fresh native geometry, no playback mutation.
    @PluginMethod
    public void qaWindowBounds(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            android.webkit.WebView view = getBridge().getWebView();
            int[] location = new int[2];
            view.getLocationOnScreen(location);
            JSObject out = new JSObject();
            out.put("left", location[0]);
            out.put("top", location[1]);
            out.put("right", location[0] + view.getWidth());
            out.put("bottom", location[1] + view.getHeight());
            out.put("focused", view.hasWindowFocus());
            call.resolve(out);
        });
    }

''' + method)
service.write_text(s)
plugin.write_text(p)
if '--with-hierarchy-observer' in sys.argv:
    # Separate target package: starting instrumentation must never restart the
    # app whose continuous playback/session is being tested.
    shutil.copytree('.github/android-native-observer', 'android/qa-native-observer', dirs_exist_ok=True)
    settings = Path('android/settings.gradle')
    settings.write_text(settings.read_text() + "\ninclude ':qa-native-observer'\n")
print('Added read-only native observations to emulator debug checkout')
