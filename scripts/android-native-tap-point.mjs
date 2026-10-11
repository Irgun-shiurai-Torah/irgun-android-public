import assert from 'node:assert/strict';

// Observe a stable target in the current native window. This never taps, repeats
// an input action, restarts the app or relaxes the outcome being tested.
export async function settledNativeTapPoint({readBounds, readPoint,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)), samples = 12}) {
  const bounds = value => {
    assert.equal(value.focused, true, 'Irgun must own the foreground window before a physical tap');
    const rect = [value.left, value.top, value.right, value.bottom];
    assert.ok(rect.every(Number.isFinite) && rect[2] > rect[0] && rect[3] > rect[1],
      'Current native WebView bounds must have a nonzero size');
    return rect;
  };
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Math.abs(v-b[i]) <= 1);
  let previous;
  for (let sample=0; sample<samples; sample++) {
    const before = bounds(await readBounds());
    const point = await readPoint();
    const after = bounds(await readBounds());
    const values = point && [point.x,point.y,point.width,point.height];
    const visible = values?.every(Number.isFinite) && point.width > 0 && point.height > 0 &&
      point.x > 0 && point.y > 0 && point.x < point.width && point.y < point.height;
    if (visible && same(before,after)) {
      if (same(previous?.bounds,after) && same(previous?.values,values)) {
        return {bounds:after, domPoint:point, point:[
          Math.round(after[0]+point.x*(after[2]-after[0])/point.width),
          Math.round(after[1]+point.y*(after[3]-after[1])/point.height)
        ], samples:sample+1};
      }
      previous = {bounds:after,values};
    } else previous = undefined;
    await delay(150);
  }
  throw new Error('Physical tap target or native viewport did not settle; no tap was performed');
}
