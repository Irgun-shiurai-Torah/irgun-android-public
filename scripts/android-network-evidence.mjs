// CDP requests can begin during throttling and finish after a disconnect.
// Preserve both times, and do not count a cancelled seek as a network failure.
export function startMediaRequest(data, phase) {
  if (!data?.request?.url) return null;
  let url;
  try { url = new URL(data.request.url); } catch { return null; }
  if (!/\/media\//.test(url.pathname)) return null;
  return {path:url.pathname, started:Number(data.timestamp), phase};
}

export function completeMediaRequest(start, data, completedPhase) {
  if (!start) return null;
  return {...start, completedPhase,
    elapsedMs:Math.round((Number(data.timestamp)-start.started)*1000),
    bytes:Number(data.encodedDataLength||0),
    error:data.errorText||null
  };
}

export function failedDuringOffline(record) {
  return Boolean(record?.completedPhase==='offline' &&
    /^net::ERR_(?:INTERNET_DISCONNECTED|NETWORK_CHANGED|CONNECTION_[A-Z_]+|TIMED_OUT|FAILED)$/.test(String(record.error||'')));
}
