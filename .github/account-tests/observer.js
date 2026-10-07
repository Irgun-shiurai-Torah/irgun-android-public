// Read-only observations appended to disposable debug builds; no credentials or UI setters.
window.ISTAccountTest = { snapshot() {
  const queries = {
    account: '.bottom-nav [data-nav="account"]', shiurim: '.bottom-nav [data-nav="shiurim"]',
    library: '.bottom-nav [data-nav="library"]', email: '#authEmail', password: '#authPassword',
    login: '#authForm button[type="submit"]', logout: '[data-logout]',
    profile: '[data-account-section="profile"]', settings: '[data-account-section="settings"]',
    open: '[data-watch]', like: '.watch-actions [data-like],.watch-action[data-like]',
    save: '.watch-actions [data-open-playlist-picker],.watch-action[data-open-playlist-picker]',
    later: '.playlist-picker [data-save]', closePicker: '.playlist-picker-head [data-playlist-picker-close]',
    closeWatch: '[data-close-watch]', follow: '[data-follow-type="speaker"]',
    playlists: '[data-library-section="playlists"]', playlistName: '#libraryPlaylistCreateName',
    createPlaylist: '#libraryPlaylistCreateForm button[type="submit"]',
    testPlaylist: '[data-playlist-open]', deletePlaylist: '[data-playlist-delete]',
    history: '[data-library-section="history"]', likes: '[data-library-section="likes"]',
    saved: '[data-library-section="later"]', following: '[data-library-section="following"]'
  };
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
  return {observedAt:Date.now(),width:innerWidth,height:innerHeight,controls,
    ready:state.libraryReady&&!state.loading,loggedIn:!!state.user,isAdmin:!!state.isAdmin,
    name:state.user?.name||'',accountEmail:state.user?.email||'',screen:state.screen,likes:[...state.myLikes],later:[...state.watchLater],
    follows:[...state.follows.keys()],history:state.history.map(x=>String(x.id||x.vimeoId||'')),
    playlists:state.playlists.map(x=>({id:x.id,name:x.name,items:x.items.length})),
    watchId:state.watchVideo?String(videoId(state.watchVideo)):'',
    settingsVisible:!!document.querySelector('#appEmailToggle'),profileVisible:!!document.querySelector('#profileForm'),
    authError:!!document.querySelector('.auth-card .form-message'),
    videoTime:Number(state.watchVimeo?.video?.currentTime)||0,videoPlaying:!!state.watchVimeo?.video&&!state.watchVimeo.video.paused};
}};
if(window.ISTSimulator){const original=window.ISTSimulator.snapshot.bind(window.ISTSimulator);window.ISTSimulator.snapshot=()=>({...original(),account:window.ISTAccountTest.snapshot()});}
