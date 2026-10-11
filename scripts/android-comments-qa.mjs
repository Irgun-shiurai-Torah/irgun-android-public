import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
const base='https://api.irgunshiuraitorah.com';
const email=String(process.env.IRGUN_TEST_EMAIL||'').trim().toLowerCase(),password=String(process.env.IRGUN_TEST_PASSWORD||'');
assert.ok(email&&password,'Dedicated non-admin QA account credentials are required');
const videoId=String(process.env.IRGUN_COMMENT_TEST_VIDEO_ID||'1232214252');
let token='',commentId='',qaUserId='';
const marker='IRGUN-QA-TEMP-'+Date.now(),posted=marker+' original',edited=marker+' edited';
const report={startedAt:new Date().toISOString(),checks:[],status:'running',authorization:'unverified_two_users'};
function note(value){report.checks.push(value);console.log('PASS '+value);}
async function api(path,{method='GET',body,credentials=true,customToken}={}){
  const headers={Origin:'https://localhost','X-Irgun-App':'1',...(body?{'Content-Type':'application/json'}:{})};
  if(credentials&&token)headers.Authorization='Bearer '+(customToken||token);
  const response=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  const data=await response.json().catch(()=>({}));
  return {status:response.status,data};
}
function requireOk(res,label){assert.equal(res.status,200,label+' returned HTTP '+res.status+': '+String(res.data?.error||''));return res.data;}
async function list(){return requireOk(await api('/comments?videoId='+encodeURIComponent(videoId)),'List comments').comments;}
async function selectOwned(){
  const comments=await list();
  return comments.find(c=>String(c.id)===commentId && String(c.user_id)===qaUserId);
}
try{
  const login=requireOk(await api('/login',{method:'POST',body:{email,password},credentials:false}),'Login');
  token=String(login.sessionToken||'');
  qaUserId=String(login.user?.id||'');
  assert.ok(token&&qaUserId&&String(login.user?.email||'').toLowerCase()===email);
  assert.equal(Boolean(login.user?.admin),false,'Only a non-admin QA user may edit temporary comments');

  // Real negative authorization checks: anonymous and invalid tokens may not
  // create, edit or delete anyone's comment.
  let invalid=await api('/comments',{method:'POST',body:{videoId,text:posted},credentials:false});
  assert.equal(invalid.status,401,'Anonymous users must not post');
  note('Anonymous comment creation rejected (401)');

  requireOk(await api('/comments',{method:'POST',body:{videoId,text:posted}}),'Post QA comment');
  const match=(await list()).filter(c=>c.text===posted&&String(c.user_id)===qaUserId);
  assert.equal(match.length,1,'Exactly one new temporary QA comment must be visible');
  commentId=String(match[0].id);
  assert.ok(commentId,'Comment must have a real server-generated ID');
  note('Posted QA comment is visible with correct author and video ID');

  const rejected=await api('/comments/'+encodeURIComponent(commentId),{method:'PUT',body:{text:edited},credentials:false});
  assert.equal(rejected.status,401,'Anonymous user must not edit');
  const rejectDelete=await api('/comments/delete',{method:'POST',body:{commentId},credentials:false});
  assert.equal(rejectDelete.status,401,'Anonymous user must not delete');
  const fakeToken='not-a-valid-session-token';
  assert.equal((await api('/comments/'+encodeURIComponent(commentId),{method:'PUT',body:{text:edited},customToken:fakeToken})).status,401,
    'Invalid-token user must not edit comments');
  assert.equal((await api('/comments/delete',{method:'POST',body:{commentId},customToken:fakeToken})).status,401,
    'Invalid-token user must not delete comments');
  assert.equal((await selectOwned()).text,posted,'Unauthorized requests must not mutate the comment');
  note('Anonymous/invalid sessions cannot edit or delete a temporary comment');

  requireOk(await api('/comments/'+encodeURIComponent(commentId),{method:'PUT',body:{text:edited}}),'Edit QA comment');
  assert.equal((await selectOwned()).text,edited,'Comment edit must persist on server');
  note('QA comment edit saved and visible after a fresh GET');

  // Cold-state verification: do not reuse the comment object or an open
  // connection; fetch from a fresh session before deleting.
  const freshLogin=requireOk(await api('/login',{method:'POST',body:{email,password},credentials:false}),'Fresh independent login');
  assert.ok(freshLogin.sessionToken && freshLogin.sessionToken!==token,'New login must use an independent server session');
  const first=token;token=freshLogin.sessionToken;
  assert.equal((await selectOwned()).text,edited,'Comment edit must remain after a new login session');
  note('Edited comment survives a fresh independent account session');
  token=first;
  requireOk(await api('/comments/delete',{method:'POST',body:{commentId}}),'Delete QA comment');
  assert.ok(!(await list()).some(c=>String(c.id)===commentId),'Deleted comment must disappear from fresh server list');
  token=freshLogin.sessionToken;
  assert.ok(!(await list()).some(c=>String(c.id)===commentId),'Deleted comment must stay absent in a fresh login session');
  note('QA comment deletion persisted across authenticated sessions');
  commentId='';
  report.status='passed';
}catch(error){report.status='failed';report.error=String(error.message||error).replaceAll(email,'[QA email]').replaceAll(password,'[redacted]');process.exitCode=1;}
finally{
  if(commentId){
    try {
      const own=await selectOwned();
      if(own)requireOk(await api('/comments/delete',{method:'POST',body:{commentId}}),'Cleanup temporary QA comment');
      assert.ok(!(await list()).some(c=>String(c.id)===commentId));
      report.cleanup='verified';
    }catch(e){report.status='failed';report.cleanup='failed; manual check for '+marker+' needed';process.exitCode=1;}
  }else report.cleanup='not needed or verified deleted';
  report.authorization='Anonymous/invalid-session denial verified; other valid user requires separately provisioned secondary QA account.';
  if(token){try{await api('/logout',{method:'POST'});}catch{}}
  mkdirSync('emulator-report',{recursive:true});report.finishedAt=new Date().toISOString();
  writeFileSync('emulator-report/comments.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}