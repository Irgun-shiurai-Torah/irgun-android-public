// When Android IME opens, the WebView viewport can shrink from 640px to
// ~380px. Password and Login are BELOW Email in the same real form.
// A downward swipe would scroll towards Email and never expose Password.
// This helper chooses the physical scroll direction; it does not inject DOM
// events, synthesize taps, or bypass the native UI verification.
export function accountSwipeDirection(key) {
  return ['closeWatch','email','settings'].includes(String(key)) ? 'down' : 'up';
}
