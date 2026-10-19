export function cityAdminPanelHtml(){return "<section class=\"account-card city-admin-app-panel\" data-account-panel=\"cityAdmin\" id=\"panel-cityAdmin\">\n<div class=\"section-title\"><i class=\"fa-solid fa-city\" style=\"color:#0369a1\"></i> City Admin</div>\n<p class=\"subtitle\" style=\"margin-top:-10px\">Upload and manage shiurim only for the city or cities assigned to your account.</p>\n<div id=\"cityAdminStatus\" class=\"admin-status\"></div>\n<div class=\"city-admin-toolbar\">\n<label><strong>City</strong><select id=\"cityAdminCitySelect\"></select></label>\n<button class=\"button secondary\" id=\"cityAdminRefreshButton\" type=\"button\"><i class=\"fa-solid fa-rotate\"></i> Refresh</button>\n</div>\n<div class=\"city-admin-upload-card\">\n<h3>Upload Shiur</h3>\n<p>The file is uploaded first to a protected pending folder for this city. It is not published until you review the information and press <strong>Save</strong>.</p>\n<form id=\"cityAdminUploadForm\">\n<div class=\"city-admin-upload-row\"><label><span>Type</span><select id=\"cityUploadMediaKind\"><option value=\"audio\">Audio</option><option value=\"video\">Video</option></select></label><div class=\"city-admin-file-field\"><span>File</span><div class=\"city-admin-file-picker\"><span class=\"button secondary city-admin-file-button\">Choose File<input class=\"city-admin-file-input\" id=\"cityUploadFile\" type=\"file\" accept=\"audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus\" aria-label=\"Choose File\"></span><span class=\"city-admin-file-name\" id=\"cityUploadFileName\" data-i18n-ignore=\"true\">No file chosen</span></div></div><button class=\"button\" id=\"cityUploadButton\" type=\"submit\">Upload</button></div>\n<div class=\"city-admin-progress\" id=\"cityUploadProgressWrap\" hidden><div class=\"city-admin-progress-bar\"><span id=\"cityUploadProgressBar\"></span></div><div id=\"cityUploadProgressText\">Preparing upload…</div></div>\n</form>\n</div>\n<div class=\"city-admin-editor\" id=\"cityAdminEditor\" hidden>\n<div class=\"city-admin-editor-heading\"><div><h3 id=\"cityAdminEditorHeading\">Review Shiur Information</h3><p>Review the same metadata used by the public shiur library. City is locked to your assignment.</p></div><button class=\"button secondary\" id=\"cityAdminCancelEdit\" type=\"button\">Cancel</button></div>\n<form id=\"cityAdminEditorForm\" class=\"city-admin-edit-grid\">\n<label class=\"full\"><span>Title</span><input id=\"cityEditTitle\" maxlength=\"500\" required></label>\n<label><span>Speaker</span><input id=\"cityEditSpeaker\" maxlength=\"260\"></label>\n<label><span>Topic / category</span><input id=\"cityEditTopic\" maxlength=\"420\"></label>\n<label><span>Lecture date</span><input id=\"cityEditLectureDate\" type=\"date\"></label>\n<label><span>City</span><input id=\"cityEditLocation\" readonly></label>\n<label><span>Year / Drive folder</span><input id=\"cityEditYear\" maxlength=\"40\"></label>\n<label><span>Language</span><input id=\"cityEditLanguage\" maxlength=\"80\"></label>\n<label><span>Program / series</span><input id=\"cityEditProgram\" maxlength=\"260\"></label>\n<label><span>Showcase / folder</span><input id=\"cityEditShowcase\" maxlength=\"260\"></label>\n<label><span>Showcase ID</span><input id=\"cityEditShowcaseId\" maxlength=\"160\"></label>\n<label><span>Category</span><input id=\"cityEditCategory\" maxlength=\"260\"></label>\n<label><span>Series</span><input id=\"cityEditSeries\" maxlength=\"260\"></label>\n<label><span>Parsha</span><input id=\"cityEditParsha\" maxlength=\"260\"></label>\n<label><span>Shiur code</span><input id=\"cityEditShiurCode\" maxlength=\"100\"></label>\n<label><span>Speaker (English)</span><input id=\"cityEditSpeakerEn\" maxlength=\"260\"></label>\n<label><span>Speaker (Hebrew)</span><input id=\"cityEditSpeakerHe\" maxlength=\"260\" dir=\"auto\"></label>\n<label><span>Speaker ID</span><input id=\"cityEditSpeakerId\" maxlength=\"180\"></label>\n<label><span>Speaker IDs (comma-separated)</span><input id=\"cityEditSpeakerIds\" maxlength=\"500\"></label>\n<label><span>Title (English)</span><input id=\"cityEditTitleEn\" maxlength=\"500\"></label>\n<label><span>Title (Hebrew)</span><input id=\"cityEditTitleHe\" maxlength=\"500\" dir=\"auto\"></label>\n<label><span>Topic (English)</span><input id=\"cityEditTopicEn\" maxlength=\"420\"></label>\n<label><span>Topic (Hebrew)</span><input id=\"cityEditTopicHe\" maxlength=\"420\" dir=\"auto\"></label>\n<label><span>Topic ID</span><input id=\"cityEditTopicId\" maxlength=\"180\"></label>\n<label><span>Rabbi / alternate name</span><input id=\"cityEditRabbi\" maxlength=\"260\"></label>\n<label><span>Lecturer</span><input id=\"cityEditLecturer\" maxlength=\"260\"></label>\n<label><span>Organization</span><input id=\"cityEditOrganization\" maxlength=\"260\"></label>\n<label class=\"full\"><span>Description</span><textarea id=\"cityEditDescription\" rows=\"5\" maxlength=\"24000\"></textarea></label>\n<div class=\"full city-admin-editor-actions\"><button class=\"button\" id=\"cityAdminSaveShiur\" type=\"submit\">Save</button></div>\n</form>\n<div id=\"cityAdminEditorStatus\" class=\"admin-status\"></div>\n</div>\n<div class=\"city-admin-managed\"><h3>Published Shiurim for this city</h3><div id=\"cityAdminShiurList\"><div class=\"empty\">Choose a city to load its shiurim.</div></div></div>\n</section>";}

