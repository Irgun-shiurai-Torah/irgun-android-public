// When Android IME opens, the WebView viewport can shrink from 640px to
// ~380px. Password and Login are BELOW Email in the same real form.
// A downward swipe would scroll towards Email and never expose Password.
// Player mode and playback controls are at the TOP of the Watch scroll area;
// after following a speaker or editing a comment, physically swipe DOWN to
// return to the player rather than moving further into related lectures.
// This helper chooses actual gesture directions; it never injects DOM events
// or bypasses native UI verification.
export function accountSwipeDirection(key) {
  // Playlist creation and its Back control are ABOVE the playlist list.
  // Scroll up the page (a physical DOWN swipe) to reach these controls;
  // a default upward swipe moves further into the list and loses the field.
  return ['closeWatch','email','settings','audioMode','videoMode','audioPlay',
    'playlistName','createPlaylist','playlistBack'].includes(String(key)) ? 'down' : 'up';
}

// A physical down-swipe inside the observed Watch scroll viewport. The caller
// maps DOM positions to fresh Android window bounds and verifies scrollTop
// actually decreases; this function does not move the page programmatically.
export function watchPlayerReturnGesture(scroll) {
  const {x,y,width,height} = watchGestureViewport(scroll);
  const atX = x + width * 0.74;
  return {from:{x:atX,y:y+height*0.20},to:{x:atX,y:y+height*0.84}};
}

function watchGestureViewport(scroll) {
  const {x,y,width,height,visibleBottom} = scroll || {};
  if (![x,y,width,height].every(Number.isFinite) || width < 50 || height < 120)
    throw new Error('Real Watch scroll bounds are required to reach the player');
  const visibleHeight=(Number.isFinite(visibleBottom)?Math.min(y+height,visibleBottom):y+height)-Math.max(0,y);
  if(visibleHeight<120)throw new Error('Real Watch scroll bounds are obscured by navigation or keyboard');
  return {x,y:Math.max(0,y),width,height:visibleHeight};
}

export function watchCommentsGesture(scroll) {
  const {x,y,width,height}=watchGestureViewport(scroll),atX=x+width*.70;
  return {from:{x:atX,y:y+height*.86},to:{x:atX,y:y+height*.16}};
}

/** Scroll to the REAL Follow chip when it exists outside the visible Watch
 * viewport. A previous blind swipe always moved farther down the lecture page
 * and overshot the chip; a missing chip remains a test failure, not a skip. */
export function watchFollowTargetGesture(scroll, targetY) {
  const {x,y,width,height}=watchGestureViewport(scroll);
  if (!Number.isFinite(targetY)) throw new Error('Follow DOM target location must be observed');
  const mid=y+height*0.52,atX=x+width*0.70;
  const travel=Math.min(height*0.38,Math.max(78,Math.abs(targetY-mid)*0.58));
  const upper=y+24,lower=y+height-24;
  const fromY=Math.max(upper,Math.min(lower,mid));
  const towardsTop=targetY<mid;
  const toY=Math.max(upper,Math.min(lower,fromY+(towardsTop?travel:-travel)));
  return {from:{x:atX,y:fromY},to:{x:atX,y:toY},
    direction:towardsTop?'down':'up'};
}
