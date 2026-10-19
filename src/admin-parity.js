// Native Android/WebView admin controls matching the protected website Admin
// section. The Worker, not this UI, authorizes every read and mutation.
// No extra WebView, cookie login, payment flow, or privilege is introduced.
import { adminEscape as e, validatedScheduleBatch, planDateChanges } from './admin-parity-utils.js';

export const WEBSITE_ADMIN_EXTRA_SECTIONS = Object.freeze([
  ['comments','Comments Management'],
  ['contacts','Contact Messages'],
  ['analytics','Analytics Dashboard'],
  ['routing','Website Playback Routing'],
  ['schedule','Bulk Schedule JSON Import'],
  ['dates','Lecture Date CSV Import'],
  ['city-admins','City Admin Assignments'],
  ['cities','Video City Names (Hebrew)']
]);

function emptyState() {
  return {
    owner:'', opened:'', busy:false, loading:false, error:'', notice:'',
    comments:{items:[],total:0,limit:50,page:1,hasMore:false,q:'',videoId:'',editId:''},
    contacts:{items:[],counts:{},q:'',filter:'all',replyId:'',replyText:''},
    analytics:{live:null,history:null},
    routing:null, assignments:{items:[],cities:[]}, cities:[],
    batchText:'', batch:null, dateFile:null, datePlan:null, imported:0
  };
}
let state = emptyState();
let element = null;
let context = null;
let searchTimer = null;
const headings = new Map(WEBSITE_ADMIN_EXTRA_SECTIONS);
const field = name => element?.querySelector('[data-pa-field="' + name + '"]');
const btn = (label, action, extra = '') =>
  '<button type="button" class="admin-parity-button" data-pa-action="' + action + '" ' + extra + '>' + e(label) + '</button>';
const postJson = data => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});

