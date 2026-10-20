// The emulator still exercises the real app, source.json and native HLS frames.
// A transient outage of the *separate* public video-map lookup must not prevent
// it reaching the player when the previously verified fixture is unchanged.
export const KNOWN_NATIVE_MEDIA3_FIXTURE = Object.freeze({
  id:'1232214252',
  vimeoId:'1232214252',
  title:'IST- CH379 - הרב אשר אנשיל עקשטיין - שאלות ותשובות בעניני טכנולוגיה - השואל הרב חיים דוד קראקאבער',
  shiurCode:'CH379',
  duration:6178
});

export async function fetchAndroidEmulatorJson(url, {
  fetchImpl=fetch, timeoutMs=12000, retries=1, wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
}={}) {
  let error;
  for(let attempt=0;attempt<=retries;attempt++){
    try{
      const response=await fetchImpl(url,{
        headers:{Origin:'https://localhost','X-Irgun-App':'1'},
        signal:AbortSignal.timeout(timeoutMs)
      });
      if(!response.ok){
        error=new Error('HTTP '+response.status+' for '+new URL(url).pathname);
        if(response.status<500 || attempt===retries)throw error;
      }else return {value:await response.json(),attempts:attempt+1};
    }catch(e){
      error=e;
      if((e?.message||'').startsWith('HTTP 4'))throw e;
      if(attempt===retries)break;
    }
    await wait(600);
  }
  throw new Error('Emulator fixture fetch failed after '+(retries+1)+
    ' attempts ('+new URL(url).pathname+'): '+String(error?.message||error));
}

export async function loadNativeEmulatorCatalogFixture(hlsId,{
  base='https://api.irgunshiuraitorah.com',getJson=fetchAndroidEmulatorJson
}={}){
  const selected=String(hlsId||'');
  try{
    const result=await getJson(base+'/video-map?driveLibrary=1');
    if(!Array.isArray(result.value))throw new Error('Unexpected catalog response (not an array)');
    const candidates=result.value.filter(v=>String(v.id||'')===selected||String(v.vimeoId||'')===selected);
    if(!candidates.length)throw new Error('Selected test shiur missing from live catalog: '+selected);
    return {target:candidates[0],candidates,lookup:'live',attempts:result.attempts};
  }catch(error){
    // Only the established, actually-played QA lecture has a fallback. A
    // custom fixture or live catalog reporting a missing lecture must FAIL.
    // Bad catalog data or an explicit 4xx response is a genuine failure,
    // not a reason to hide the problem behind cached metadata.
    const transient=/Emulator fixture fetch failed|timeout|network|connection|fetch failed|socket/i.test(String(error.message));
    if(selected!==KNOWN_NATIVE_MEDIA3_FIXTURE.id || !transient)throw error;
    return {target:{...KNOWN_NATIVE_MEDIA3_FIXTURE},
      candidates:[{...KNOWN_NATIVE_MEDIA3_FIXTURE}],lookup:'pinned-fixture',
      catalogError:String(error.message)};
  }
}
