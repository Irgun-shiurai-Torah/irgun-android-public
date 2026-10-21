// Read-only observations appended to disposable debug builds; no credentials or UI setters.

/*
 * R8 account diagnostic: record only the outcome of the speaker/topic follow
 * mutation. Never record request bodies, labels, account identifiers, tokens,
 * cookies, or passwords. This file is appended only to disposable QA builds.
 */
window.__ISTAccountApiRequests = window.__ISTAccountApiRequests || [];
{
  const originalApiJson = apiJson;
  apiJson = async function(path, options) {
    const normalized = String(path || '').split('?')[0];
    if (normalized !== '/follows/toggle') return originalApiJson(path, options);
    const started = Date.now();
    try {
      const result = await originalApiJson(path, options);
      window.__ISTAccountApiRequests.push({
        path: normalized, status: 200,
        following: typeof result?.following === 'boolean' ? result.following : null,
        elapsedMs: Date.now() - started
      });
      return result;
    } catch (error) {
      window.__ISTAccountApiRequests.push({
        path: normalized, status: Number(error?.status) || 0,
        error: String(error?.message || 'request failed').slice(0, 120),
        elapsedMs: Date.now() - started
      });
      throw error;
    }
  };
}
window.ISTAccountTest = {
  snapshot() {
  const qaComment = state.watchComments?.find(c =>
    String(c.user_id) === String(state.user?.id) && String(c.text || '').startsWith('IRGUN-QA-')
  ) || null;
  const qaCommentId = qaComment ? String(qaComment.id) : '';
  const qaPlaylist=state.playlists.filter(p=>/^Irgun-QA-\d+$/.test(p.name)).sort((a,b)=>b.name.localeCompare(a.name))[0];
  const queries = {
    commentText:'#commentText', postComment:'#commentForm button[type="submit"]',
    editQaComment:qaCommentId ? '[data-edit-comment="'+qaCommentId+'"]' : '#irgun-qa-comment-unavailable',
    editedQaText:qaCommentId ? '#editCommentText-'+qaCommentId : '#irgun-qa-comment-unavailable',
    saveQaComment:qaCommentId ? '[data-save-comment="'+qaCommentId+'"]' : '#irgun-qa-comment-unavailable',
    deleteQaComment:qaCommentId ? '[data-delete-comment="'+qaCommentId+'"]' : '#irgun-qa-comment-unavailable',
    home: '.bottom-nav [data-nav="home"]', account: '.bottom-nav [data-nav="account"]', shiurim: '.bottom-nav [data-nav="shiurim"]',
    library: '.bottom-nav [data-nav="library"]', email: '#authEmail', password: '#authPassword',
    login: '#authForm button[type="submit"]', logout: '[data-logout]',
    profile: '[data-account-section="profile"]', settings: '[data-account-section="settings"]',
    open: '.media-primary-overlay button[data-watch],button.media-title[data-watch]', like: '.watch-actions [data-like],.watch-action[data-like]',
    audioMode: '[data-watch-mode="audio"]', audioPlay: '.watch-audio-play[data-play-toggle]',
    save: '.watch-actions [data-open-playlist-picker],.watch-action[data-open-playlist-picker]',
    later: '.playlist-picker [data-save]', closePicker: '.playlist-picker-head [data-playlist-picker-close]',
    closeWatch: '[data-close-watch]', follow: '[data-follow-type="speaker"]',
    playlists: '[data-library-section="playlists"]', playlistName: '#libraryPlaylistCreateName',
    createPlaylist: '#libraryPlaylistCreateForm button[type="submit"]',
    testPlaylist: qaPlaylist?'[data-playlist-open="'+qaPlaylist.id+'"]':'#qa-playlist-unavailable',
    deletePlaylist: qaPlaylist?'[data-playlist-delete="'+qaPlaylist.id+'"]':'#qa-playlist-unavailable',
    playlistBack: '[data-playlist-back]',
    addQaPlaylist: qaPlaylist?'[data-playlist-add-target="'+qaPlaylist.id+'"]':'#qa-playlist-unavailable',
    removeQaPlaylistItem: qaPlaylist?'[data-playlist-remove="'+qaPlaylist.id+'"]':'#qa-playlist-unavailable',
    language: '[data-language-toggle]',videoMode:'[data-watch-mode="video"]',
    history: '[data-library-section="history"]', likes: '[data-library-section="likes"]',
    saved: '[data-library-section="later"]', following: '[data-library-section="following"]'
  };
  const scroll=document.querySelector('.watch-overlay .watch-scroll');
  const watchScroll=scroll ? (()=>{const r=scroll.getBoundingClientRect();
    const nav=document.querySelector('#androidBottomNavigationMount .bottom-nav')?.getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height,top:scroll.scrollTop,
      visibleBottom:Math.min(innerHeight,r.bottom,nav?.height>0?nav.top-8:innerHeight),
      heightTotal:scroll.scrollHeight,visibleHeight:scroll.clientHeight,
      touchAction:getComputedStyle(scroll).touchAction};})() : null;
  const followElement=document.querySelector('#persistentVideoMount .watch-overlay [data-follow-type="speaker"]')
    || document.querySelector('#app .watch-overlay [data-follow-type="speaker"]');
  // Read-only DOM geometry: the Android test still performs an actual ADB
  // swipe and real tap. Missing speaker metadata remains explicitly missing.
  const followTarget=followElement ? (()=>{const r=followElement.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,
      key:followElement.dataset.followKey||'',active:followElement.classList.contains('active'),
      text:String(followElement.innerText||'').slice(0,80),rendered:true};})():null;
  const video = state.watchVimeo?.getVideoElement?.()
    || document.querySelector('#watchDirectHlsVideo')
    || state.watchVimeo?.video
    || null;
  const controls = {};
  for (const [key, query] of Object.entries(queries)) {
    const candidates = [...document.querySelectorAll(query)];
    const chosen = candidates.find(e => {
      const r=e.getBoundingClientRect(), x=r.left+r.width/2,y=r.top+r.height/2;
      const h=document.elementFromPoint(x,y);
      return !e.disabled && r.width>0 && r.height>0 && x>0 && y>0 && x<innerWidth && y<innerHeight && h && (h===e||e.contains(h));
    });
    if(chosen){const r=chosen.getBoundingClientRect();controls[key]={x:r.left+r.width/2,y:r.top+r.height/2,label:chosen.innerText||chosen.getAttribute('aria-label')||'',active:chosen.classList.contains('active')};}
  }
  const libraryStrip = document.querySelector('.library-tabs-scroll');
  const stripRect = libraryStrip?.getBoundingClientRect();
  const libraryTabStrip = stripRect && stripRect.width > 0 && stripRect.height > 0
    ? { x:stripRect.x, y:stripRect.y, width:stripRect.width, height:stripRect.height,
        scrollLeft:libraryStrip.scrollLeft, scrollWidth:libraryStrip.scrollWidth, clientWidth:libraryStrip.clientWidth }
    : null;
  const watchOverlays=[...document.querySelectorAll('.watch-overlay')];
  const visibleWatchOverlay=watchOverlays.find(overlay=>{
    const r=overlay.getBoundingClientRect();
    return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;
  });
  const watchUi={
    activeMode:String(visibleWatchOverlay?.querySelector('.media-switch [data-watch-mode].active')?.dataset.watchMode||''),
    audioTimeVisible:!!visibleWatchOverlay?.querySelector('#watchAudioTime'),
    audioPlayVisible:!!visibleWatchOverlay?.querySelector(queries.audioPlay),
    hostedExternally:!!state.watchHostedExternally,
    hostClass:String(document.querySelector('#persistentVideoMount')?.className||''),
    overlayCount:watchOverlays.length,
    visibleRoot:visibleWatchOverlay?.closest('#persistentVideoMount')?'persistent':'app'
  };
  return {observedAt:Date.now(),width:innerWidth,height:innerHeight,controls,libraryTabStrip,watchScroll,followTarget,watchUi,
    swipeGateActive:typeof tabSwipeRenderGate !== 'undefined' && tabSwipeRenderGate.shouldDefer(),
    followRequests:(window.__ISTAccountApiRequests||[]).slice(-10),
    ready:state.libraryReady&&!state.loading,loggedIn:!!state.user,isAdmin:!!state.isAdmin,
    libraryReady:!!state.libraryReady,loading:!!state.loading,bootstrapInFlight:!!bootstrapInFlight,libraryError:String(state.libraryLastFailure||'').slice(0,180),hasStoredSession:!!state.token,
    authBusy:!!state.authBusy,authMode:String(state.authMode||''),
    authFields:{emailPresent:!!document.getElementById('authEmail')?.value,passwordPresent:!!document.getElementById('authPassword')?.value},
    name:state.user?.name||'',profileShownName:document.querySelector('.profile-line span')?.textContent||'',
    accountEmail:state.user?.email||'',screen:state.screen,
    comments:(state.watchComments||[]).map(c=>({id:String(c.id),text:String(c.text),mine:String(c.user_id)===String(state.user?.id)})),
    qaEditor:qaCommentId ? (()=>{const element=document.getElementById('editCommentText-'+qaCommentId);if(!element)return null;const rect=element.getBoundingClientRect();return {value:String(element.value),focused:document.activeElement===element,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},activeTag:document.activeElement?.tagName||''};})() : null,
    likes:[...state.myLikes],later:[...state.watchLater],
    follows:[...state.follows.keys()],history:state.history.map(x=>historyRowId(x)),
    historyPositions:state.history.map(x=>({id:historyRowId(x),progressSeconds:Number(x.progressSeconds||x.positionSeconds||0),mediaType:String(x.mediaType||'')})),
    watchMode:String(state.watchMode||''),audioPlaying:state.nativePlayback?.mode==='AUDIO'&&Boolean(state.nativePlayback?.audioIsPlaying),
    audioPlayWhenReady:state.nativePlayback?.mode==='AUDIO'&&Boolean(state.nativePlayback?.audioPlayWhenReady),
    audioTime:Number(state.nativePlayback?.audioPositionMs||0)/1000,
    currentId:String(state.current?.id||''),nativeAudio:{
      mode:String(state.nativePlayback?.mode||''),lectureId:String(state.nativePlayback?.lectureId||''),
      connected:!!state.nativePlayback?.connected,hasAudioSource:!!state.nativePlayback?.hasAudioSource,
      audioReady:!!state.nativePlayback?.audioReady,audioIsPlaying:!!state.nativePlayback?.audioIsPlaying,
      audioPlayWhenReady:!!state.nativePlayback?.audioPlayWhenReady,
      audioPositionMs:Number(state.nativePlayback?.audioPositionMs||0),nativeDisabled:!!state.nativePlaybackDisabled},
    playlists:state.playlists.map(x=>({id:x.id,name:x.name,items:x.items.length,itemIds:x.items.map(item=>String(item.id||''))})),
    commentsLoaded:!state.watchCommentsLoading&&!state.watchCommentsError,lang:document.documentElement.lang,dir:document.documentElement.dir,
    watchId:state.watchVideo?String(videoId(state.watchVideo)):'',
    settingsVisible:!!document.querySelector('#appEmailToggle'),profileVisible:!!document.querySelector('#profileForm'),
    authError:!!document.querySelector('.auth-card .form-message'),playlistPickerOpen:!!document.querySelector('.playlist-picker-backdrop'),
    videoTime:video ? (Number(video.currentTime)||0) : (Number(state.watchResumeSeconds)||0),
    videoPlaying:video ? (!video.paused && video.readyState>=2)
      : Boolean(state.watchVideoPlaying&&state.watchVimeoReady&&state.watchMode==='video')};
}};
if(window.ISTSimulator){const original=window.ISTSimulator.snapshot.bind(window.ISTSimulator);window.ISTSimulator.snapshot=()=>({...original(),account:window.ISTAccountTest.snapshot()});}