function assertAdmin(write=false) {
  if (!context?.isAdmin?.()) throw new Error('This account is not authorized for website administration.');
  if (write && !context?.isAdminMode?.())
    throw new Error('Enable Admin Mode above before changing website settings.');
}
function request(path,options) {
  assertAdmin(Boolean(options && options.method && options.method !== 'GET'));
  return context.apiJson(path,options);
}
function panelTitle(text,description) {
  return '<h3>' + e(text) + '</h3>' + (description?'<p class="admin-parity-help">'+e(description)+'</p>':'');
}
function status() {
  const message=state.error || state.notice;
  return message?'<div class="admin-parity-status ' +(state.error?'is-error':'is-ok')+ '" role="status">' + e(message) + '</div>':'';
}
function itemRow(title,details,buttons='',body='') {
  return '<article class="admin-parity-row"><div class="admin-parity-row-head"><strong dir="auto">'
    +e(title)+'</strong></div>'+(details?'<div class="admin-parity-subtext" dir="auto">'+e(details)+'</div>':'')
    +(body?'<div class="admin-parity-body" dir="auto">'+e(body)+'</div>':'')
    +(buttons?'<div class="admin-parity-actions">'+buttons+'</div>':'')+'</article>';
}
function dateText(value) {
  const raw=String(value||'');
  if(!raw)return '';
  const d=new Date(raw);
  return Number.isNaN(d.getTime())?raw.slice(0,30):d.toLocaleString();
}
function disabled() { return state.busy ? 'disabled' : ''; }
function panelHtml() {
  if (state.opened==='comments') {
    const d=state.comments;
    const search='<div class="admin-parity-filters">'
      +'<input type="search" data-pa-field="comment-query" placeholder="Search comments or author" value="'+e(d.q)+'">'
      +'<input type="search" data-pa-field="comment-video" placeholder="Shiur ID (optional)" value="'+e(d.videoId)+'">'
      +btn('Refresh','refresh')+'</div>';
    const rows=d.items.map(x=>{
      const id=String(x.id||'');
      let actions=btn('Edit','comment-edit','data-pa-id="'+e(id)+'"')+btn('Delete','comment-delete','data-pa-id="'+e(id)+'"');
      if(d.editId===id)actions='<textarea data-pa-field="comment-edit-text" maxlength="5000" rows="4">'+e(x.text||'')+'</textarea>'
        +btn('Save changes','comment-save','data-pa-id="'+e(id)+'"')+btn('Cancel','comment-cancel');
      const sub=(x.videoId||'')+' · '+dateText(x.created);
      return itemRow(x.author||'Anonymous',sub,actions,d.editId===id?'':x.text);
    }).join('');
    return panelTitle('Comments Management','Search across all shiurim, edit comments, or permanently delete them.')
      +search+'<p class="admin-parity-help">'+d.total+' total comments</p>'
      +(rows||'<div class="empty">No comments found.</div>')
      +'<div class="admin-parity-pager">'+btn('Previous','comments-prev',d.page<=1?'disabled':'')
      +'<span>Page '+d.page+'</span>'+btn('Next','comments-next',!d.hasMore?'disabled':'')+'</div>';
  }
  if(state.opened==='contacts'){
    const d=state.contacts;
    const counts=Object.entries(d.counts||{}).filter(([k,v])=>typeof v==='number').map(([k,v])=>k+': '+v).join(' · ');
    const filters='<div class="admin-parity-filters"><input type="search" data-pa-field="contact-query" placeholder="Search messages" value="'+e(d.q)+'">'
      +'<select data-pa-field="contact-filter">'+['all','unread','read','replied','archived'].map(x=>'<option value="'+x+'" '+(d.filter===x?'selected':'')+'>'+x+'</option>').join('')+'</select>'
      +btn('Refresh','refresh')+'</div>'+(counts?'<p class="admin-parity-help">'+e(counts)+'</p>':'');
    const rows=d.items.map(x=>{
      const id=String(x.id||''),st=String(x.status||'read');
      let actions=btn(st==='unread'?'Mark read':'Mark unread','contact-status','data-pa-id="'+e(id)+'" data-pa-status="'+(st==='unread'?'read':'unread')+'"')
        +btn('Reply','contact-reply','data-pa-id="'+e(id)+'"')
        +btn(st==='archived'?'Restore':'Archive','contact-status','data-pa-id="'+e(id)+'" data-pa-status="'+(st==='archived'?'read':'archived')+'"')
        +btn('Delete','contact-delete','data-pa-id="'+e(id)+'"');
      if(d.replyId===id)actions+='<textarea data-pa-field="contact-reply-text" rows="4" placeholder="Write your reply">'+e(d.replyText)+'</textarea>'
        +btn('Send reply','contact-send','data-pa-id="'+e(id)+'"')+btn('Cancel','contact-cancel');
      const email=String(x.email||'');
      const detail=st+' · '+dateText(x.createdAt)+' · '+email+(x.phone?' · '+x.phone:'');
      return itemRow(x.subject||'No subject',(x.name||'Unknown sender')+' · '+detail,actions,x.message||'')
        +(x.replyText?'<p class="admin-parity-help">Last reply: '+e(x.replyText)+'</p>':'');
    }).join('');
    return panelTitle('Contact Messages','Read, reply, mark read/unread, archive, or delete website contact messages.')
      +filters+(rows||'<div class="empty">No contact messages found.</div>');
  }
  if(state.opened==='analytics'){
    const l=state.analytics.live,h=state.analytics.history;
    const metrics=l?[
      ['Active now',l.activeNow],['Playing now',l.playingNow],['Video',l.video],
      ['Audio',l.audio],['Website',l.platforms?.web],['Android',l.platforms?.android],
      ['iOS',l.platforms?.ios],['Browsing',l.browsing]
    ]:[];
    const cards=metrics.length?'<div class="admin-parity-metrics">'+metrics.map(([key,value])=>
      '<div><b>'+Number(value||0).toLocaleString()+'</b><span>'+e(key)+'</span></div>').join('')+'</div>':'';
    const today=h?.today||{},week=h?.last7Days||{},month=h?.last30Days||{};
    const periods=h?'<div class="admin-parity-metrics">'
      +[['Today',today],['7 Days',week],['30 Days',month]].map(([label,d])=>
      '<div><b>'+Number(d.shiurPlays||0).toLocaleString()+'</b><span>'+e(label)+' plays · '+Number(d.uniqueActive||0)+' unique</span></div>').join('')+'</div>':'';
    const playing=(l?.currentPlaying||[]).slice(0,30).map(x=>itemRow(x.title||x.shiurId||'Shiur',
      (x.speaker||'')+' · '+Number(x.listeners||0)+' listening · '+Number(x.video||0)+' video · '+Number(x.audio||0)+' audio')).join('');
    const most=(h?.mostPlayed||[]).slice(0,20).map(x=>itemRow(x.title||x.shiurId||'Shiur',
      (x.speaker||'')+' · '+Number(x.plays||0)+' plays')).join('');
    return panelTitle('Analytics Dashboard','Live users, active shiurim, device platforms and historical listening.')
      +btn('Refresh analytics','refresh')+cards+periods+'<h4>Currently playing</h4>'
      +(playing||'<div class="empty">Nobody is playing a shiur right now.</div>')
      +'<h4>Most played</h4>'+(most||'<div class="empty">No play history yet.</div>');
  }
  if(state.opened==='routing'){
    const d=state.routing;
    if(!d)return panelTitle('Website Playback Routing','Loading website playback configuration.');
    const mode=d.videoMode==='vimeo'?'vimeo':'direct';
    return panelTitle('Website Playback Routing','Affects public website video playback. Android native Media3 playback is separate.')
      +'<div class="admin-parity-choice"><strong>Video:</strong> '
      +btn((mode==='direct'?'✓ ':'')+'HLS → MP4','routing-direct')
      +btn((mode==='vimeo'?'✓ ':'')+'Vimeo only','routing-vimeo')+'</div>'
      +'<div class="admin-parity-choice"><strong>Vimeo fallback:</strong> '
      +btn((d.vimeoFallbackEnabled!==false?'✓ ':'')+'ON','routing-on')
      +btn((d.vimeoFallbackEnabled===false?'✓ ':'')+'OFF','routing-off')+'</div>'
      +'<p class="admin-parity-help">Audio playback: Drive MP3</p>';
  }
  if(state.opened==='schedule'){
    const plan=state.batch;
    return panelTitle('Bulk Schedule JSON Import','Paste JSON with a unique sourceId and 1–100 events. Reusing a sourceId replaces only that batch.')
      +'<textarea data-pa-field="batch-text" rows="10" spellcheck="false" placeholder=\'{"sourceId":"flyer-name","events":[{"date":"2026-10-20","startTime":"12:00","location":"Boro Park","speaker":"...","title":"..."}]}\'>'+e(state.batchText)+'</textarea>'
      +'<div class="admin-parity-actions">'+btn('Preview JSON','schedule-preview')
      +btn('Import lectures','schedule-import',(!plan?'disabled':'') )+'</div>'
      +(plan?'<p class="admin-parity-help">'+plan.events.length+' lectures ready for '+e(plan.sourceId)+'. '
      +e(plan.events.slice(0,4).map(x=>x.date+' · '+(x.title||x.titleEn||x.titleHe)).join(' / '))+'</p>':'');
  }
  if(state.opened==='dates'){
    const plan=state.datePlan;
    const summary=plan?.counts?Object.entries(plan.counts).map(([k,v])=>k+': '+v).join(' · '):'';
    const rows=(plan?.items||[]).slice(0,100).map(x=>itemRow(x.id+' · '+x.status,
      (x.currentTitle||x.csvTitle||'')+' · '+(x.currentDate||'?')+' → '+x.newDate)).join('');
    return panelTitle('Lecture Date CSV Import','Upload Irgun-Certain-Date-Updates.csv. Preview skips missing IDs, mismatched titles and unchanged dates. Only the lecture date is saved.')
      +'<input type="file" accept=".csv,text/csv" data-pa-field="date-file">'
      +(state.dateFile?'<p class="admin-parity-help">Selected: '+e(state.dateFile.name)+'</p>':'')
      +'<div class="admin-parity-actions">'+btn('Preview dates','date-preview')
      +btn('Apply ready dates','date-apply',!(plan?.counts?.ready>0)?'disabled':'')+'</div>'
      +(summary?'<p class="admin-parity-help">'+e(summary)+'</p>':'')
      +rows+(plan?.items?.length>100?'<p>Showing first 100 of '+plan.items.length+' rows.</p>':'');
  }
  if(state.opened==='city-admins'){
    const d=state.assignments;
    const options=(current)=>d.cities.map(city=>'<option value="'+e(city)+'" '+(city===current?'selected':'')+'>'+e(city)+'</option>').join('');
    const add='<form data-pa-form="city-add" class="admin-parity-filters"><input data-pa-field="city-email" type="email" required placeholder="Existing account email"><select data-pa-field="city-new">'+options('')+'</select><button type="submit">Add City Admin</button></form>';
    const rows=d.items.map(x=>{
      const id=String(x.id||'');
      const controls='<select data-pa-field="city-assignment" data-pa-id="'+e(id)+'">'+options(x.city)+'</select>'
       +btn('Save City','city-save','data-pa-id="'+e(id)+'"')
       +btn('Remove','city-remove','data-pa-id="'+e(id)+'"');
      return itemRow(x.name||x.email||'City Admin',x.email||'',controls);
    }).join('');
    return panelTitle('City Admin Assignments','Grant or change access to exactly one city without granting full admin permissions.')
      +add+(rows||'<div class="empty">No City Admin assignments.</div>');
  }
  if(state.opened==='cities'){
    const rows=state.cities.map(x=>{
      const controls='<input data-pa-field="city-hebrew" data-pa-id="'+e(x.city)+'" dir="rtl" maxlength="120" value="'+e(x.nameHe||'')+'" placeholder="Hebrew city name">'
        +btn('Save','city-name-save','data-pa-id="'+e(x.city)+'"');
      return itemRow(x.city||'City','Drive folder name remains unchanged',controls);
    }).join('');
    return panelTitle('Video Shiurim City Names','Set the Hebrew names shown in city filters without changing Drive folder IDs.')
      +btn('Refresh cities','refresh')+(rows||'<div class="empty">No video city folders found.</div>');
  }
  return '';
}
function draw() {
  if(!element?.isConnected)return;
  const buttons=WEBSITE_ADMIN_EXTRA_SECTIONS.map(([id,title])=>
    '<button class="admin-parity-tab '+(id===state.opened?'active':'')+'" type="button" data-pa-open="'+id+'" aria-expanded="'+(id===state.opened?'true':'false')+'">'+e(title)+'</button>').join('');
  element.innerHTML='<section class="admin-panel-card admin-parity"><div class="section-head"><div>'
    +'<h2>Additional Website Admin Controls</h2><p>The same protected website tools, available here in the app.</p></div></div>'
    +'<div class="admin-parity-tabs">'+buttons+'</div>'
    +(state.opened?'<div class="admin-parity-panel">'+(state.loading?'<p class="loading-small">Loading…</p>':'')
      +status()+panelHtml()+'</div>':'')+'</section>';
}
function errorMessage(error) { return String(error?.message || 'The admin request failed.'); }
async function loadCurrent() {
  if(!state.opened || state.loading || !context?.isAdmin?.())return;
  const section=state.opened;
  state.loading=true;state.error='';state.notice='';draw();
  try{
    if(section==='comments'){
      const q=new URLSearchParams({page:String(state.comments.page)});
      if(state.comments.q)q.set('q',state.comments.q);
      if(state.comments.videoId)q.set('videoId',state.comments.videoId);
      const data=await request('/admin/comments?'+q.toString());
      Object.assign(state.comments,{items:data.items||[],total:Number(data.total)||0,
        hasMore:!!data.hasMore,page:Number(data.page)||state.comments.page});
    }else if(section==='contacts'){
      const q=new URLSearchParams();
      if(state.contacts.q)q.set('q',state.contacts.q);
      if(state.contacts.filter!=='all')q.set('status',state.contacts.filter);
      const data=await request('/admin/contact-messages?'+q.toString());
      Object.assign(state.contacts,{items:data.items||[],counts:data.counts||{}});
    }else if(section==='analytics'){
      const [live,history]=await Promise.all([
        request('/admin/analytics/live'),request('/admin/analytics/history')
      ]);
      state.analytics={live,history};
    }else if(section==='routing'){
      state.routing=await request('/admin/playback-routing');
    }else if(section==='city-admins'){
      const data=await request('/admin/city-admins');
      state.assignments={items:data.items||[],cities:data.cities||[]};
    }else if(section==='cities'){
      const data=await request('/admin/drive-video-cities');
      state.cities=data.cities||[];
    }
  }catch(error){state.error=errorMessage(error);}
  finally{state.loading=false;draw();}
}
async function mutate(operation,successText,reload=true) {
  if(state.busy)return;
  try{assertAdmin(true);}
  catch(error){state.error=errorMessage(error);state.notice='';draw();return;}
  state.busy=true;state.error='';state.notice='';draw();
  try{
    await operation();
    state.notice=successText||'Saved.';
    if(reload){state.busy=false;await loadCurrent();}
  }catch(error){state.error=errorMessage(error);}
  finally{state.busy=false;draw();}
}
function findItem(kind,id) {
  const list=kind==='comments'?state.comments.items:state.contacts.items;
  return list.find(x=>String(x.id)===String(id));
}
async function handleAction(button){
  const action=button.dataset.paAction,id=String(button.dataset.paId||'');
  if(action==='refresh'){await loadCurrent();return;}
  if(action==='comments-prev'||action==='comments-next'){
    const d=state.comments;
    if(action==='comments-prev'&&d.page>1)d.page--;
    else if(action==='comments-next'&&d.hasMore)d.page++;
    await loadCurrent();return;
  }
  if(action==='comment-edit'){state.comments.editId=id;draw();return;}
  if(action==='comment-cancel'){state.comments.editId='';draw();return;}
  if(action==='comment-save'){
    const value=String(field('comment-edit-text')?.value||'').trim();
    if(!value||value.length>5000){state.error='Comment text must be 1–5,000 characters.';draw();return;}
    await mutate(async()=>{await request('/admin/comments/edit',postJson({commentId:id,text:value}));state.comments.editId='';},'Comment updated.');
    return;
  }
  if(action==='comment-delete'){
    if(!findItem('comments',id)||!confirm('Permanently delete this comment? This cannot be undone.'))return;
    await mutate(async()=>{await request('/admin/comments/delete',postJson({commentId:id}));if(state.comments.items.length===1&&state.comments.page>1)state.comments.page--;},'Comment deleted.');
    return;
  }
  if(action==='contact-reply'){state.contacts.replyId=id;state.contacts.replyText='';draw();return;}
  if(action==='contact-cancel'){state.contacts.replyId='';state.contacts.replyText='';draw();return;}
  if(action==='contact-send'){
    const value=String(state.contacts.replyText||field('contact-reply-text')?.value||'').trim();
    if(!value){state.error='Enter a reply message.';draw();return;}
    await mutate(async()=>{await request('/admin/contact-messages/reply',postJson({id,message:value}));state.contacts.replyId='';state.contacts.replyText='';},'Reply sent.');
    return;
  }
  if(action==='contact-status'){
    await mutate(()=>request('/admin/contact-messages/status',postJson({id,status:button.dataset.paStatus})),'Message status changed.');
    return;
  }
  if(action==='contact-delete'){
    if(!confirm('Permanently delete this contact message?'))return;
    await mutate(()=>request('/admin/contact-messages/delete',postJson({id})),'Message deleted.');
    return;
  }
  const choices={
    'routing-direct':{videoMode:'direct'}, 'routing-vimeo':{videoMode:'vimeo'},
    'routing-on':{vimeoFallbackEnabled:true},
    'routing-off':{videoMode:'direct',vimeoFallbackEnabled:false}
  };
  if(choices[action]){
    if(!confirm('Change playback routing for the public website?'))return;
    await mutate(()=>request('/admin/playback-routing',postJson(choices[action])),'Website playback setting saved.');
    return;
  }
  if(action==='schedule-preview'){
    try{state.batch=validatedScheduleBatch(state.batchText);state.notice=state.batch.events.length+' lectures ready to import.';state.error='';}
    catch(error){state.batch=null;state.error=errorMessage(error);state.notice='';}
    draw();return;
  }
  if(action==='schedule-import'){
    let plan;
    try{plan=validatedScheduleBatch(state.batchText);}
    catch(error){state.error=errorMessage(error);draw();return;}
    if(!confirm('Import '+plan.events.length+' lectures? Reusing sourceId "'+plan.sourceId+'" will replace that batch.'))return;
    await mutate(async()=>{
      const res=await request('/admin/schedule',postJson({action:'bulk_upsert',sourceId:plan.sourceId,events:plan.events}));
      state.imported=Number(res.imported||plan.events.length);
    },'Schedule batch imported. Open Schedule to review it.',false);
    return;
  }
  if(action==='date-preview'){
    if(!state.dateFile){state.error='Choose Irgun-Certain-Date-Updates.csv first.';draw();return;}
    state.loading=true;state.error='';draw();
    try{
      const contents=await state.dateFile.text();
      const videoMap=await request('/video-map?dateImport='+Date.now());
      state.datePlan=planDateChanges(contents,videoMap);
      state.notice=state.datePlan.counts.ready+' dates ready; no titles will be changed.';
    }catch(error){state.datePlan=null;state.error=errorMessage(error);}
    finally{state.loading=false;draw();}
    return;
  }
  if(action==='date-apply'){
    const changes=(state.datePlan?.items||[]).filter(x=>x.status==='ready');
    if(!changes.length)return;
    if(!confirm('Change lecture date for '+changes.length+' shiurim? No titles or other metadata will change.'))return;
    await mutate(async()=>{
      let ok=0;const errors=[];
      for(const change of changes){
        try{
          await request('/admin/video',postJson({videoId:change.id,item:{lectureDate:change.newDate}}));
          change.status='unchanged';change.currentDate=change.newDate;ok++;
        }catch(error){errors.push(change.id+': '+errorMessage(error));}
      }
      state.datePlan.counts.ready=errors.length;
      state.datePlan.counts.unchanged+=ok;
      if(errors.length)throw new Error(ok+' dates saved; '+errors.length+' failed. '+errors.slice(0,3).join('; '));
      state.imported=ok;
    },'Lecture dates saved. Titles were not changed.',false);
    return;
  }
  if(action==='city-save'){
    const row=[...element.querySelectorAll('[data-pa-field="city-assignment"]')].find(x=>x.dataset.paId===id);
    if(!row?.value)return;
    await mutate(()=>request('/admin/city-admins/'+encodeURIComponent(id),postJson({city:row.value})),'City assignment saved.');
    return;
  }
  if(action==='city-remove'){
    if(!confirm('Remove this City Admin assignment?'))return;
    await mutate(()=>request('/admin/city-admins/'+encodeURIComponent(id),{method:'DELETE'}),'City Admin removed.');
    return;
  }
  if(action==='city-name-save'){
    const input=[...element.querySelectorAll('[data-pa-field="city-hebrew"]')].find(x=>x.dataset.paId===id);
    const nameHe=String(input?.value||'').trim();
    if(!nameHe){state.error='Enter a Hebrew city name.';draw();return;}
    await mutate(()=>request('/admin/drive-video-cities',postJson({city:id,nameHe})),'Hebrew city name saved.');
  }
}
async function handleForm(form) {
  if(form.dataset.paForm!=='city-add')return;
  const email=String(field('city-email')?.value||'').trim();
  const city=String(field('city-new')?.value||'').trim();
  if(!email||!city)return;
  await mutate(()=>request('/admin/city-admins',postJson({email,city})),'City Admin added.');
}

