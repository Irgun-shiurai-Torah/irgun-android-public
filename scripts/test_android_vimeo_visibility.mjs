import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleAndroidVideoCatalog} from '../src/android-vimeo-visibility.js';

const vimeoOnly={id:'1235511026',vimeoId:'1235511026',hasDriveVideo:false};
const driveCopy={id:'1232214252',vimeoId:'1232214252',hasDriveVideo:true};
const driveLibrary={id:'drivev-123',sourceType:'drive-library',hasDriveVideo:true};
const all=[vimeoOnly,driveCopy,driveLibrary];

test('Android app ON shows Vimeo-only lecture and Drive copies',()=>{
  assert.deepEqual(visibleAndroidVideoCatalog(all,true),all);
  assert.deepEqual(visibleAndroidVideoCatalog(all),all);
});
test('Android app OFF hides only Vimeo-only item (not Drive source)',()=>{
  assert.deepEqual(visibleAndroidVideoCatalog(all,false),[driveCopy,driveLibrary]);
  assert.equal(all.length,3,'Filter must not mutate original catalog');
});
test('Turning app ON restores Vimeo-only items from freshly fetched catalog',()=>{
  assert.equal(visibleAndroidVideoCatalog(all,false).some(x=>x.id===vimeoOnly.id),false);
  assert.equal(visibleAndroidVideoCatalog(all,true).some(x=>x.id===vimeoOnly.id),true);
});
test('Website preference does not change Android visibility',()=>{
  const settings={showVimeoOnlyWebsite:false,showVimeoOnlyApp:true};
  assert.deepEqual(visibleAndroidVideoCatalog(all,settings.showVimeoOnlyApp),all);
  settings.showVimeoOnlyWebsite=true;
  settings.showVimeoOnlyApp=false;
  assert.deepEqual(visibleAndroidVideoCatalog(all,settings.showVimeoOnlyApp),[driveCopy,driveLibrary]);
});

test('Native catalog identifies itself to API even when WebView Origin is omitted',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/isNativeVideoCatalog = rawPath\.startsWith\('\/video-map'\)/);
  assert.match(main,/headers:\{'X-Irgun-App':'1'\}/);
  assert.match(main,/refreshAppVimeoVisibilityOnReturn\(\)/);
  assert.match(main,/mode!==previous && !bootstrapInFlight/);
  const source=readFileSync(new URL('../src/android-media-source.js',import.meta.url),'utf8');
  assert.ok(source.includes("headers:{'X-Irgun-App':'1'}"));
});

test('App OFF hides every explicitly Vimeo-only catalog item even when the Vimeo ID is malformed',()=>{
  const malformed={id:'vimeo-without-valid-id',vimeoId:'invalid',hasDriveVideo:false};
  const unlisted={id:'1234567890:secret',vimeoId:'1234567890:secret',hasDriveVideo:false};
  assert.deepEqual(visibleAndroidVideoCatalog([malformed,unlisted,driveCopy],false),[driveCopy]);
});
test('Drive-library and direct city videos stay visible regardless of Vimeo-only flag',()=>{
  const city={id:'drivev-456',sourceType:'city-drive',directVideo:true,hasDriveVideo:false};
  const folder={id:'drivev-123',sourceType:'drive-library',hasDriveVideo:false};
  assert.deepEqual(visibleAndroidVideoCatalog([city,folder,vimeoOnly],false),[city,folder]);
});
