// Android in-app parity with the protected website account/admin panels.
// The same Worker endpoints enforce authorization. Never cache a token or
// install global request interceptors; the parent app supplies apiJson.
const labels={
  contacts:'Contact Messages',comments:'Comments Management',routing:'Playback Routing',
  schedule:'Bulk Schedule JSON',dates:'Lecture Date CSV',cityAdmins:'City Admins',
  cityNames:'Video City Names',analytics:'Analytics Dashboard'
};
const sections=Object.keys(labels);
const text=(x)=>String(x??'');
const number=(x)=>Number(x||0).toLocaleString('en-US');
const isoDate=(value)=>{
  const v=text(value).trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const date=new Date(v+'T00:00:00Z');
  return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===v;
};
const normalizeTitle=(v)=>text(v).toLowerCase().normalize('NFKC')
  .replace(/[\u2018\u2019\u201C\u201D'"`.,!?;:()\[\]{}\\/_-]+/g,' ').replace(/\s+/g,' ').trim();

export function parseAdminScheduleJson(value){
  const trimmed=text(value).trim();
  if(!trimmed)throw Error('Paste schedule JSON first.');
  let parsed;
  try{parsed=JSON.parse(trimmed)}catch(e){throw Error('Invalid JSON: '+e.message)}
  const sourceId=text(Array.isArray(parsed)?'manual-import':(parsed?.sourceId||'manual-import')).trim();
  const events=Array.isArray(parsed)?parsed:parsed?.events;
  if(!Array.isArray(events)||!events.length)throw Error('JSON needs a nonempty events array.');
  if(events.length>100)throw Error('Import at most 100 lectures per batch.');
  for(const [i,ev] of events.entries()){
    if(!ev||typeof ev!=='object')throw Error('Lecture '+(i+1)+' is invalid.');
    if(!isoDate(ev.date)||!text(ev.location).trim()||
       !text(ev.speaker||ev.speakerEn||ev.speakerHe).trim()||
       !text(ev.title||ev.titleEn||ev.titleHe||ev.topic||ev.topicEn||ev.topicHe).trim()||
       !text(ev.startTime||ev.timeLabel).trim())
      throw Error('Lecture '+(i+1)+' needs a valid date, location, speaker, title and start time.');
  }
  return {sourceId,events};
}

export function parseAdminDateCsv(source){
  const rows=[];let row=[],field='',quoted=false;
  const input=text(source).replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(quoted){
      if(c==='"'&&input[i+1]==='"'){field+='"';i++}
      else if(c==='"')quoted=false;
      else field+=c;
    }else if(c==='"')quoted=true;
    else if(c===','){row.push(field);field=''}
    else if(c==='\n'){row.push(field);rows.push(row);row=[];field=''}
    else if(c!=='\r')field+=c;
  }
  if(field||row.length){row.push(field);rows.push(row)}
  return rows.filter(r=>r.some(cell=>text(cell).trim()));
}

export function planAdminDateChanges(csv,videos){
  const rows=parseAdminDateCsv(csv);
  if(rows.length<2)throw Error('CSV contains no lecture rows.');
  const headers=rows[0].map(v=>text(v).trim());
  const idCol=headers.indexOf('Vimeo ID'),dateCol=headers.indexOf('New Lecture Date');
  const titleCol=headers.indexOf('Irgun Title (DO NOT CHANGE)');
  if(idCol<0||dateCol<0)throw Error('Expected the Irgun Certain Date Updates CSV.');
  const byId=new Map((Array.isArray(videos)?videos:[]).map(v=>[text(v.id||v.vimeoId).trim(),v]));
  const counts={ready:0,unchanged:0,review:0,missing:0,invalid:0},seen=new Set(),items=[];
  for(const cells of rows.slice(1)){
    const id=text(cells[idCol]).trim(),newDate=text(cells[dateCol]).trim();
    const csvTitle=titleCol<0?'':text(cells[titleCol]).trim();
    const video=byId.get(id);
    let status='ready',currentTitle='',currentDate='';
    if(!id||seen.has(id)||!isoDate(newDate))status='invalid';
    else if(!video)status='missing';
    else{
      currentTitle=text(video.title).trim();
      currentDate=text(video.lectureDate||video.date).trim();
      if(newDate===currentDate)status='unchanged';
      else if(csvTitle&&normalizeTitle(csvTitle)!==normalizeTitle(currentTitle))status='review';
    }
    if(id)seen.add(id);
    counts[status]++;
    items.push({id,newDate,csvTitle,currentTitle,currentDate,status});
  }
  return {items,counts};
}

export function createWebsiteAdminParity({apiJson,esc,isAdmin,isAdminMode,userKey,render,toast,ask}){
  const initial=()=>({
    panel:'',error:'',success:'',busy:false,busyAction:'',
    loaded:{},contact:{items:[],counts:{},q:'',status:'all'},
    comments:{items:[],page:1,total:0,hasMore:false,q:'',videoId:''},
    routing:{videoMode:'direct',vimeoFallbackEnabled:true},
    cityAdmins:{items:[],cities:[]},cityNames:[],
    analytics:{live:{},history:{}},
    scheduleText:'',schedulePlan:null,datePlan:null,dateFileName:''
  });
  let model=initial(),account='';
  const when=()=>{const current=text(userKey());if(current!==account){account=current;model=initial()}}
  const E=(v)=>esc(text(v)), json=(path,body,method='POST')=>
    apiJson(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const present=()=>{if(isAdmin())render()};
  const notify=(msg)=>{model.success=msg;model.error='';toast(msg)};
  const fail=(e)=>{model.error=e?.message||'Admin request failed.';model.success='';present()};
  const safe=fn=>async()=>{if(!isAdmin()||model.busy)return;model.busy=true;model.error='';model.success='';present();
    try{await fn()}catch(e){model.error=e.message||'Action failed.'}finally{model.busy=false;present()}};
  const card=(name,body)=>'<div class="admin-parity-panel"><div class="section-head"><h3>'+E(labels[name])+'</h3><button type="button" data-hub-action="refresh">Refresh</button></div>'+body+'</div>';
  const buttons=(item)=>'<button type="button" class="admin-parity-tab '+(model.panel===item?'active':'')+'" data-hub-panel="'+item+'" aria-pressed="'+String(model.panel===item)+'">'+E(labels[item])+'</button>';
  const empty=(txt)=>'<div class="empty">'+E(txt)+'</div>';
  const submit=(label)=>'<button class="admin-save" type="submit">'+E(label)+'</button>';
  const confirmAdminMode=(description)=>isAdminMode()&&ask(description);

  function contactsHtml(){
    const m=model.contact;
    const filters=['all','unread','read','replied','archived'];
    const top='<form data-hub-form="search-contact" class="admin-inline-form"><input name="q" aria-label="Search contact messages" placeholder="Search messages" value="'+E(m.q)+'"><select name="status">'+filters.map(v=>'<option value="'+v+'" '+(m.status===v?'selected':'')+'>'+v+'</option>').join('')+'</select>'+submit('Search')+'</form>';
    const counts='<p>'+filters.slice(1).map(s=>s+': '+number(m.counts[s])).join(' · ')+'</p>';
    const list=m.items.map(item=>{
      const id=E(item.id),status=text(item.status||'read'),email=text(item.email||'');
      return '<details class="admin-parity-row" data-hub-contact="'+id+'"><summary><strong>'+E(item.subject||'No subject')+'</strong> · '+E(item.name||email)+' <small>'+E(status)+' · '+E(item.createdAt)+'</small></summary>'+
      '<p><a href="mailto:'+encodeURIComponent(email)+'">'+E(email)+'</a>'+ (item.phone?' · '+E(item.phone):'')+'</p>'+
      '<p class="admin-parity-message" dir="auto">'+E(item.message)+'</p>'+
      (item.replyText?'<p><strong>Last reply:</strong> '+E(item.replyText)+'</p>':'')+
      '<div class="admin-parity-actions"><button type="button" data-hub-action="contact-status" data-id="'+id+'" data-status="'+(status==='unread'?'read':'unread')+'">'+(status==='unread'?'Mark read':'Mark unread')+'</button>'+
      '<button type="button" data-hub-action="contact-status" data-id="'+id+'" data-status="'+(status==='archived'?'read':'archived')+'">'+(status==='archived'?'Restore':'Archive')+'</button>'+
      '<button type="button" class="danger" data-hub-action="contact-delete" data-id="'+id+'">Delete</button></div>'+
      '<label class="admin-parity-reply">Reply by email<textarea data-hub-reply="'+id+'" rows="3" maxlength="10000"></textarea></label>'+
      '<button type="button" data-hub-action="contact-reply" data-id="'+id+'">Send reply</button></details>';
    }).join('');
    return card('contacts',top+counts+(list||empty('No contact messages found.')));
  }
  function commentsHtml(){
    const m=model.comments;
    const form='<form data-hub-form="search-comment" class="admin-inline-form"><input name="q" placeholder="Comment or author" aria-label="Search comments" value="'+E(m.q)+'"><input name="videoId" placeholder="Shiur ID" aria-label="Filter by shiur ID" value="'+E(m.videoId)+'">'+submit('Search')+'</form>';
    const rows=m.items.map(row=>'<article class="admin-parity-row" data-hub-comment="'+E(row.id)+'"><strong>'+E(row.author||'Anonymous')+'</strong> · <small>'+E(row.created)+'</small><p>Shiur: '+E(row.videoId)+'</p><label>Comment<textarea rows="3" maxlength="5000" data-hub-edit-text>'+E(row.text)+'</textarea></label><div class="admin-parity-actions"><button data-hub-action="comment-save" data-id="'+E(row.id)+'">Save edit</button><button class="danger" data-hub-action="comment-delete" data-id="'+E(row.id)+'">Delete permanently</button></div></article>').join('');
    const pages='<div class="admin-parity-actions"><button data-hub-action="comment-page" data-page="'+(m.page-1)+'" '+(m.page<=1?'disabled':'')+'>Previous</button><span>Page '+m.page+' · '+number(m.total)+' total</span><button data-hub-action="comment-page" data-page="'+(m.page+1)+'" '+(!m.hasMore?'disabled':'')+'>Next</button></div>';
    return card('comments',form+(rows||empty('No comments found.'))+pages);
  }
  function routingHtml(){
    const m=model.routing, option=(value,label,selected)=>'<option value="'+value+'" '+(selected?'selected':'')+'>'+label+'</option>';
    return card('routing','<p>Sets playback behaviour for regular <strong>website</strong> videos; does not change native Media3 settings.</p><form data-hub-form="routing" class="admin-form-grid"><label>Video mode<select name="videoMode">'+option('direct','HLS → MP4',m.videoMode!=='vimeo')+option('vimeo','Vimeo only',m.videoMode==='vimeo')+'</select></label><label>Fallback<select name="vimeoFallbackEnabled">'+option('true','Vimeo fallback ON',m.vimeoFallbackEnabled!==false)+option('false','Vimeo fallback OFF (NetFree-safe)',m.vimeoFallbackEnabled===false)+'</select></label><p>Audio: Drive MP3 (fixed)</p>'+submit('Save website routing')+'</form>');
  }
  function scheduleHtml(){
    const plan=model.schedulePlan;
    return card('schedule','<p>Paste a JSON array or {"sourceId":"flyer-id","events":[...]}. Importing the same sourceId again replaces only that batch.</p><textarea id="hubScheduleJson" rows="9" spellcheck="false" placeholder="Paste schedule JSON">'+E(model.scheduleText)+'</textarea>'+
      '<div class="admin-parity-actions"><button data-hub-action="schedule-preview">Preview JSON</button><button data-hub-action="schedule-import" '+(!plan?'disabled':'')+'>Import lectures</button></div>'+
      (plan?'<p><strong>'+number(plan.events.length)+' lectures ready</strong> · Source ID: '+E(plan.sourceId)+'</p>'+plan.events.slice(0,6).map(v=>'<p>'+E(v.date)+' · '+E(v.location)+' · '+E(v.speaker||v.speakerEn||v.speakerHe)+' · '+E(v.title||v.titleEn||v.titleHe)+'</p>').join(''):''));
  }
  function datesHtml(){
    const plan=model.datePlan;
    const counts=plan?.counts||{};
    return card('dates','<p>Upload Irgun-Certain-Date-Updates.csv. Only Lecture date is written, after matching Vimeo ID and title.</p>'+
      '<input type="file" id="hubDateFile" accept=".csv,text/csv" aria-label="Lecture date CSV"><div class="admin-parity-actions"><button data-hub-action="date-preview">Preview CSV</button><button data-hub-action="date-apply" '+(!counts.ready?'disabled':'')+'>Apply '+number(counts.ready)+' ready dates</button></div>'+
      (plan?'<p>Ready: '+number(counts.ready)+' · Already correct: '+number(counts.unchanged)+' · Needs title review: '+number(counts.review)+' · ID not found: '+number(counts.missing)+' · Invalid: '+number(counts.invalid)+'</p>'+
      plan.items.slice(0,40).map(item=>'<div class="admin-parity-compact"><b>'+E(item.status)+'</b> · '+E(item.id)+' · '+E(item.currentDate)+' → '+E(item.newDate)+' · '+E(item.currentTitle)+'</div>').join(''):''));
  }
  function cityAdminsHtml(){
    const m=model.cityAdmins;
    return card('cityAdmins','<p>Grant or remove limited access to exactly one city without giving full admin privileges.</p>'+
      '<form data-hub-form="city-add" class="admin-inline-form"><input name="email" type="email" required placeholder="Existing account email"><select name="city" required>'+m.cities.map(v=>'<option value="'+E(v)+'">'+E(v)+'</option>').join('')+'</select>'+submit('Add City Admin')+'</form>'+
      (m.items.map(row=>'<div class="admin-parity-row" data-hub-cityadmin="'+E(row.id)+'"><strong>'+E(row.name||row.email)+'</strong><small> '+E(row.email)+'</small><div class="admin-parity-actions"><select data-hub-city-select>'+m.cities.map(city=>'<option value="'+E(city)+'" '+(city===row.city?'selected':'')+'>'+E(city)+'</option>').join('')+'</select><button data-hub-action="city-save" data-id="'+E(row.id)+'">Save city</button><button class="danger" data-hub-action="city-delete" data-id="'+E(row.id)+'">Remove</button></div></div>').join('')||empty('No City Admin assignments.')));
  }
  function cityNamesHtml(){
    return card('cityNames','<p>Manage the Hebrew label for Video Shiurim cities. The actual Drive folder identifier does not change.</p>'+
      (model.cityNames.map(row=>'<div class="admin-parity-row admin-inline-form" data-hub-cityname="'+E(row.city)+'"><strong>'+E(row.city)+'</strong><input type="text" dir="rtl" maxlength="120" aria-label="Hebrew name for '+E(row.city)+'" value="'+E(row.nameHe||'')+'"><button data-hub-action="city-name-save" data-city="'+E(row.city)+'">Save</button></div>').join('')||empty('No Video Shiurim city folders.')));
  }
  function analyticsHtml(){
    const live=model.analytics.live||{},history=model.analytics.history||{};
    const period=(label,p)=>'<div class="admin-parity-stat"><strong>'+label+'</strong><span>'+number(p?.uniqueActive)+' active · '+number(p?.shiurPlays)+' plays · '+number(p?.videoStarts)+' video · '+number(p?.audioStarts)+' audio</span><small>Web '+number(p?.web)+' · Android '+number(p?.android)+' · iOS '+number(p?.ios)+'</small></div>';
    const metric=(label,n)=>'<div class="admin-parity-stat"><strong>'+number(n)+'</strong><span>'+label+'</span></div>';
    return card('analytics','<p>Live dashboard and historical activity. Refresh manually to avoid background polling while listening.</p>'+
      '<div class="admin-parity-metrics">'+metric('Active now',live.activeNow)+metric('Listening now',live.playingNow)+metric('Website',live.platforms?.web)+metric('Android',live.platforms?.android)+metric('iOS',live.platforms?.ios)+metric('Browsing',live.browsing)+'</div>'+
      '<h4>History</h4>'+period('Today',history.today)+period('Last 7 days',history.last7Days)+period('Last 30 days',history.last30Days)+
      '<h4>Most played shiurim</h4>'+(history.mostPlayed||[]).slice(0,15).map(x=>'<div class="admin-parity-compact">'+E(x.speaker?x.speaker+' – '+(x.title||x.shiurId):(x.title||x.shiurId))+' · '+number(x.plays)+' plays</div>').join('')+
      '<h4>Currently playing</h4>'+(live.currentPlaying||[]).slice(0,15).map(x=>'<div class="admin-parity-compact">'+E(x.speaker?x.speaker+' – '+(x.title||x.shiurId):(x.title||x.shiurId))+' · '+number(x.listeners)+' listeners</div>').join(''));
  }
  function html(){
    if(!isAdmin())return '';
    when();
    const body=({contacts:contactsHtml,comments:commentsHtml,routing:routingHtml,
      schedule:scheduleHtml,dates:datesHtml,cityAdmins:cityAdminsHtml,
      cityNames:cityNamesHtml,analytics:analyticsHtml})[model.panel];
    return '<section id="websiteAdminParity" class="admin-panel-card admin-website-hub"><div class="section-head"><div><h2>Website Admin Features</h2><p>Protected by the same Worker permissions as the website. Choose a section to manage it in the app.</p></div></div>'+
      '<div class="admin-parity-menu">'+sections.map(buttons).join('')+'</div>'+
      (model.error?'<div class="error" role="alert">'+E(model.error)+'</div>':'')+
      (model.success?'<p class="admin-parity-success" role="status">'+E(model.success)+'</p>':'')+
      (model.busy?'<div class="loading-small">Working…</div>':'')+
      (body?body():'<p>Select an admin section above.</p>')+'</section>';
  }
  async function loadOpened(force=false){
    if(!isAdmin()||!model.panel||model.busy||(!force&&model.loaded[model.panel]))return;
    const part=model.panel;model.busy=true;model.error='';present();
    try{
      if(part==='contacts'){
        const m=model.contact;
        const qs=new URLSearchParams();
        if(m.status!=='all')qs.set('status',m.status);
        if(m.q)qs.set('q',m.q);
        const d=await apiJson('/admin/contact-messages?'+qs.toString());
        model.contact={...m,items:d.items||[],counts:d.counts||{}};
      }else if(part==='comments'){
        const m=model.comments,qs=new URLSearchParams({page:String(m.page)});
        if(m.q)qs.set('q',m.q);if(m.videoId)qs.set('videoId',m.videoId);
        const d=await apiJson('/admin/comments?'+qs.toString());
        model.comments={...m,items:d.items||[],total:Number(d.total)||0,
          page:Number(d.page)||m.page,hasMore:Boolean(d.hasMore)};
      }else if(part==='routing')model.routing=await apiJson('/admin/playback-routing');
      else if(part==='cityAdmins')model.cityAdmins=await apiJson('/admin/city-admins');
      else if(part==='cityNames')model.cityNames=(await apiJson('/admin/drive-video-cities')).cities||[];
      else if(part==='analytics'){
        const [live,history]=await Promise.all([apiJson('/admin/analytics/live'),apiJson('/admin/analytics/history')]);
        model.analytics={live,history};
      }
      model.loaded[part]=true;
    }catch(e){model.error=e.message||'Could not load '+labels[part];model.loaded[part]=true}
    finally{model.busy=false;present()}
  }
  function choose(next){
    when();if(!isAdmin()||!sections.includes(next))return;
    model.panel=model.panel===next?'':next;model.error='';model.success='';present();
    if(model.panel)void loadOpened();
  }
  async function act(action,button,root){
    if(!isAdmin()||model.busy)return;
    const id=text(button.dataset.id),item=model.panel;
    if(action==='refresh'){model.loaded[item]=false;return loadOpened(true)}
    if(action==='comment-page'){
      model.comments.page=Number(button.dataset.page)||1;model.loaded.comments=false;return loadOpened(true);
    }
    if(action==='schedule-preview'){
      try{model.scheduleText=root.querySelector('#hubScheduleJson')?.value||'';
        model.schedulePlan=parseAdminScheduleJson(model.scheduleText);model.error='';model.success='Preview ready.'}
      catch(e){model.schedulePlan=null;model.error=e.message}
      return present();
    }
    if(action==='date-preview'){
      const file=root.querySelector('#hubDateFile')?.files?.[0];
      if(!file){model.error='Choose a CSV file first.';return present()}
      model.busy=true;model.error='';present();
      try{
        if(file.size>3*1024*1024)throw Error('CSV file is too large (3 MB max).');
        const csv=await file.text();
        const videos=await apiJson('/video-map?dateImport='+Date.now());
        if(!Array.isArray(videos))throw Error('The video catalog was not available.');
        model.datePlan=planAdminDateChanges(csv,videos);
        model.dateFileName=file.name;model.success='Date preview ready. No titles will be changed.';
      }catch(e){model.datePlan=null;model.error=e.message}
      finally{model.busy=false;present()}
      return;
    }
    if(action==='schedule-import'){
      const current=root.querySelector('#hubScheduleJson')?.value||'';
      let plan;
      try{plan=parseAdminScheduleJson(current)}catch(e){model.error=e.message;return present()}
      if(!model.schedulePlan||current!==model.scheduleText){model.error='Preview the current JSON before importing.';return present()}
      if(!confirmAdminMode('Import '+plan.events.length+' lectures? Existing rows with sourceId '+plan.sourceId+' will be replaced.'))return;
      return write(async()=>{
        const d=await json('/admin/schedule',{action:'bulk_upsert',sourceId:plan.sourceId,events:plan.events});
        notify(number(d.imported||plan.events.length)+' lectures imported.');model.schedulePlan=null;
      });
    }
    if(action==='date-apply'){
      const ready=(model.datePlan?.items||[]).filter(x=>x.status==='ready');
      if(!ready.length||!confirmAdminMode('Update the Lecture date for '+ready.length+' shiurim? No titles will change.'))return;
      return write(async()=>{
        let ok=0,fail=0;
        for(const x of ready){
          try{await json('/admin/video',{videoId:x.id,item:{lectureDate:x.newDate}});
            x.status='unchanged';x.currentDate=x.newDate;ok++}
          catch(e){fail++}
        }
        model.datePlan.counts.ready=fail;model.datePlan.counts.unchanged+=ok;
        notify(ok+' dates updated.'+(fail?' '+fail+' failed; retry after reviewing.':''));
      });
    }
    if(action==='contact-status'){
      return write(async()=>{await json('/admin/contact-messages/status',{id,status:button.dataset.status});
        model.loaded.contacts=false;await reload('contacts');notify('Contact message updated.')});
    }
    if(action==='contact-delete'){
      if(!ask('Permanently delete this contact message?'))return;
      return write(async()=>{await json('/admin/contact-messages/delete',{id});
        model.loaded.contacts=false;await reload('contacts');notify('Contact message deleted.')});
    }
    if(action==='contact-reply'){
      const row=[...root.querySelectorAll('[data-hub-contact]')].find(x=>x.dataset.hubContact===id);
      const message=text(row?.querySelector('textarea[data-hub-reply]')?.value).trim();
      if(!message){model.error='Write the email reply first.';return present()}
      if(!ask('Send this email reply to the contact?'))return;
      return write(async()=>{await json('/admin/contact-messages/reply',{id,message});
        model.loaded.contacts=false;await reload('contacts');notify('Reply sent.')});
    }
    if(action==='comment-save'||action==='comment-delete'){
      const row=[...root.querySelectorAll('[data-hub-comment]')].find(x=>x.dataset.hubComment===id);
      const comment=model.comments.items.find(x=>text(x.id)===id);
      if(!comment)return;
      const value=text(row?.querySelector('textarea[data-hub-edit-text]')?.value).trim();
      if(action==='comment-delete'&&!ask('Permanently delete this comment?'))return;
      if(action==='comment-save'&&(!value||value===text(comment.text)))return;
      return write(async()=>{
        await json(action==='comment-delete'?'/admin/comments/delete':'/admin/comments/edit',
          action==='comment-delete'?{commentId:id}:{commentId:id,text:value});
        if(action==='comment-delete'&&model.comments.items.length===1&&model.comments.page>1)model.comments.page--;
        model.loaded.comments=false;await reload('comments');notify('Comment '+(action==='comment-delete'?'deleted.':'updated.'));
      });
    }
    if(action==='city-save'||action==='city-delete'){
      if(action==='city-delete'&&!ask('Remove this City Admin assignment?'))return;
      const row=[...root.querySelectorAll('[data-hub-cityadmin]')].find(x=>x.dataset.hubCityadmin===id);
      const city=row?.querySelector('[data-hub-city-select]')?.value||'';
      return write(async()=>{
        if(action==='city-delete')await apiJson('/admin/city-admins/'+encodeURIComponent(id),{method:'DELETE'});
        else await json('/admin/city-admins/'+encodeURIComponent(id),{city});
        model.loaded.cityAdmins=false;await reload('cityAdmins');notify('City Admin updated.');
      });
    }
    if(action==='city-name-save'){
      const city=text(button.dataset.city);
      const row=[...root.querySelectorAll('[data-hub-cityname]')].find(x=>x.dataset.hubCityname===city);
      const nameHe=text(row?.querySelector('input')?.value).trim();
      if(!nameHe){model.error='Enter a Hebrew city name.';return present()}
      return write(async()=>{await json('/admin/drive-video-cities',{city,nameHe});
        model.loaded.cityNames=false;await reload('cityNames');notify('Hebrew city name saved.')});
    }
  }
  async function reload(name){
    // Called only inside an authenticated write. Avoid clearing the busy guard
    // in loadOpened: this request never changes the current active panel.
    const m=model;
    if(name==='contacts'){
      const q=new URLSearchParams();if(m.contact.q)q.set('q',m.contact.q);
      if(m.contact.status!=='all')q.set('status',m.contact.status);
      const d=await apiJson('/admin/contact-messages?'+q);m.contact={...m.contact,items:d.items||[],counts:d.counts||{}};
    }else if(name==='comments'){
      const q=new URLSearchParams({page:String(m.comments.page)});
      if(m.comments.q)q.set('q',m.comments.q);
      if(m.comments.videoId)q.set('videoId',m.comments.videoId);
      const d=await apiJson('/admin/comments?'+q);
      m.comments={...m.comments,items:d.items||[],total:Number(d.total)||0,
        hasMore:Boolean(d.hasMore),page:Number(d.page)||m.comments.page};
    }else if(name==='cityAdmins')m.cityAdmins=await apiJson('/admin/city-admins');
    else if(name==='cityNames')m.cityNames=(await apiJson('/admin/drive-video-cities')).cities||[];
    m.loaded[name]=true;
  }
  async function write(callback){
    if(!isAdmin()||model.busy)return;
    model.busy=true;model.error='';model.success='';present();
    try{await callback()}catch(e){model.error=e.message||'Save failed.'}
    finally{model.busy=false;present()}
  }
  function bind(root){
    if(!isAdmin())return;
    const host=root.getElementById('websiteAdminParity');
    if(!host)return;
    host.addEventListener('click',event=>{
      const panel=event.target.closest('[data-hub-panel]');
      if(panel){choose(panel.dataset.hubPanel);return}
      const button=event.target.closest('[data-hub-action]');
      if(button&&!button.disabled){event.preventDefault();void act(button.dataset.hubAction,button,host)}
    });
    host.addEventListener('submit',event=>{
      const form=event.target.closest('[data-hub-form]');if(!form)return;
      event.preventDefault();
      if(!isAdmin()||model.busy)return;
      const values=new FormData(form),formName=form.dataset.hubForm;
      if(formName==='search-contact'){
        model.contact.q=text(values.get('q')).trim();
        model.contact.status=text(values.get('status'))||'all';
        model.loaded.contacts=false;void loadOpened(true);
      }else if(formName==='search-comment'){
        model.comments.q=text(values.get('q')).trim();
        model.comments.videoId=text(values.get('videoId')).trim();
        model.comments.page=1;model.loaded.comments=false;void loadOpened(true);
      }else if(formName==='routing'){
        const next={videoMode:text(values.get('videoMode')),
          vimeoFallbackEnabled:text(values.get('vimeoFallbackEnabled'))==='true'};
        void write(async()=>{model.routing=await json('/admin/playback-routing',next);
          notify('Website playback routing saved.')});
      }else if(formName==='city-add'){
        const email=text(values.get('email')).trim(),city=text(values.get('city')).trim();
        if(!email||!city){model.error='Choose a city and enter an email.';return present()}
        void write(async()=>{await json('/admin/city-admins',{email,city});
          model.loaded.cityAdmins=false;await reload('cityAdmins');notify('City Admin added.')});
      }
    });
  }
  return {html,bind,loadOpened,reset:()=>{model=initial();account=''}};
}
