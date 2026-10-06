"""Add read-only volume observability to the disposable emulator debug build.

Release workflows do not run this script. No playback behavior is changed.
The native service deliberately runs a silent audio shadow in Video mode, so
isPlaying alone cannot detect overlapping audible outputs.
"""
from pathlib import Path

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
service.write_text(s)
plugin.write_text(p)
print('Added actual native output volume observation to emulator debug checkout')
