const tabs = ['home','shiurim','live','library','account'];

export function androidNavigationRoot(screen, previous = 'home') {
  if (tabs.includes(screen)) return screen;
  if (String(screen).startsWith('live')) return 'live';
  if (screen === 'search') return 'shiurim';
  if (screen === 'schedule') return 'home';
  if (screen === 'paid') return 'library';
  // Detail pages (Donate, Contact, Privacy) retain their entry tab.
  return tabs.includes(previous) ? previous : 'home';
}

// Keep one navigation DOM outside page/player renders. Its indicator can slide
// between tabs without replacing buttons or accumulating click listeners.
export function createAndroidBottomNavigation({isAndroid,document,model,markup,navigate}) {
  let mount, language;
  return () => {
    if (!isAndroid()) return;
    const state = model();
    if (!mount) {
      mount=document.createElement('div');mount.id='androidBottomNavigationMount';
      document.body.appendChild(mount);
      mount.addEventListener('click',event=>{
        const button=event.target.closest?.('.nav-btn[data-nav]');
        if(button&&mount.contains(button))void navigate(button);
      });
    }
    if (language !== state.language || !mount.firstElementChild) {
      mount.innerHTML=markup();language=state.language;
    }
    const nav=mount.querySelector('.bottom-nav');
    nav.style.setProperty('--nav-index',String(tabs.indexOf(state.root)));
    for (const button of nav.querySelectorAll('[data-nav]')) {
      const active=button.dataset.nav===state.root;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
  };
}

export async function prepareAndroidTabNavigation({state,exitFullscreen,minimizeVideo,closeAudioWatch}) {
  state.playerOpen=false;
  if(!state.watchVideo)return;
  if(state.watchMode==='video'&&!state.watchMinimized){
    await exitFullscreen();
    await minimizeVideo();
  }else if(state.watchMode==='audio')await closeAudioWatch();
}
