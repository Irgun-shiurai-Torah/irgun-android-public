// This is display-only state from a previously server-verified sign-in.
// Never restore a token, admin status, or server-owned collections from this cache.
export const KEY='istVerifiedOfflineAccountV1';
function tag(token){let h=2166136261;for(const ch of String(token)){h=Math.imul(h^ch.charCodeAt(0),16777619);}return String(token).length+':'+(h>>>0).toString(36);}
export function clearCachedAccount(store){try{store.removeItem(KEY);}catch{}}
export function rememberCachedAccount(store,token,user,now=Date.now()){
  if(!token||!user||typeof user!=='object')return false;
  const name=String(user.name||'').trim(),email=String(user.email||'').trim();
  if(!name&&!email)return false;
  try{
    store.setItem(KEY,JSON.stringify({tag:tag(token),at:now,user:{name,email}}));
    return true;
  }catch{return false;}
}
export function readCachedAccount(store,token,now=Date.now()){
  if(!token)return null;
  try{
    const saved=JSON.parse(store.getItem(KEY)||'null');
    if(saved?.tag!==tag(token)||!Number.isFinite(saved.at)||now-saved.at<0||now-saved.at>30*86400000)return null;
    const name=String(saved.user?.name||'').trim(),email=String(saved.user?.email||'').trim();
    return name||email?{name,email}:null;
  }catch{return null;}
}
