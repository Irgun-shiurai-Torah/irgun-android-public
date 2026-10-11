// A failed native GET can be restarted safely after its promise has rejected.
// Never retry HTTP/auth/storage/validation errors or run overlapping transfers.
export async function downloadOfflineAudio(options, {
  download, removePartial, onRetry = () => {},
  delay = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await download(options);
      return { attempts:attempt };
    } catch (error) {
      const code = String(error?.code || error?.data?.code || '');
      const httpStatus = Number(error?.data?.httpStatus || error?.httpStatus || 0);
      if (code !== 'OS-PLUG-FLTR-0008' || httpStatus > 0 || attempt === 2) throw error;
      // Do not append to the first attempt's truncated MP3 or retain its progress.
      // Cleanup must finish successfully before another transfer may begin.
      await removePartial();
      await onRetry({ attempt:attempt + 1, code });
      await delay(1000);
    }
  }
}
