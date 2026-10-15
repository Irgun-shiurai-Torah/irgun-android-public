// Android-only paid collection presentation. No media element or player is created.
import {buildPaidFolderTree,paidFolderKey,BELSKY_VOL1_ID,belskyAlbumForSession,
  belskySessionLabel,findBelskyQuestions} from './android-paid-collections.js';

const label = (en, he, isHebrew) => isHebrew ? he : en;
export function paidFolderTreeHtml(product, {esc,openFolders=new Set(),isHebrew=false}={}) {
  const owned = Boolean(product?.owned);
  const records = owned ? product?.tracks : product?.folderPreview;
  const tree = buildPaidFolderTree(records, product?.id, {preview:!owned});
  if (!tree.folders.length && !tree.tracks.length) return owned
    ? '<div class="empty">This purchase is connected, but its tracks are not available right now.</div>' : '';
  const trackButton = entry => {
    const track = entry.track;
    const title = esc(track.title || `Track ${entry.index+1}`);
    return `<button type="button" class="paid-track paid-folder-track" data-paid-product="${esc(product.id)}" data-paid-track="${esc(track.id)}"><span class="paid-track-num">${entry.index+1}</span><div><strong>${title}</strong><small>${track.size ? `${Math.max(1,Math.round(Number(track.size)/1024/1024))} MB` : 'Secure streaming'}</small></div><span aria-hidden="true">▶</span></button>`;
  };
  const render = (node, depth=0) => {
    const key = paidFolderKey(product.id,node.path);
    const count = node.count;
    const inner = node.folders.map(child=>render(child,depth+1)).join('') +
      (owned ? node.tracks.map(trackButton).join('') : '');
    if (!owned && !node.folders.length) return `<div class="paid-folder-leaf"><span aria-hidden="true">📁</span><span dir="auto">${esc(node.name)}</span><small>${count} ${label('tracks','קטעים',isHebrew)}</small></div>`;
    return `<details class="paid-folder-node" data-paid-folder-key="${esc(key)}" ${openFolders.has(key)?'open':''}><summary><span aria-hidden="true">📁</span><span class="paid-folder-name" dir="auto">${esc(node.name)}</span><small>${count} ${label('tracks','קטעים',isHebrew)}</small><span class="paid-folder-chevron" aria-hidden="true">⌄</span></summary><div class="paid-folder-children">${inner}</div></details>`;
  };
  const rows = tree.folders.map(node=>render(node,0)).join('') +
    (owned ? tree.tracks.map(trackButton).join('') : '');
  return `<div class="paid-folder-overview"><div class="paid-folder-overview-title"><strong>${label('Collection folders','תיקיות האוסף',isHebrew)}</strong><span>${tree.count} ${label('tracks','קטעים',isHebrew)}</span></div><div class="paid-folder-tree">${rows}</div>${!owned ? `<p class="paid-folder-locked">${label('Folder titles are public. Recordings require purchased access.','אפשר לראות את שמות התיקיות. ההקלטות זמינות לרוכשים בלבד.',isHebrew)}</p>` : ''}</div>`;
}

