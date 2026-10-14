// When Android IME opens, the WebView viewport can shrink from 640px to
// ~380px. Password and Login are BELOW Email in the same real form.
// A downward swipe would scroll towards Email and never expose Password.
// Player mode and playback controls are at the TOP of the Watch scroll area;
// after following a speaker or editing a comment, physically swipe DOWN to
// return to the player rather than moving further into related lectures.
// This helper chooses actual gesture directions; it never injects DOM events
// or bypasses native UI verification.
export function accountSwipeDirection(key) {
  return ['closeWatch','email','settings','audioMode','videoMode','audioPlay'].includes(String(key)) ? 'down' : 'up';
}

// A physical down-swipe inside the observed Watch scroll viewport. The caller
// maps DOM positions to fresh Android window bounds and verifies scrollTop
// actually decreases; this function does not move the page programmatically.
export function watchPlayerReturnGesture(scroll) {
  const {x,y,width,height} = scroll || {};
  if (![x,y,width,height].every(Number.isFinite) || width < 50 || height < 120)
    throw new Error('Real Watch scroll bounds are required to reach the player');
  const atX = x + width * 0.74;
  return {from:{x:atX,y:y+height*0.20},to:{x:atX,y:y+height*0.84}};
}
