// Android-only adapter to the website's published, public Belsky index JSON.
// Rendering and folder navigation never authorize playback: signed sessions still
// require Worker-owned entitlements and the existing native Media3 engine.
import {BELSKY_VOL1_ID,BELSKY_INDEX_URL,belskyAlbumForSession,belskySessionLabel,
  paidFolderKey,paidFolderPath,parseBelskyIndex} from './android-paid-collections.js';
import {paidQuestionIndexHtml,paidQuestionResultsHtml} from './android-paid-catalog-ui.js';

export function createAndroidPaidQuestionController({state,CapacitorHttp,render,esc,isHebrew}) {
  function owned() {
    return Boolean(state.paidCatalog.find(item=>String(item.id)===BELSKY_VOL1_ID)?.owned);
  }
  async function load(force=false) {
    if(state.paidQuestionIndexLoading||(state.paidQuestionIndexLoaded&&!force))return;
    state.paidQuestionIndexLoading=true;
    state.paidQuestionIndexError='';
    if(state.paidQuestionIndexOpen)render();
    try {
      // The SAME file is used by irgunshiuraitorah.com/belsky-question-index.html.
      // Native HTTP avoids the cross-origin restriction of an embedded app UI.
      const response=await CapacitorHttp.get({url:BELSKY_INDEX_URL,
        headers:{Accept:'application/json'},connectTimeout:12000,readTimeout:18000});
      if(Number(response.status)!==200)throw new Error('Index request returned '+response.status);
      const data=typeof response.data==='string'?JSON.parse(response.data):response.data;
      state.paidQuestionSessions=parseBelskyIndex(data);
      state.paidQuestionIndexLoaded=true;
    }catch(error){
      state.paidQuestionIndexError=error?.message||'Could not load the shared question index.';
    }finally{
      state.paidQuestionIndexLoading=false;
      if(state.paidQuestionIndexOpen)render();
    }
  }
  function open() {
    state.paidQuestionIndexOpen=true;
    state.paidQuestionSearch='';
    state.paidQuestionDisc='all';
    state.paidQuestionLimit=70;
    render();
    void load();
  }
  function close() {
    state.paidQuestionIndexOpen=false;
    render();
  }
  function html() {
    return paidQuestionIndexHtml({
      sessions:state.paidQuestionSessions,
      loading:state.paidQuestionIndexLoading||!state.paidQuestionIndexLoaded&&!state.paidQuestionIndexError,
      error:state.paidQuestionIndexError,
      search:state.paidQuestionSearch,disc:state.paidQuestionDisc,
      limit:state.paidQuestionLimit,owned:owned(),esc,isHebrew:isHebrew()
    });
  }
  function updateResults(doc) {
    if(!state.paidQuestionIndexLoaded)return;
    const results=paidQuestionResultsHtml({sessions:state.paidQuestionSessions,
      search:state.paidQuestionSearch,disc:state.paidQuestionDisc,
      limit:state.paidQuestionLimit,owned:owned(),esc,isHebrew:isHebrew()});
    const mount=doc.getElementById('paidQuestionResults');
    if(mount)mount.innerHTML=results.html;
    const count=doc.getElementById('paidQuestionCount');
    if(count)count.textContent=results.count+' indexed topics';
    const more=doc.getElementById('paidQuestionMore');
    if(more)more.hidden=!results.more;
    bindSessionButtons(doc);
  }
  function openSession(session,part=0) {
    const album=belskyAlbumForSession(session);
    if(!album)return;
    state.paidExpandedId=BELSKY_VOL1_ID;
    // Find the ACTUAL session path in the Worker's public preview or owned
    // tracks. We can verify a folder from metadata but must never assume that
    // an indexed question corresponds to one specific protected audio track.
    const product=state.paidCatalog.find(item=>String(item.id)===BELSKY_VOL1_ID);
    const records=product?.owned ? product.tracks : product?.folderPreview;
    const code='RB-01-'+String(session).padStart(2,'0');
    const row=(Array.isArray(records)?records:[]).find(item=>
      Array.isArray(item?.folders) && item.folders.some(name=>String(name).trim().toUpperCase()===code));
    if(row) {
      const path=paidFolderPath(BELSKY_VOL1_ID,row.folders);
      for(let index=1;index<=path.length;index++)
        state.paidOpenFolders.add(paidFolderKey(BELSKY_VOL1_ID,path.slice(0,index)));
    }
    state.paidQuestionIndexOpen=false;
    render();
    setTimeout(()=>{
      const card=docSafeQuery('[data-paid-expand="'+BELSKY_VOL1_ID+'"]');
      card?.closest('.paid-card')?.scrollIntoView?.({behavior:'smooth',block:'start'});
    },0);
  }
  function docSafeQuery(selector) {
    try{return document.querySelector(selector);}catch(_){return null;}
  }
  function bindSessionButtons(doc) {
    doc.querySelectorAll('[data-paid-index-session]').forEach(button=>{
      button.addEventListener('click',()=>openSession(
        Number(button.dataset.paidIndexSession),Number(button.dataset.paidIndexPart)||0));
    });
  }
  function bind(doc) {
    doc.querySelectorAll('[data-paid-index-open]').forEach(button=>button.addEventListener('click',open));
    doc.querySelectorAll('[data-paid-index-close]').forEach(button=>button.addEventListener('click',close));
    doc.querySelectorAll('[data-paid-index-retry]').forEach(button=>button.addEventListener('click',()=>load(true)));
    const search=doc.getElementById('paidQuestionSearch');
    search?.addEventListener('input',()=>{state.paidQuestionSearch=search.value;state.paidQuestionLimit=70;updateResults(doc);});
    const filter=doc.getElementById('paidQuestionDisc');
    filter?.addEventListener('change',()=>{state.paidQuestionDisc=filter.value;state.paidQuestionLimit=70;updateResults(doc);});
    doc.querySelectorAll('[data-paid-index-more]').forEach(button=>button.addEventListener('click',()=>{
      state.paidQuestionLimit+=100;updateResults(doc);
    }));
    bindSessionButtons(doc);
    doc.querySelectorAll('[data-paid-folder-key]').forEach(folder=>folder.addEventListener('toggle',()=>{
      const key=String(folder.dataset.paidFolderKey||'');
      if(!key)return;
      if(folder.open)state.paidOpenFolders.add(key);
      else state.paidOpenFolders.delete(key);
    }));
  }
  return {open,close,html,bind,load};
}