export function createCityAdminController({apiJson,apiFetch}) {

  const state = {
    status: null,
    cities: [],
    city: '',
    assignments: [],
    configuredCities: [],
    editor: null,
    localDuration: 0,
    initialized: false
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function setStatus(id, text = '', kind = '') {
    const el = $(id); if (!el) return;
    el.textContent = text;
    el.className = `admin-status${kind ? ` ${kind}` : ''}`;
  }

  // Use the same authenticated Bearer credentials as the native Android app.
  // Worker authorization still restricts each city-admin endpoint.
  async function jsonFetch(path, options = {}) {
    const headers={...((options.body&&typeof options.body==='string')?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
    return apiJson(path,{...options,headers});
  }

  function currentCity() {
    return String($('cityAdminCitySelect')?.value || state.city || '').trim();
  }

  function renderCitySelect() {
    const select = $('cityAdminCitySelect'); if (!select) return;
    const cities = state.cities || [];
    const previous = state.city || select.value;
    select.innerHTML = cities.map(city => `<option value="${esc(city)}">${esc(city)}</option>`).join('');
    if (cities.includes(previous)) select.value = previous;
    state.city = select.value || cities[0] || '';
  }

  function editorFields() {
    return {
      title: 'cityEditTitle', speaker: 'cityEditSpeaker', topic: 'cityEditTopic', lectureDate: 'cityEditLectureDate',
      location: 'cityEditLocation', year: 'cityEditYear', language: 'cityEditLanguage', program: 'cityEditProgram', showcase: 'cityEditShowcase', showcaseId: 'cityEditShowcaseId',
      category: 'cityEditCategory', series: 'cityEditSeries', parsha: 'cityEditParsha', shiurCode: 'cityEditShiurCode',
      speakerEn: 'cityEditSpeakerEn', speakerHe: 'cityEditSpeakerHe', speakerId: 'cityEditSpeakerId', speakerIds: 'cityEditSpeakerIds', titleEn: 'cityEditTitleEn', titleHe: 'cityEditTitleHe',
      topicEn: 'cityEditTopicEn', topicHe: 'cityEditTopicHe', topicId: 'cityEditTopicId', rabbi: 'cityEditRabbi', lecturer: 'cityEditLecturer',
      organization: 'cityEditOrganization', description: 'cityEditDescription'
    };
  }

  function fillEditor(item = {}, context = {}) {
    state.editor = { ...context, item: { ...item } };
    const panel = $('cityAdminEditor'); if (panel) panel.hidden = false;
    const heading = $('cityAdminEditorHeading');
    if (heading) heading.textContent = context.mode === 'edit' ? 'Edit Shiur Information' : 'Review Shiur Information';
    for (const [key,id] of Object.entries(editorFields())) {
      const input = $(id); if (!input) continue;
      input.value = key === 'location' ? (context.city || item.location || '') : (key === 'speakerIds' && Array.isArray(item[key]) ? item[key].join(', ') : (item[key] ?? ''));
    }
    setStatus('cityAdminEditorStatus', context.mode === 'edit' ? 'Edit the information and press Save.' : 'Upload complete. Review the information, then press Save to publish.', 'success');
    panel?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function readEditor() {
    const item = { ...(state.editor?.item || {}) };
    for (const [key,id] of Object.entries(editorFields())) item[key] = String($(id)?.value || '').trim();
    item.speakerIds = String(item.speakerIds || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 12);
    item.location = String(state.editor?.city || currentCity()).trim();
    if (state.localDuration > 0 && !Number(item.duration)) item.duration = state.localDuration;
    return item;
  }

  async function mediaDuration(file) {
    if (!file) return 0;
    return new Promise(resolve => {
      const el = document.createElement(file.type?.startsWith('video/') ? 'video' : 'audio');
      const url = URL.createObjectURL(file);
      const done = value => { URL.revokeObjectURL(url); el.removeAttribute('src'); resolve(Number.isFinite(value) ? value : 0); };
      el.preload = 'metadata'; el.onloadedmetadata = () => done(el.duration); el.onerror = () => done(0); el.src = url;
      setTimeout(() => done(0), 6000);
    });
  }

  async function uploadThroughIrgun(uploadId, file, mimeType, configuredChunkBytes) {
    // V14.2.21: adaptive resumable upload. Start faster than the 512 KiB safety
    // mode, grow on a healthy connection, and automatically step down when a
    // filtered/proxied connection truncates or rejects a chunk. Every size is a
    // Google Drive resumable-upload multiple of 256 KiB.
    const UNIT = 256 * 1024;
    const MIN_CHUNK = UNIT;
    const START_CHUNK = 1024 * 1024;
    const FAST_CHUNK = 2 * 1024 * 1024;
    const advertised = Math.max(MIN_CHUNK, Number(configuredChunkBytes) || FAST_CHUNK);
    const maxChunk = Math.max(MIN_CHUNK, Math.min(advertised, FAST_CHUNK));
    const retryableStatuses = new Set([400, 408, 409, 425, 429, 500, 502, 503, 504]);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const aligned = value => Math.max(MIN_CHUNK, Math.floor(value / UNIT) * UNIT);
    let chunkBytes = Math.min(maxChunk, aligned(START_CHUNK));
    let offset = 0;
    let finalResult = null;
    let successStreak = 0;

    const progress = extra => {
      const percent = Math.max(0, Math.min(100, Math.round(offset * 100 / Math.max(1, file.size))));
      const bar = $('cityUploadProgressBar'); if (bar) bar.style.width = `${percent}%`;
      const text = $('cityUploadProgressText');
      if (text) text.textContent = `Uploading… ${percent}%${extra ? ` · ${extra}` : ''}`;
    };

    while (offset < file.size) {
      const start = offset;
      let attempt = 0;
      let sameSizeRetryUsed = false;
      let advanced = false;

      while (!advanced && attempt < 7) {
        attempt += 1;
        const remaining = file.size - start;
        let sendBytes = Math.min(remaining, chunkBytes);
        if (sendBytes < remaining) sendBytes = aligned(sendBytes);
        const end = Math.min(file.size, start + sendBytes);
        const chunk = await file.slice(start, end).arrayBuffer();
        const endpoint = `/city-admin/upload/${encodeURIComponent(uploadId)}/chunk?start=${start}&end=${end}&total=${file.size}`;
        const startedAt = performance.now();
        let response = null, data = {};

        try {
          response = await apiFetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            body: chunk
          });
          data = await response.json().catch(() => ({}));
        } catch (_) {
          successStreak = 0;
          if (chunkBytes > MIN_CHUNK) {
            chunkBytes = aligned(Math.max(MIN_CHUNK, chunkBytes / 2));
            progress(`connection retry · ${Math.round(chunkBytes / 1024)} KB chunks`);
            await sleep(250);
            continue;
          }
          if (attempt < 7) {
            progress('connection retry');
            await sleep(Math.min(1800, 250 * attempt));
            continue;
          }
          throw new Error(`Upload connection failed near ${Math.round(start * 100 / Math.max(1, file.size))}%. Please try again.`);
        }

        const resumeAt = Number(data.uploadedBytes);
        if (response.status === 409 && Number.isFinite(resumeAt) && resumeAt > start && resumeAt <= file.size) {
          offset = resumeAt;
          finalResult = data.complete ? data : finalResult;
          advanced = true;
          successStreak = 0;
          break;
        }

        if (!response.ok) {
          const message = String(data.error || '');
          const transient400 = response.status === 400 && /chunk|range|size|request/i.test(message);
          if ((retryableStatuses.has(response.status) || transient400) && attempt < 7) {
            successStreak = 0;
            // A single identical retry is useful because the current 512 KiB path
            // has shown occasional one-off 400s that immediately succeed. If the
            // same range fails again, step down for the next attempt.
            if (!sameSizeRetryUsed) {
              sameSizeRetryUsed = true;
              progress(`retrying ${Math.round(chunkBytes / 1024)} KB chunk`);
              await sleep(250);
              continue;
            }
            if (chunkBytes > MIN_CHUNK) {
              chunkBytes = aligned(Math.max(MIN_CHUNK, chunkBytes / 2));
              sameSizeRetryUsed = false;
              progress(`retrying smaller · ${Math.round(chunkBytes / 1024)} KB chunks`);
              await sleep(350);
              continue;
            }
            await sleep(Math.min(1800, 300 * attempt));
            continue;
          }
          throw new Error(data.error || `Upload failed (${response.status}).`);
        }

        const elapsedMs = performance.now() - startedAt;
        offset = Math.max(end, Number(data.uploadedBytes) || 0);
        finalResult = data;
        advanced = true;
        successStreak += 1;

        // Grow only after several clean chunks. This keeps filtered connections
        // on the proven smaller size while letting healthy connections finish
        // long shiurim with far fewer requests.
        if (!finalResult?.complete && successStreak >= 3 && elapsedMs < 7000 && chunkBytes < maxChunk) {
          chunkBytes = aligned(Math.min(maxChunk, chunkBytes * 2));
          successStreak = 0;
        }
      }

      if (!advanced) throw new Error('Upload did not advance. Please try again.');
      progress(finalResult?.complete ? 'finishing' : `${Math.round(chunkBytes / 1024)} KB chunks`);
      if (finalResult?.complete) break;
    }

    if (!finalResult?.complete || !finalResult?.driveFileId) throw new Error('Google Drive did not finish the upload.');
    return {id: finalResult.driveFileId};
  }

  async function uploadShiur(event) {
    event?.preventDefault();
    const city = currentCity(), kind = String($('cityUploadMediaKind')?.value || 'audio'), file = $('cityUploadFile')?.files?.[0];
    if (!city) return setStatus('cityAdminStatus','No assigned city is available.','error');
    if (!file) return setStatus('cityAdminStatus','Choose a file first.','error');
    const wrap = $('cityUploadProgressWrap'); if (wrap) wrap.hidden = false;
    const bar = $('cityUploadProgressBar'); if (bar) bar.style.width = '0%';
    const button = $('cityUploadButton'); if (button) button.disabled = true;
    setStatus('cityAdminStatus','Preparing a secure upload for your city…');
    try {
      state.localDuration = await mediaDuration(file);
      const start = await jsonFetch('/city-admin/upload/start', {method:'POST', body:JSON.stringify({city,mediaKind:kind,filename:file.name,mimeType:file.type,sizeBytes:file.size})});
      const driveFile = await uploadThroughIrgun(start.uploadId, file, start.mimeType, start.chunkBytes);
      if ($('cityUploadProgressText')) $('cityUploadProgressText').textContent = 'Upload complete. Preparing the shiur editor…';
      const complete = await jsonFetch('/city-admin/upload/complete', {method:'POST', body:JSON.stringify({uploadId:start.uploadId,driveFileId:driveFile.id})});
      const item = {...(complete.item || {})}; if (state.localDuration > 0) item.duration = state.localDuration;
      fillEditor(item,{mode:'draft',uploadId:start.uploadId,publicId:complete.publicId,mediaKind:complete.mediaKind,city:complete.city});
      setStatus('cityAdminStatus','The file is in Google Drive and is still private. Known metadata was prefilled from the filename/library where it could be matched safely. Review it and press Save to publish.','success');
      if ($('cityUploadFile')) $('cityUploadFile').value = '';
      updateUploadFileName();
    } catch(error) {
      setStatus('cityAdminStatus',error.message || 'Upload failed.','error');
      if ($('cityUploadProgressText')) $('cityUploadProgressText').textContent = 'Upload did not finish.';
    } finally { if (button) button.disabled = false; }
  }

  async function saveEditor(event) {
    event?.preventDefault(); if (!state.editor) return;
    const button = $('cityAdminSaveShiur'); if (button) button.disabled = true;
    setStatus('cityAdminEditorStatus','Saving…');
    try {
      const item = readEditor();
      let result;
      if (state.editor.mode === 'draft') {
        result = await jsonFetch(`/city-admin/upload/${encodeURIComponent(state.editor.uploadId)}/publish`,{method:'POST',body:JSON.stringify({item})});
      } else {
        result = await jsonFetch(`/city-admin/shiur/${encodeURIComponent(state.editor.publicId)}`,{method:'POST',body:JSON.stringify({item})});
      }
      state.editor = null; state.localDuration = 0;
      $('cityAdminEditor').hidden = true;
      setStatus('cityAdminStatus', result.mediaKind === 'video' ? 'Shiur saved and published to the website.' : 'Audio shiur saved and published to the website.', 'success');
      await loadCityShiurim();
    } catch(error) { setStatus('cityAdminEditorStatus',error.message || 'Could not save the shiur.','error'); }
    finally { if (button) button.disabled = false; }
  }

  async function loadCityShiurim() {
    const city = currentCity(), list = $('cityAdminShiurList'); if (!list) return;
    if (!city) { list.innerHTML='<div class="empty">No city is assigned.</div>'; return; }
    list.innerHTML='<div class="empty">Loading shiurim…</div>';
    try {
      const data = await jsonFetch(`/city-admin/shiurim?city=${encodeURIComponent(city)}`);
      const items = data.items || [];
      list.innerHTML = items.length ? items.map(row => {
        const item=row.item||{}, title=item.title||row.originalName||'Untitled shiur';
        return `<div class="city-admin-shiur-row"><div><strong dir="auto">${esc(title)}</strong><small>${esc(row.mediaKind==='video'?'Video':'Audio')} · ${esc(row.city)}${item.speaker?` · ${esc(item.speaker)}`:''}</small></div><div class="city-admin-row-actions"><button class="button secondary city-edit-existing" data-id="${esc(row.publicId)}" type="button">Edit</button><button class="button btn-danger city-delete-existing" data-id="${esc(row.publicId)}" type="button">Remove</button></div></div>`;
      }).join('') : '<div class="empty">No City Admin uploads have been published for this city yet.</div>';
      list.querySelectorAll('.city-edit-existing').forEach(button=>button.addEventListener('click',()=>editExisting(button.dataset.id,items)));
      list.querySelectorAll('.city-delete-existing').forEach(button=>button.addEventListener('click',()=>removeExisting(button.dataset.id,button)));
    } catch(error) { list.innerHTML=`<div class="empty">${esc(error.message||'Could not load city shiurim.')}</div>`; }
  }

  function editExisting(publicId, items) {
    const row=(items||[]).find(item=>String(item.publicId)===String(publicId)); if(!row)return;
    state.localDuration=Number(row.item?.duration)||0;
    fillEditor(row.item||{}, {mode:'edit',publicId:row.publicId,mediaKind:row.mediaKind,city:row.city});
  }

  async function removeExisting(publicId, button) {
    if (!confirm('Remove this shiur from the website and move its uploaded Drive file to Trash?')) return;
    button.disabled=true;
    try { await jsonFetch(`/city-admin/shiur/${encodeURIComponent(publicId)}`,{method:'DELETE'}); setStatus('cityAdminStatus','Shiur removed.','success'); await loadCityShiurim(); }
    catch(error){setStatus('cityAdminStatus',error.message||'Could not remove the shiur.','error'); button.disabled=false;}
  }

  async function loadCityAdminPanel(force = false) {
    if (state.status && !force) { renderCitySelect(); await loadCityShiurim(); return true; }
    try {
      const data = await jsonFetch('/city-admin/status');
      state.status=data; state.cities=Array.isArray(data.cities)?data.cities:[];
      const menu=$('cityAdminMenuButton'); if(menu) menu.style.display='flex';
      renderCitySelect();
      setStatus('cityAdminStatus',state.cities.length?`City access: ${state.cities.join(', ')}`:'No Drive city folders are available.','success');
      await loadCityShiurim(); return true;
    } catch(error) {
      const menu=$('cityAdminMenuButton'); if(menu) menu.style.display='none';
      if (error.status !== 403) setStatus('cityAdminStatus',error.message||'City Admin controls are unavailable.','error');
      return false;
    }
  }

  function renderAssignmentList() {
    const list=$('cityAdminAssignmentList'); if(!list)return;
    const cities=state.configuredCities||[];
    list.innerHTML=state.assignments.length?state.assignments.map(row=>`<div class="city-admin-assignment-row" data-assignment="${row.id}"><div><strong>${esc(row.name||row.email)}</strong><small>${esc(row.email)}</small></div><select class="city-assignment-select">${cities.map(city=>`<option value="${esc(city)}"${city===row.city?' selected':''}>${esc(city)}</option>`).join('')}</select><button class="button secondary city-assignment-save" type="button">Save city</button><button class="button btn-danger city-assignment-remove" type="button">Remove</button></div>`).join(''):'<div class="empty">No City Admins have been added.</div>';
    list.querySelectorAll('.city-admin-assignment-row').forEach(row=>{
      row.querySelector('.city-assignment-save')?.addEventListener('click',()=>saveAssignment(row));
      row.querySelector('.city-assignment-remove')?.addEventListener('click',()=>removeAssignment(row));
    });
  }

  async function loadCityAdminManagement() {
    const panel=$('cityAdminManagementPanel'); if(!panel)return false;
    try {
      const data=await jsonFetch('/admin/city-admins');
      state.assignments=data.items||[]; state.configuredCities=data.cities||[];
      const select=$('cityAdminAddCity'); if(select) select.innerHTML=state.configuredCities.map(city=>`<option value="${esc(city)}">${esc(city)}</option>`).join('');
      renderAssignmentList(); setStatus('cityAdminManagementStatus',''); return true;
    } catch(error) { if(error.status!==403)setStatus('cityAdminManagementStatus',error.message||'Could not load City Admins.','error'); return false; }
  }

  async function addAssignment(event){
    event?.preventDefault(); const email=String($('cityAdminAddEmail')?.value||'').trim(), city=String($('cityAdminAddCity')?.value||'').trim();
    setStatus('cityAdminManagementStatus','Saving…');
    try{const data=await jsonFetch('/admin/city-admins',{method:'POST',body:JSON.stringify({email,city})});state.assignments=data.items||[];state.configuredCities=data.cities||state.configuredCities;renderAssignmentList();if($('cityAdminAddEmail'))$('cityAdminAddEmail').value='';setStatus('cityAdminManagementStatus','City Admin added.','success');}
    catch(error){setStatus('cityAdminManagementStatus',error.message||'Could not add City Admin.','error');}
  }

  async function saveAssignment(row){
    const id=row.dataset.assignment, city=row.querySelector('.city-assignment-select')?.value||''; setStatus('cityAdminManagementStatus','Saving…');
    try{const data=await jsonFetch(`/admin/city-admins/${encodeURIComponent(id)}`,{method:'POST',body:JSON.stringify({city})});state.assignments=data.items||[];state.configuredCities=data.cities||state.configuredCities;renderAssignmentList();setStatus('cityAdminManagementStatus','City assignment updated.','success');}
    catch(error){setStatus('cityAdminManagementStatus',error.message||'Could not update City Admin.','error');}
  }

  async function removeAssignment(row){
    if(!confirm('Remove this City Admin assignment?'))return; const id=row.dataset.assignment;
    try{const data=await jsonFetch(`/admin/city-admins/${encodeURIComponent(id)}`,{method:'DELETE'});state.assignments=data.items||[];renderAssignmentList();setStatus('cityAdminManagementStatus','City Admin access removed.','success');}
    catch(error){setStatus('cityAdminManagementStatus',error.message||'Could not remove City Admin.','error');}
  }

  function updateUploadFileName() {
    const input = $('cityUploadFile');
    const name = $('cityUploadFileName');
    if (!name) return;
    const fileName = input?.files?.[0]?.name || '';
    name.textContent = fileName || (window.IST_I18N?.t?.('No file chosen') || (document.documentElement.lang === 'he' ? 'לא נבחר קובץ' : 'No file chosen'));
    name.title = fileName || '';
  }

  function bind() {
    const host=$('cityAdminUploadForm');
    if (!host || host.dataset.boundCityAdmin==='1') return;
    host.dataset.boundCityAdmin='1';
    $('cityAdminUploadForm')?.addEventListener('submit',uploadShiur);
    $('cityAdminEditorForm')?.addEventListener('submit',saveEditor);
    $('cityAdminCancelEdit')?.addEventListener('click',()=>{state.editor=null;$('cityAdminEditor').hidden=true;});
    $('cityAdminCitySelect')?.addEventListener('change',()=>{state.city=currentCity();$('cityAdminEditor').hidden=true;state.editor=null;loadCityShiurim();});
    $('cityAdminRefreshButton')?.addEventListener('click',()=>loadCityAdminPanel(true));
    $('cityUploadMediaKind')?.addEventListener('change',()=>{const kind=$('cityUploadMediaKind').value,file=$('cityUploadFile');if(file)file.accept=kind==='video'?'video/*,.mp4,.m4v,.mov,.webm':'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus';});
    $('cityUploadFile')?.addEventListener('change',updateUploadFileName);
    updateUploadFileName();
    $('cityAdminAddForm')?.addEventListener('submit',addAssignment);
    if(!state.status) setTimeout(()=>loadCityAdminPanel().catch(()=>{}),50);
    else {renderCitySelect();void loadCityShiurim();if(state.editor)fillEditor(state.editor.item,state.editor);}
  }

  // Detached UI will be remounted after the Android Account page rerenders.
  // Never register global listeners or keep a stale account's City permissions.
  return {bind,loadCityAdminPanel,reset(){
    Object.assign(state,{status:null,cities:[],city:'',assignments:[],configuredCities:[],
      editor:null,localDuration:0,initialized:false});
  }};
}