export function mountAdminParity(root,options){
  if(!root||!options?.isAdmin?.())return;
  if(state.owner!==String(options.owner||'')){
    state=emptyState();
    state.owner=String(options.owner||'');
  }
  element=root;context=options;draw();
  root.addEventListener('click',event=>{
    const tab=event.target.closest('[data-pa-open]');
    if(tab){
      state.opened=state.opened===tab.dataset.paOpen?'':tab.dataset.paOpen;
      state.error='';state.notice='';draw();
      if(state.opened)void loadCurrent();
      return;
    }
    const button=event.target.closest('[data-pa-action]');
    if(button && !button.disabled)void handleAction(button);
  });
  root.addEventListener('submit',event=>{
    const form=event.target.closest('[data-pa-form]');
    if(form){event.preventDefault();void handleForm(form);}
  });
  root.addEventListener('change',event=>{
    const el=event.target;
    if(el?.dataset.paField==='contact-filter'){
      state.contacts.filter=el.value;void loadCurrent();
    }else if(el?.dataset.paField==='date-file'){
      state.dateFile=el.files?.[0]||null;state.datePlan=null;state.error='';
      draw();
    }
  });
  root.addEventListener('input',event=>{
    const el=event.target,fieldName=el?.dataset.paField;
    if(fieldName==='batch-text'){state.batchText=el.value;state.batch=null;}
    else if(fieldName==='contact-reply-text')state.contacts.replyText=el.value;
    else if(fieldName==='comment-query'||fieldName==='comment-video'||fieldName==='contact-query'){
      if(fieldName==='comment-query')state.comments.q=el.value;
      if(fieldName==='comment-video')state.comments.videoId=el.value;
      if(fieldName==='contact-query')state.contacts.q=el.value;
      clearTimeout(searchTimer);
      searchTimer=setTimeout(()=>{
        if(state.opened==='comments')state.comments.page=1;
        void loadCurrent();
      },420);
    }
  });
}

export function resetAdminParity(){
  clearTimeout(searchTimer);
  state=emptyState();element=null;context=null;
}