function questionLocation(section, isHebrew) {
  const album=belskyAlbumForSession(section.session);
  return `${label('Album','אלבום',isHebrew)} ${album?.number || section.disc} · ${belskySessionLabel(section.session,section.part)}`;
}
const questionBtn = (section,esc,owned,isHebrew)=>`<button type="button" class="paid-index-session-button" data-paid-index-session="${Number(section.session)}" data-paid-index-part="${Number(section.part)||0}">${owned?label('Open session in my collection','פתיחת ההקלטות שלי',isHebrew):label('View session folders','צפייה בתיקיות',isHebrew)} →</button>`;
export function paidQuestionResultsHtml({sessions=[],search='',disc='all',limit=70,owned=false,esc,isHebrew=false}={}) {
  const all=findBelskyQuestions(sessions,search,disc);
  const searching=Boolean(String(search||'').trim());
  let html='';
  if (searching) {
    html=all.slice(0,limit).map(({section,topic})=>`<article class="paid-question-result"><small>${esc(questionLocation(section,isHebrew))}</small><div class="paid-question-title"><span>${esc(topic.num||'•')}</span><strong>${esc(topic.text)}</strong></div>${questionBtn(section,esc,owned,isHebrew)}</article>`).join('');
  } else {
    const groups=new Map();
    for (const section of sessions) {
      if (disc!=='all'&&String(disc)!==String(section.disc)) continue;
      const album=belskyAlbumForSession(section.session);
      const key=album?.number||section.disc;
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(section);
    }
    html=[...groups].map(([album,sections])=>`<section class="paid-index-album"><h3>${esc(belskyAlbumForSession(sections[0].session)?.label || ('Album '+album))}</h3><div class="paid-index-sessions">${sections.map(section=>`<details class="paid-index-session"><summary><strong>${esc(belskySessionLabel(section.session,section.part))}</strong><small>${section.topics.length} ${label('topics','נושאים',isHebrew)}</small></summary><div class="paid-index-session-content">${section.topics.map(topic=>`<div class="paid-question-title"><span>${esc(topic.num||'•')}</span><p>${esc(topic.text)}</p></div>`).join('')}${questionBtn(section,esc,owned,isHebrew)}</div></details>`).join('')}</div></section>`).join('');
  }
  if (!html) html=`<div class="empty">${label('No matching questions. Try another topic.','לא נמצאו שאלות. נסו נושא אחר.',isHebrew)}</div>`;
  return {html,count:all.length,more:searching&&all.length>limit};
}

export function paidQuestionIndexHtml({sessions=[],loading=false,error='',search='',disc='all',
    limit=70,owned=false,esc,isHebrew=false}={}) {
  const results=paidQuestionResultsHtml({sessions,search,disc,limit,owned,esc,isHebrew});
  return `<section class="paid-index-page"><button type="button" class="paid-index-back" data-paid-index-close="1">← ${label('Back to collections','חזרה לאוספים',isHebrew)}</button><div class="page-title pro-page-title"><span class="page-kicker">${label('HALACHA QUESTION INDEX','מפתח שאלות הלכה',isHebrew)}</span><h1>${label("What's the Halacha? — Questions & Topics",'מה ההלכה? — שאלות ונושאים',isHebrew)}</h1><p>${label('Browse or search by topic, album, session and question number. Listening requires a purchase.','חיפוש לפי נושא, אלבום, שיעור ומספר שאלה. האזנה זמינה לרוכשים בלבד.',isHebrew)}</p></div>${loading?'<div class="loading">Loading questions…</div>':error?`<div class="paid-retry-card"><p>${esc(error)}</p><button data-paid-index-retry="1">Try again</button></div>`:`<div class="paid-index-searchbar"><label>${label('Search questions','חיפוש שאלות',isHebrew)}<input id="paidQuestionSearch" type="search" value="${esc(search)}" placeholder="${label('Search halacha topic or question…','חיפוש נושא הלכתי…',isHebrew)}" autocomplete="off"/></label><label>${label('Album','אלבום',isHebrew)}<select id="paidQuestionDisc"><option value="all">${label('All albums','כל האלבומים',isHebrew)}</option>${[1,2,3,4,5,6,7].map(value=>`<option value="${value}" ${disc===String(value)?'selected':''}>Album ${value}</option>`).join('')}</select></label></div><p id="paidQuestionCount" class="paid-question-count">${results.count} ${label('indexed topics','נושאים במפתח',isHebrew)}</p><div id="paidQuestionResults">${results.html}</div><button type="button" id="paidQuestionMore" data-paid-index-more="1" ${results.more?'':'hidden'}>${label('Show more questions','הצגת שאלות נוספות',isHebrew)}</button>`}</section>`;
}
