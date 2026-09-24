import { Capacitor, registerPlugin } from '@capacitor/core';

const API = 'https://api.irgunshiuraitorah.com';
const NativeAnalytics = registerPlugin('IrgunAnalytics');
const platformRaw = Capacitor.getPlatform();
const platform = platformRaw === 'android' || platformRaw === 'ios' ? platformRaw : 'web';
const isNative = platform === 'android' || platform === 'ios';
const eventCooldowns = new Map();
const DEVICE_KEY = 'istAppAnalyticsDeviceIdV1';
const INSTANCE_KEY = 'istAppAnalyticsInstanceIdV1';

function uuid() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch (_) {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
function getStored(storage, key) {
  try { let v=storage.getItem(key)||''; if(!v){v=uuid();storage.setItem(key,v);} return v; } catch (_) { return uuid(); }
}
const fallbackDeviceId = getStored(localStorage, DEVICE_KEY);
const fallbackInstanceId = getStored(sessionStorage, INSTANCE_KEY);
const state = { screen:'Home', isPlaying:false, mediaType:'none', playerState:'browsing', shiurId:'', appVersion:'' };

function cleanMedia(value){ return value === 'audio' || value === 'video' ? value : 'none'; }
function cleanState(value, playing){ return ['playing','paused','browsing'].includes(value) ? value : (playing?'playing':'browsing'); }
function base(extra={}) { return { deviceId:fallbackDeviceId, instanceId:fallbackInstanceId, platform, screen:state.screen, isPlaying:Boolean(state.isPlaying), mediaType:cleanMedia(state.mediaType), playerState:cleanState(state.playerState,state.isPlaying), shiurId:String(state.shiurId||'').slice(0,100), appVersion:state.appVersion, timestamp:new Date().toISOString(), ...extra }; }
function silent(promise){ try { Promise.resolve(promise).catch(()=>{}); } catch (_) {} }
function post(path, payload){ try { fetch(`${API}${path}`,{method:'POST',credentials:'omit',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{}); } catch (_) {} }
function pushState(force=false){
  if (isNative) { silent(NativeAnalytics.setState({screen:state.screen,isPlaying:Boolean(state.isPlaying),mediaType:cleanMedia(state.mediaType),playerState:cleanState(state.playerState,state.isPlaying),shiurId:String(state.shiurId||'').slice(0,100)})); return; }
  if (!force && document.visibilityState === 'hidden' && !state.isPlaying) return;
  post('/analytics/presence',base());
}
function setScreen(screen){ const next=String(screen||'').trim().slice(0,80)||'Home'; if(next===state.screen)return; state.screen=next; pushState(true); }
function setMedia(next={}){
  const before=`${state.isPlaying}|${state.mediaType}|${state.playerState}|${state.shiurId}`;
  if(Object.prototype.hasOwnProperty.call(next,'isPlaying'))state.isPlaying=Boolean(next.isPlaying);
  if(Object.prototype.hasOwnProperty.call(next,'mediaType'))state.mediaType=cleanMedia(next.mediaType);
  if(Object.prototype.hasOwnProperty.call(next,'playerState'))state.playerState=cleanState(next.playerState,state.isPlaying);
  if(Object.prototype.hasOwnProperty.call(next,'shiurId'))state.shiurId=String(next.shiurId||'').slice(0,100);
  if(!state.isPlaying&&state.mediaType==='none')state.playerState='browsing';
  const after=`${state.isPlaying}|${state.mediaType}|${state.playerState}|${state.shiurId}`;
  if(before!==after)pushState(true);
}
function event(eventType, details={}){
  const type=String(eventType||'').trim().toLowerCase(); if(!type)return;
  const key=String(details.dedupeKey||`${type}:${details.shiurId||state.shiurId||''}`); const cooldown=Math.max(0,Number(details.cooldownMs==null?1500:details.cooldownMs)||0); const now=Date.now();
  if(cooldown&&now-Number(eventCooldowns.get(key)||0)<cooldown)return; eventCooldowns.set(key,now);
  const payload={eventId:uuid(),eventType:type,screen:state.screen,mediaType:cleanMedia(details.mediaType!=null?details.mediaType:state.mediaType),shiurId:String(details.shiurId!=null?details.shiurId:state.shiurId||'').slice(0,100)};
  if(isNative)silent(NativeAnalytics.event(payload));else post('/analytics/event',base(payload));
}
function heartbeat(){ pushState(true); }
function configure(version){ state.appVersion=String(version||'').slice(0,60); if(isNative)silent(NativeAnalytics.configure({appVersion:state.appVersion})); pushState(true); }

if(!isNative){
  setInterval(()=>pushState(false),30000);
  document.addEventListener('visibilitychange',()=>pushState(true));
  window.addEventListener('focus',()=>pushState(true),{passive:true});
}

export const usageAnalytics={configure,setScreen,setMedia,event,heartbeat,state:()=>({...state})};
