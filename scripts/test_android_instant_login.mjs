import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function sourceBetween(start, end) {
  const a = main.indexOf(start);
  const b = main.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing auth section: ${start}`);
  return main.slice(a, b);
}

test('a valid Android login displays its authenticated profile before slow server collections finish', async () => {
  const state = { token:'', user:null, authBusy:true, authMessage:'', authMode:'login' };
  const events = [];
  let resolveCollections, resolveAdmin;
  const collections = new Promise(resolve => { resolveCollections = resolve; });
  const admin = new Promise(resolve => { resolveAdmin = resolve; });
  const context = {
    state,
    resetUserState() { state.user = null; events.push('reset'); },
    setToken(token) { state.token = token; events.push('token'); },
    rememberVerifiedAccount() { events.push('cache'); },
    render() { events.push('render:' + (state.user?.name || 'signed-out')); },
    setToast(message) { events.push('toast:' + message); },
    loadUserCollections() { events.push('collections:start'); return collections; },
    checkAdminStatus() { events.push('admin:start'); return admin; },
    warmNativePaidCatalog() { events.push('paid:start'); }
  };
  runInNewContext(sourceBetween('function completeSignIn(', 'async function login(')
    + '\nthis.completeSignIn = completeSignIn;', context);
  context.completeSignIn('verified-token', {id:77,name:'Listener'}, 'Signed in.');
  assert.equal(state.token,'verified-token');
  assert.equal(state.user.name,'Listener');
  assert.equal(state.authBusy,false);
  assert.ok(events.indexOf('render:Listener') < events.indexOf('collections:start'));
  assert.ok(events.indexOf('render:Listener') < events.indexOf('admin:start'));
  assert.ok(!events.includes('paid:start'), 'background catalog should not be treated as a login prerequisite');
  resolveCollections();
  resolveAdmin();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(events.includes('paid:start'));
});

test('a stale asynchronous response cannot restore an old account after logout', async () => {
  const state = { token:'', user:null, authBusy:true };
  let resolveCollections, resolveAdmin;
  const collections = new Promise(resolve => {resolveCollections=resolve;});
  const admin = new Promise(resolve => {resolveAdmin=resolve;});
  let warm = 0;
  let renders = 0;
  const context = {
    state,
    resetUserState() { state.user=null; },
    setToken(token) { state.token=token; },
    rememberVerifiedAccount() {},
    render() {renders++;},
    setToast() {},
    loadUserCollections() {return collections;},
    checkAdminStatus() {return admin;},
    warmNativePaidCatalog() {warm++;}
  };
  runInNewContext(sourceBetween('function completeSignIn(', 'async function login(')
    + '\nthis.completeSignIn = completeSignIn;', context);
  context.completeSignIn('first-token', {id:11,name:'A'}, '');
  state.token = '';
  state.user = null;
  resolveCollections();
  resolveAdmin();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(warm,0,'old session must not load purchased content');
  assert.equal(renders,1,'late refresh must not repaint a logged-out account');
});

test('existing sign-in paths use the immediate account commit', () => {
  const methods = [
    sourceBetween('async function login(', 'async function loginWithGoogle()'),
    sourceBetween('async function loginWithGoogle()', 'async function loginWithApple()'),
    sourceBetween('async function loginWithApple()', 'async function register(')
  ];
  for (const method of methods) {
    assert.match(method,/completeSignIn\(data\.sessionToken,/);
    assert.doesNotMatch(method,/await loadUserCollections\(/);
    assert.doesNotMatch(method,/await checkAdminStatus\(/);
  }
});

test('restored /me identity is rendered before slow collections complete', async () => {
  const state = {token:'existing-token',user:null};
  let complete;
  const pending = new Promise(resolve=>{complete=resolve;});
  const events = [];
  const context = {
    state,
    apiJson: async path => ({loggedIn:true,user:{id:23,name:'Saved listener'}}),
    rememberVerifiedAccount(){},
    loadUserCollections(){events.push('collections:start');return pending;},
    checkAdminStatus(){events.push('admin:start');return pending;},
    warmNativePaidCatalog(){events.push('paid:start');},
    render(){events.push('render:'+state.user?.name);}
  };
  runInNewContext(sourceBetween('async function restoreSession()', 'async function loadUserCollections()')
    + '\nthis.restoreSession=restoreSession;',context);
  const restore = context.restoreSession();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.user.name,'Saved listener');
  assert.ok(events.includes('render:Saved listener'),'account should render without waiting for history/follows');
  assert.ok(!events.includes('paid:start'),'pending background refresh should remain pending');
  complete();
  await restore;
  assert.ok(events.includes('paid:start'));
});
