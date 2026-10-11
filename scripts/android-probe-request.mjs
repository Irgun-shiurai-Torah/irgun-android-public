// Retry only transport failures before an HTTP response exists. A response,
// including HTTP errors, must go through the probe's unchanged assertions.
export async function fetchProbe(url, options, {
  failures, fetchImpl=fetch, delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
}={}) {
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      return await fetchImpl(url,{...options,signal:AbortSignal.timeout(65000)});
    } catch(error) {
      failures?.push({url,attempt,name:String(error.name||''),
        error:String(error.message||error),causeCode:String(error.cause?.code||''),
        cause:String(error.cause?.message||'').slice(0,500)});
      const transport=(error instanceof TypeError&&error.message==='fetch failed') ||
        error.name==='TimeoutError';
      if(!transport||attempt===3)throw error;
      await delay(attempt*750);
    }
  }
}
