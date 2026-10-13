import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const native = 'android/app/src/main/java/org/irgunshiuraitorah/app';
const servicePath = `${native}/IrgunPlaybackService.java`;
const pluginPath = `${native}/IrgunPlaybackPlugin.java`;
const service = readFileSync(servicePath, 'utf8');
const plugin = readFileSync(pluginPath, 'utf8');
const prepare = resolve('scripts/android-emulator-prepare.py');

function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'irgun-emulator-prepare-'));
  try {
    mkdirSync(join(dir, native), {recursive:true});
    writeFileSync(join(dir, servicePath), service);
    writeFileSync(join(dir, pluginPath), plugin);
    run(dir);
  } finally { rmSync(dir, {recursive:true, force:true}); }
}
function execute(dir, args = []) {
  const result = spawnSync('python3', [prepare, ...args], {cwd:dir, encoding:'utf8'});
  assert.ifError(result.error);
  return result;
}

test('actual emulator preparation preserves all current native snapshot arguments and playback code', () => fixture(dir => {
  const result = execute(dir);
  assert.equal(result.status, 0, result.stderr);
  const prepared = readFileSync(join(dir, servicePath), 'utf8');
  assert.match(prepared, /audioPlayWhenReady, authorityGuard\.isAudioCommitted\(\)/,
    'The new Audio-authority argument that broke run #79 must survive preparation');
  assert.equal(prepared.match(/public float audioOutputVolume;/g)?.length, 1);
  assert.equal(prepared.match(/observed\.audioOutputVolume = player == null \? 0f : player\.getVolume\(\);/g)?.length, 1);
  assert.equal(prepared
    .replace('\n        public float audioOutputVolume; // Emulator-only read-only observation', '')
    .replace('Snapshot observed = new Snapshot(', 'return new Snapshot(')
    .replace('\n        observed.audioOutputVolume = player == null ? 0f : player.getVolume();\n        return observed;', ''), service,
    'Every production statement and constructor argument must remain byte-for-byte unchanged');
  const observed = readFileSync(join(dir, pluginPath), 'utf8');
  const qaStart = observed.indexOf('    // Disposable QA APK only: fresh native geometry, no playback mutation.');
  const qaEnd = observed.indexOf('    @PluginMethod\n    public void getState(PluginCall call) {', qaStart);
  assert.ok(qaStart >= 0 && qaEnd > qaStart);
  const qa = observed.slice(qaStart, qaEnd);
  assert.match(qa, /call\.resolve\(stateObject\(IrgunPlaybackService\.getSnapshot\(\)\)\);/);
  assert.doesNotMatch(qa, /ensureService|ensureForeground|getState\(call\)|setPlayWhenReady|\.play\(|\.pause\(/);
  assert.match(qa, /view\.getLocationOnScreen\(location\)/);
  assert.match(qa, /view\.hasWindowFocus\(\)/);
  assert.equal((observed.slice(0, qaStart) + observed.slice(qaEnd))
    .replace('\n        out.put("audioOutputVolume", s.audioOutputVolume);', ''), plugin,
    'Production bridge methods must remain unchanged');
  assert.equal(existsSync(join(dir, 'android/qa-native-observer')), false);
}));

test('hierarchy preparation copies the real observer with its separate instrumentation target', () => fixture(dir => {
  mkdirSync(join(dir, '.github'), {recursive:true});
  cpSync('.github/android-native-observer', join(dir, '.github/android-native-observer'), {recursive:true});
  const settings = readFileSync('android/settings.gradle', 'utf8');
  writeFileSync(join(dir, 'android/settings.gradle'), settings);
  const result = execute(dir, ['--with-hierarchy-observer']);
  assert.equal(result.status, 0, result.stderr);
  const manifest = readFileSync(join(dir, 'android/qa-native-observer/src/main/AndroidManifest.xml'), 'utf8');
  assert.equal(manifest, readFileSync('.github/android-native-observer/src/main/AndroidManifest.xml', 'utf8'));
  assert.match(manifest, /android:targetPackage="org\.irgunshiuraitorah\.qa"/);
  assert.doesNotMatch(manifest, /android:targetPackage="org\.irgunshiuraitorah\.app"/);
  assert.equal(readFileSync(join(dir, 'android/settings.gradle'), 'utf8'), settings + "\ninclude ':qa-native-observer'\n");
}));

test('missing or ambiguous native insertion points fail before either source file is written', () => {
  const constructor = service.match(/^        return new Snapshot\(\n(?:            [^\n]+\n)+        \);/m)?.[0];
  assert.ok(constructor);
  const mutations = [
    [service.replace('public final boolean audioPlayWhenReady;', 'public final boolean renamedPlayIntent;'), plugin],
    [service.replace(constructor, constructor.replace('\n        );', '\n        /* changed structure */ );')), plugin],
    [service + '\n' + constructor, plugin],
    [service, plugin.replace('out.put("audioPlayWhenReady", s.audioPlayWhenReady);', '')],
    [service, plugin.replace('public void getState(PluginCall call) {', 'public void renamedState(PluginCall call) {')],
  ];
  for (const [inputService, inputPlugin] of mutations) fixture(dir => {
    writeFileSync(join(dir, servicePath), inputService);
    writeFileSync(join(dir, pluginPath), inputPlugin);
    const result = execute(dir);
    assert.notEqual(result.status, 0, 'Changed/ambiguous source must not create a falsely prepared APK');
    assert.match(result.stderr, /Native (volume|window) observation insertion point changed/);
    assert.equal(readFileSync(join(dir, servicePath), 'utf8'), inputService);
    assert.equal(readFileSync(join(dir, pluginPath), 'utf8'), inputPlugin);
  });
});

test('preparing an already instrumented checkout fails without adding duplicate observations', () => fixture(dir => {
  assert.equal(execute(dir).status, 0);
  const firstService = readFileSync(join(dir, servicePath), 'utf8');
  const firstPlugin = readFileSync(join(dir, pluginPath), 'utf8');
  const second = execute(dir);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /Native volume observation insertion point changed/);
  assert.equal(readFileSync(join(dir, servicePath), 'utf8'), firstService);
  assert.equal(readFileSync(join(dir, pluginPath), 'utf8'), firstPlugin);
}));
