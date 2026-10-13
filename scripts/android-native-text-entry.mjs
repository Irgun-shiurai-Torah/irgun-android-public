import assert from 'node:assert/strict';

// Real Android input, one key at a time. Observation never changes field values.
// A missing/doubled key fails; it is never retried or silently replaced via JS.
export async function typeObservedNativeText({value, readValue, typeCharacter,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  assert.equal(await readValue(), '', 'Native text entry requires an empty focused field');
  let expected = '';
  for (const character of value) {
    await typeCharacter(character);
    expected += character;
    let observed;
    for (let sample = 0; sample < 20; sample++) {
      observed = await readValue();
      if (observed === expected) break;
      await delay(100);
    }
    assert.equal(observed, expected, 'Actual native input must retain each typed character');
    await delay(100);
  }
}
