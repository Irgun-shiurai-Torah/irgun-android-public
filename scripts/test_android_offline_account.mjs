import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY,readCachedAccount,rememberCachedAccount,clearCachedAccount} from '../src/android-offline-account.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('last verified ordinary profile survives offline restart without role',()=>{
 const s=storage();
 assert.equal(rememberCachedAccount(s,'token-a',{name:'QA',email:'qa@example.test',isAdmin:true},1000),true);
 assert.deepEqual(readCachedAccount(s,'token-a',2000),{name:'QA',email:'qa@example.test'});
 assert.equal(s.getItem(KEY).includes('token-a'),false);
});
test('token rotation, expiry, logout and corrupt record refuse restored identity',()=>{
 const s=storage();rememberCachedAccount(s,'token-a',{name:'A'},1000);
 assert.equal(readCachedAccount(s,'token-b',2000),null);
 assert.equal(readCachedAccount(s,'token-a',31*86400000),null);
 clearCachedAccount(s);assert.equal(readCachedAccount(s,'token-a',2000),null);
 s.setItem(KEY,'bad json');assert.equal(readCachedAccount(s,'token-a',2000),null);
});
