import test from 'node:test';
import assert from 'node:assert/strict';
import {startMediaRequest,completeMediaRequest,failedDuringOffline} from './android-network-evidence.mjs';
const request={request:{url:'https://api.irgunshiuraitorah.com/media/IST-DL6067/360p.ts'},timestamp:100};
test('HLS request begun while slow and failed while disconnected qualifies',()=>{
  const started=startMediaRequest(request,'slow');
  const ended=completeMediaRequest(started,{timestamp:102,errorText:'net::ERR_INTERNET_DISCONNECTED'},'offline');
  assert.equal(ended.phase,'slow');
  assert.equal(ended.completedPhase,'offline');
  assert.equal(failedDuringOffline(ended),true);
});
test('cancelled fragment load is not a network failure',()=>{
  const started=startMediaRequest(request,'slow');
  assert.equal(failedDuringOffline(completeMediaRequest(started,{timestamp:103,errorText:'net::ERR_ABORTED'},'offline')),false);
  assert.equal(failedDuringOffline(completeMediaRequest(started,{timestamp:103,errorText:'net::ERR_INTERNET_DISCONNECTED'},'slow')),false);
  assert.equal(startMediaRequest({request:{url:'https://other/file.ts'},timestamp:100},'offline'),null);
});
