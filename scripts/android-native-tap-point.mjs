import assert from 'node:assert/strict';


// Android 16 can report a focused, nonzero native window before WebView has
// processed the return from 'wm size 240x320' to the real device resolution.
// Confirm BOTH coordinate systems match their pre-resize layout in multiple
// consecutive observations. No UI state changes or synthetic clicks are used.
export async function waitForRestoredAndroidViewport({
  readNative,readDom,expected,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  attempts=38,stableSamples=3
}) {
  const n=expected?.native,d=expected?.dom;
  const expectedRect=[n?.left,n?.top,n?.right,n?.bottom];
  assert.ok(expectedRect.every(Number.isFinite)&&expectedRect[2]>expectedRect[0]&&
    expectedRect[3]>expectedRect[1]&&Number.isFinite(d?.width)&&Number.isFinite(d?.height)&&
    d.width>0&&d.height>0,'A measured pre-resize native and DOM viewport is required');
  const close=(x,y,tolerance=2)=>Number.isFinite(x)&&Math.abs(x-y)<=tolerance;
  let stable=0,last=null;
  for(let i=0;i<attempts;i++){
    const native=await readNative(),dom=await readDom();
    last={native,dom};
    const restored=Boolean(native?.focused)&&
      close(native.left,n.left)&&close(native.top,n.top)&&
      close(native.right,n.right)&&close(native.bottom,n.bottom)&&
      close(dom?.width,d.width,1)&&close(dom?.height,d.height,2);
    stable=restored?stable+1:0;
    if(stable>=stableSamples)return {native,dom,observations:i+1};
    await delay(220);
  }
  throw new Error('Android native and WebView viewport failed to restore together after wm resize; last='+
    JSON.stringify(last)+'; expected='+JSON.stringify(expected));
}

export async function waitForNativeWindowFocus({readBounds,
  delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),samples=30}) {
  for(let i=0;i<samples;i++){
    const bounds=await readBounds();
    if(bounds.focused&&bounds.right>bounds.left&&bounds.bottom>bounds.top)return bounds;
    await delay(200);
  }
  throw new Error('Irgun did not regain the actual native foreground window after notification activation');
}

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
