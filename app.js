const notices = [];
const incidents = [];
let incidentPhotoFiles = [];
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const noticeList = document.querySelector('#noticeList'), incidentList = document.querySelector('#incidentList'), suggestionList = document.querySelector('#suggestionList'), toast = document.querySelector('#toast');
let currentRole = new URLSearchParams(window.location.search).get('admin') === '1' ? 'admin' : 'neighbor';
const storedDocuments = JSON.parse(localStorage.getItem('comunidad-documents') || '[]');
const supabaseClient = window.supabase && window.SUPABASE_CONFIG ? window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.publishableKey) : null;
let supabaseSession = null;
let remoteDocuments = [];
let remoteIncidents = [];
const LIST_PAGE_SIZE=10;
let noticePage=0,noticeTotal=0,incidentPage=0,incidentTotal=0;
let showIncidentHistory = false;
let automaticIncidentEmail = false;
const incidentActionsInFlight = new Set();
let documentSource = 'local';
let documentView = 'consult';
let accessRequests = [];
let approvedResidents = [];
let approvedResidentsPage = 0;
const APPROVED_RESIDENTS_PAGE_SIZE = 8;
let approvedResidentsQuery = '';
let realtimeChannel = null;
let chatRequestId = null;
let chatPollHandle = null;
let chatUnreadByRequest = {};
let neighborUnreadCount = 0;
let requestUnreadCount = 0;
let previousUnreadTotal = 0;
let chatNotificationsPrimed = false;
let pushSubscription = null;
let noveltyState={chat:0,incidents:0,suggestions:0,documents:0,notices:0,requests:0};let topNoveltyState={chat:0,incidents:0,suggestions:0,documents:0,notices:0,requests:0};let lastOpenedNoveltySummary=[];
try{if(localStorage.getItem('comunidad-notifications-separation-v1')!=='1'){['comunidad-seen-incidents','comunidad-seen-suggestions','comunidad-seen-notices','comunidad-seen-chats','comunidad-seen-documents'].forEach(key=>localStorage.removeItem(key));localStorage.setItem('comunidad-notifications-separation-v1','1');}}catch{}
const invitationCode = new URLSearchParams(window.location.search).get('invite');
const adminLoginRequested = new URLSearchParams(window.location.search).get('admin') === '1';
const neighborLoginRequested = new URLSearchParams(window.location.search).get('entrar') === '1';
const publicRegistrationRequested = new URLSearchParams(window.location.search).get('registro') === '1';
let neighborApproved = false;
let neighborProfile = {};
let neighborRequestSent = false;
let neighborInviteState = 'new';
const accessGate = document.querySelector('#accessGate');
function renderCurrentDate(){
  const today = new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
  document.querySelector('#currentDate').textContent = today.toUpperCase();
}
function formatNoticeDate(value){const date=new Date(`${value}T12:00:00`);return {day:String(date.getDate()),month:new Intl.DateTimeFormat('es-ES',{month:'short'}).format(date).replace('.','').toUpperCase(),label:new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'long',year:'numeric'}).format(date)};}
function renderCalendar(){const grid=document.querySelector('#calendarGrid'),label=document.querySelector('#calendarMonthLabel'),events=document.querySelector('#calendarEvents');if(!grid||!label||!events)return;const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth(),monthName=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(calendarMonth);label.textContent=monthName.charAt(0).toUpperCase()+monthName.slice(1);const firstDay=(new Date(year,month,1).getDay()+6)%7,daysInMonth=new Date(year,month+1,0).getDate();const cells=[];for(let i=0;i<firstDay;i++)cells.push('<span class="calendar-day is-empty"></span>');for(let day=1;day<=daysInMonth;day++){const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,dayNotices=notices.filter(item=>item.eventDate===iso);cells.push(`<span class="calendar-day${dayNotices.length?' has-event':''}${iso===new Date().toISOString().slice(0,10)?' is-today':''}><b>${day}</b>${dayNotices.length?`<small>${dayNotices.length} aviso${dayNotices.length===1?'':'s'}</small>`:''}</span>`);}grid.innerHTML=cells.join('');const monthEvents=notices.filter(item=>item.eventDate&&item.eventDate.slice(0,7)===`${year}-${String(month+1).padStart(2,'0')}`);events.innerHTML=monthEvents.length?`<p class="eyebrow">AVISOS DE ESTE MES</p>${monthEvents.map(item=>`<div class="calendar-event"><strong>${formatNoticeDate(item.eventDate).label}</strong><span>${escapeHtml(item.title)}</span></div>`).join('')}`:'<p class="documents-empty">No hay avisos con fecha en este mes.</p>';}
function renderCalendar(){
  const grid=document.querySelector('#calendarGrid'),label=document.querySelector('#calendarMonthLabel'),events=document.querySelector('#calendarEvents');
  if(!grid||!label||!events)return;
  const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth();
  const monthName=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(calendarMonth);
  label.textContent=monthName.charAt(0).toUpperCase()+monthName.slice(1);
  const firstDay=(new Date(year,month,1).getDay()+6)%7;
  const daysInMonth=new Date(year,month+1,0).getDate();
  const todayIso=new Date().toISOString().slice(0,10);
  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push('<div class="calendar-day is-empty" aria-hidden="true"></div>');
  for(let day=1;day<=daysInMonth;day++){
    const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayNotices=notices.filter(item=>item.eventDate===iso);
    const classes=['calendar-day'];
    if(dayNotices.length)classes.push('has-event');
    if(iso===todayIso)classes.push('is-today');
    cells.push(`<div class="${classes.join(' ')}" aria-label="${day} de ${monthName}"><span class="calendar-number">${day}</span>${dayNotices.length?`<small>${dayNotices.length} aviso${dayNotices.length===1?'':'s'}</small>`:''}</div>`);
  }
  grid.innerHTML=cells.join('');
  const monthEvents=notices.filter(item=>item.eventDate&&item.eventDate.slice(0,7)===`${year}-${String(month+1).padStart(2,'0')}`);
  events.innerHTML=monthEvents.length?`<p class="eyebrow">AVISOS DE ESTE MES</p>${monthEvents.map(item=>`<div class="calendar-event"><strong>${formatNoticeDate(item.eventDate).label}</strong><span>${escapeHtml(item.title)}</span></div>`).join('')}`:'<p class="documents-empty">No hay avisos con fecha en este mes.</p>';
}
function noticeKey(item){return String(item.id||item.created_at||item.title||'');}
function isNoticeUnread(item){const seen=readSeenIds('comunidad-seen-notices');return !seen.includes(noticeKey(item));}
function renderNotices(){noticeList.innerHTML=notices.length?notices.map((n,index)=>{const unread=isNoticeUnread(n);return '<article class="notice-card'+(unread?' is-unread':'')+'" data-notice-key="'+escapeHtml(noticeKey(n))+'"><div class="notice-date"><b>'+escapeHtml(n.date)+'</b>'+escapeHtml(n.month)+'</div><div class="notice-copy"><h3>'+escapeHtml(n.title)+(unread?'<span class="new-label">Nuevo</span>':'')+'</h3><p>'+escapeHtml(n.message)+'</p></div><span class="notice-tag">'+escapeHtml(n.tag)+'</span>'+(currentRole==='admin'?'<button class="notice-remove" type="button" data-notice-id="'+escapeHtml(n.id||'')+'" data-notice-index="'+index+'" aria-label="Eliminar aviso">Eliminar</button>':'')+'</article>';}).join(''):'<p class="documents-empty">Todavía no hay avisos publicados.</p>';const summary=document.querySelector('#noticeResultsSummary');if(summary)summary.textContent=noticeTotal?'Mostrando '+Math.min(notices.length,noticeTotal)+' de '+noticeTotal:'';const more=document.querySelector('#noticeLoadMoreBtn');if(more){more.hidden=notices.length>=noticeTotal||!noticeTotal;more.onclick=loadMoreNotices;}noticeList.querySelectorAll('[data-notice-key]').forEach(card=>card.onclick=()=>{writeSeenIds('comunidad-seen-notices',readSeenIds('comunidad-seen-notices').concat(card.dataset.noticeKey));writeSeenIds('comunidad-top-seen-notices',readSeenIds('comunidad-top-seen-notices').concat(card.dataset.noticeKey));refreshNoveltyNotifications();renderNotices();});noticeList.querySelectorAll('[data-notice-index]').forEach(button=>button.onclick=async event=>{event.stopPropagation();const index=Number(button.dataset.noticeIndex);if(!Number.isInteger(index)||!notices[index])return;if(!window.confirm('¿Quieres eliminar el aviso «'+notices[index].title+'»?'))return;if(notices[index].id&&supabaseClient&&supabaseSession){await deleteRemoteNotice(notices[index].id);return;}notices.splice(index,1);renderNotices();renderCalendar();showToast('Aviso eliminado.');});}
const incidentStatusLabels={pending:'Enviada al administrador',reviewed:'En tramitación',resolved:'Tramitada / Resuelta',cancelled:'Eliminada'};
function incidentStatusMeta(item){
  const sending=item?._clientStatus==='sending';
  if(sending)return{key:'sending',label:'Enviando…',icon:'↻'};
  const key=String(item?.status||'pending').toLowerCase();
  if(key==='reviewed')return{key,label:'En tramitación',icon:'◐'};
  if(key==='resolved')return{key,label:'Tramitada / Resuelta',icon:'✓✓'};
  if(key==='cancelled')return{key,label:'Eliminada',icon:'×'};
  return{key:'pending',label:'Enviada al administrador',icon:'✓'};
}
function incidentDate(value){if(!value)return'—';try{return new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}catch{return String(value);}}
function ensureIncidentSubmissionStatus(){
  let panel=document.querySelector('#incidentSubmissionStatus');
  if(panel)return panel;
  const section=document.querySelector('#incidencias');
  if(!section)return null;
  panel=document.createElement('div');panel.id='incidentSubmissionStatus';panel.className='incident-submission-status';panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');panel.hidden=true;
  section.querySelector('.section-heading')?.after(panel);
  return panel;
}
function showIncidentSubmissionStatus(item,errorMessage=''){
  const panel=ensureIncidentSubmissionStatus();if(!panel)return;
  const isError=Boolean(errorMessage),type=String(item?.type||'Incidencia').toLowerCase()==='sugerencia'?'sugerencia':'incidencia';
  panel.hidden=false;panel.className=`incident-submission-status ${isError?'is-error':'is-sent'}${isError?'':' is-popup'}`;
  panel.innerHTML=isError?`<span class="submission-status-symbol" aria-hidden="true">!</span><div><strong>Error de envío</strong><p>${escapeHtml(errorMessage)}</p><button type="button" class="secondary-btn" data-retry-incident>Reintentar</button></div>`:`<span class="submission-status-symbol" aria-hidden="true">✓</span><div><strong>${type[0].toUpperCase()+type.slice(1)} enviada al administrador</strong><p>Recibida el ${incidentDate(item?.created_at||new Date())}. Estado: <b>${escapeHtml(incidentStatusMeta(item).label)}</b>.</p><p>Referencia: <code>${escapeHtml(item?.id||'pendiente')}</code></p></div>`;
  panel.querySelector('[data-retry-incident]')?.addEventListener('click',()=>document.querySelector('#incidentModal')?.querySelector('form')?.requestSubmit());
}
function clearIncidentSubmissionStatus(){const panel=document.querySelector('#incidentSubmissionStatus');if(panel){panel.hidden=true;panel.innerHTML='';}}
function prepareIncidentDialogUi(){
  const backdrop=document.querySelector('#incidentModal'),card=backdrop?.querySelector('.modal');
  if(backdrop){backdrop.style.zIndex='1000';backdrop.style.padding='12px';}
  if(card){card.style.maxHeight='calc(100dvh - 24px)';card.style.overflowY='auto';card.style.paddingBottom='24px';}
}
function showAdminActionPopup(message,title='Acción realizada'){
  document.querySelector('#incidentSentPopup')?.remove();
  const popup=document.createElement('div');
  popup.id='incidentSentPopup';
  popup.setAttribute('role','alertdialog');
  popup.setAttribute('aria-live','assertive');
  popup.style.cssText='position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:calc(18px + env(safe-area-inset-top,0px)) 16px 24px;background:rgba(14,31,34,.62);';
  const card=document.createElement('div');
  card.style.cssText='width:min(92vw,430px);padding:24px 20px;border-radius:14px;background:#fff;color:#213a3d;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.34);font-family:Arial,sans-serif;border:2px solid #79a98b;';
  const heading=document.createElement('strong');
  heading.textContent=title;
  heading.style.cssText='display:block;font-size:19px;line-height:1.25;color:#28566e;margin-bottom:8px;';
  const copy=document.createElement('p');
  copy.textContent=message;
  copy.style.cssText='margin:0;font-size:14px;line-height:1.45;';
  card.append(heading,copy);
  popup.append(card);
  document.body.append(popup);
  const dismiss=()=>{popup.remove();window.removeEventListener('pointerdown',dismiss,true);};
  window.addEventListener('pointerdown',dismiss,true);
}
function showIncidentConfirmation(type){
  showAdminActionPopup(
    'El mensaje se ha enviado correctamente.',
    type.toLowerCase()==='sugerencia'?'Sugerencia enviada al administrador':'Incidencia enviada al administrador'
  );
}
prepareIncidentDialogUi();
function getIncidentAttachments(item){let raw=item?.attachments??item?.photos??item?.images??item?.photo_urls??[];if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch{raw=[];}}if(raw&&typeof raw==='object'&&!Array.isArray(raw)){raw=raw.files||raw.items||raw.photos||raw.attachments||[];}return Array.isArray(raw)?raw:[];}
function incidentCard(i,index=0){const status=incidentStatusLabels[i.status]||i.status||'Pendiente';const id=escapeHtml(i.id||'');const isHistory=['resolved','cancelled'].includes(String(i.status||'').toLowerCase());const isIncident=String(i.type||'Incidencia').toLowerCase()!=='sugerencia';const failed=i.email_status==='failed';const alreadySent=Boolean(i.sent_at)||i.email_status==='sent';const incidentAttachments=getIncidentAttachments(i);const photoCount=incidentAttachments.length;const incidentSeenKey=String(i.id||'');const incidentSeenList=readSeenIds(String(i.type||'').toLowerCase()==='sugerencia'?'comunidad-seen-suggestions':'comunidad-seen-incidents');const incidentIsUnread=incidentSeenKey&&!incidentSeenList.includes(incidentSeenKey);const noveltyLabel=incidentIsUnread?'<span class="new-label">Novedad</span>':'';const photoButton=isIncident?`<button type="button" class="incident-photo-btn" data-incident-photos="${id}" data-incident-index="${index}">Ver fotos${photoCount?` (${photoCount})`:''}</button>`:'';const adminActions=currentRole==='admin'&&!isHistory&&i.id?`${isIncident&&!alreadySent?`<button type="button" data-incident-email="${id}">${failed?'Reenviar correo':'Enviar correo'}</button>`:''}${i.status!=='reviewed'?`<button type="button" data-incident-status="reviewed" data-incident-id="${id}">Tramitado</button>`:''}<button type="button" data-incident-status="resolved" data-incident-id="${id}">Solucionado</button><button type="button" data-incident-delete="${id}">Eliminar</button>`:'';const actions=(adminActions||photoButton)?`<div class="incident-actions">${photoButton}${adminActions}</div>`:'';const resident=approvedResidents.find(item=>String(item.anonymous_user_id||'')===String(i.created_by||''));const reporter=resident?.full_name||i.reporter_name||i.neighbor_name||i.full_name||i.created_by_name||i.requester_name||i.user_name||(currentRole==='admin'&&supabaseSession?.user?.id&&String(i.created_by)===String(supabaseSession.user.id)?'Administrador de la aplicación':'');const reporterPhone=resident?.phone||i.reporter_phone||i.neighbor_phone||i.phone||'';const reporterFloor=resident?.floor||i.reporter_floor||i.neighbor_floor||i.floor||'';const reporterInfo=currentRole==='admin'&&reporter?'<small class="incident-reporter">Comunica: '+escapeHtml(reporter)+(reporterPhone?' · Teléfono: '+escapeHtml(reporterPhone):'')+(reporterFloor?' · Piso: '+escapeHtml(reporterFloor):'')+'</small>':'';const emailInfo=alreadySent?' · Correo enviado':failed?' · Pendiente de envío':'';return `<article class="incident-card${incidentIsUnread?' is-unread':''}" data-incident-key="${id}" data-incident-type="${escapeHtml(i.type||'')}"><span class="incident-icon">⌁</span><div><h3>${index+1}. ${escapeHtml(i.title)}${noveltyLabel}</h3><p>${escapeHtml(i.message||i.text||'')}${i.location?` · ${escapeHtml(i.location)}`:''}</p><small>${escapeHtml(i.type||'Incidencia')} · ${i.created_at?new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(i.created_at)):escapeHtml(i.text||'')}${emailInfo}</small>${reporterInfo}${failed&&currentRole==='admin'?`<small class="incident-email-error">Error de envío: ${escapeHtml(i.email_error||'No se pudo enviar el correo.')}</small>`:''}${actions}</div><span class="incident-status">${escapeHtml(status)}</span></article>`;}
async function openIncidentPhotos(incidentId,incidentIndex=-1){
  const sourceIncidents=remoteIncidents.length?remoteIncidents:incidents;
  const item=sourceIncidents.find(entry=>incidentId&&String(entry.id)===String(incidentId))||sourceIncidents[Number(incidentIndex)];
  const attachments=getIncidentAttachments(item);
  if(!attachments.length){showAdminActionPopup('Esta incidencia no tiene fotos adjuntas.','Fotos de la incidencia');return;}
  if(!supabaseClient){showAdminActionPopup('No se pudo conectar con el almacenamiento de fotos.','Fotos de la incidencia');return;}
  const modal=document.querySelector('#incidentPhotosModal');
  const content=document.querySelector('#incidentPhotosModalContent');
  if(modal&&content){modal.hidden=false;content.innerHTML='<p>Abriendo fotos…</p>';}
  const previews=[];
  const errors=[];
  for(const rawPhoto of attachments){
    const photo=typeof rawPhoto==='string'?{path:rawPhoto,name:rawPhoto.split('/').pop()}:rawPhoto||{};
    const path=String(photo.path||photo.storage_path||photo.file_path||'').trim();
    const directUrl=String(photo.url||'').trim();
    if(!path&&!directUrl){errors.push('Foto sin ruta');continue;}
    let signedUrl=directUrl;
    let error=null;
    if(!signedUrl){
      const result=await supabaseClient.storage.from('incident-photos').createSignedUrl(path,600);
      signedUrl=result.data?.signedUrl||'';
      error=result.error;
    }
    if(!signedUrl){errors.push(`${photo.name||'Foto'}: ${error?.message||'no se pudo abrir'}`);continue;}
    const safeUrl=escapeHtml(signedUrl);
    const safeName=escapeHtml(photo.name||path.split('/').pop()||'Foto');
    previews.push(`<figure class="incident-photo-preview"><a href="${safeUrl}" target="_blank" rel="noopener"><img src="${safeUrl}" alt="${safeName}" loading="lazy"></a><figcaption>${safeName}</figcaption></figure>`);
  }
  if(modal&&content){
    content.innerHTML=(previews.length?`<div class="incident-photo-previews">${previews.join('')}</div>`:'<p>No se pudo abrir ninguna foto.</p>')+
      (errors.length?`<p class="incident-photo-errors">${escapeHtml(errors.join(' · '))}</p>`:'');
  }else if(previews.length){
    const first=previews[0].match(/href="([^"]+)/)?.[1];
    if(first)window.open(first,'_blank','noopener');
  }
}function renderIncidentList(list,items,empty){if(!list)return;list.innerHTML=items.length?items.map((item,index)=>incidentCard(item,index)).join(''):`<p class="documents-empty">${empty}</p>`;list.querySelectorAll('[data-incident-status]').forEach(button=>button.onclick=()=>updateIncidentStatus(button.dataset.incidentId,button.dataset.incidentStatus));list.querySelectorAll('[data-incident-email]').forEach(button=>button.onclick=()=>sendIncidentNow(button.dataset.incidentEmail));list.querySelectorAll('[data-incident-delete]').forEach(button=>button.onclick=()=>deleteRemoteIncident(button.dataset.incidentDelete));list.querySelectorAll('[data-incident-photos]').forEach(button=>button.onclick=()=>openIncidentPhotos(button.dataset.incidentPhotos,button.dataset.incidentIndex));list.querySelectorAll('[data-incident-key]').forEach(card=>card.onclick=event=>{if(event.target.closest('button'))return;const key=card.dataset.incidentKey;if(!key)return;const section=String(card.dataset.incidentType||'').toLowerCase()==='sugerencia'?'comunidad-seen-suggestions':'comunidad-seen-incidents';writeSeenIds(section,readSeenIds(section).concat(key));writeSeenIds(section.replace('comunidad-seen-','comunidad-top-seen-'),readSeenIds(section.replace('comunidad-seen-','comunidad-top-seen-')).concat(key));refreshNoveltyNotifications();renderIncidents();});}
function renderIncidents(){const allItems=remoteIncidents.length?remoteIncidents:incidents;const terminal=['resolved','cancelled'];const active=allItems.filter(i=>!terminal.includes(String(i.status||'pending').toLowerCase()));const visible=currentRole==='admin'?(showIncidentHistory?allItems.filter(i=>terminal.includes(String(i.status||'').toLowerCase())):active):allItems.filter(i=>String(i.status||'pending').toLowerCase()==='reviewed');const incidentItems=visible.filter(i=>String(i.type||'Incidencia').toLowerCase()!=='sugerencia');const suggestionItems=visible.filter(i=>String(i.type||'').toLowerCase()==='sugerencia');renderIncidentList(incidentList,incidentItems,showIncidentHistory?'No hay incidencias cerradas en el histórico.':'Todavía no hay incidencias tramitadas.');renderIncidentList(suggestionList,suggestionItems,showIncidentHistory?'No hay sugerencias cerradas en el histórico.':'Todavía no hay sugerencias tramitadas.');const heading=document.querySelector('#incidentHeading'),note=document.querySelector('#incidentPermission'),toggle=document.querySelector('#incidentHistoryBtn');if(heading)heading.textContent=showIncidentHistory?'Histórico de incidencias y sugerencias':'Incidencias y sugerencias';if(note)note.textContent=currentRole==='admin'?(showIncidentHistory?'Actuaciones cerradas o eliminadas.':'Pendientes de tramitar o en seguimiento.'):'Aquí aparecen las comunicaciones que el administrador ya ha tramitado.';if(toggle)toggle.textContent=showIncidentHistory?'← Volver a incidencias':'Ver histórico';const summary=document.querySelector('#incidentResultsSummary');const processedCount=incidentItems.filter(item=>String(item.status||'').toLowerCase()==='reviewed').length;if(summary)summary.textContent=processedCount?'Mostrando '+processedCount+' incidencia'+(processedCount===1?'':'s')+' tramitada'+(processedCount===1?'':'s'):'';const more=document.querySelector('#incidentLoadMoreBtn');if(more){more.hidden=remoteIncidents.length>=incidentTotal||!incidentTotal;more.onclick=loadMoreIncidents;}}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]));}
function renderDocuments(){
  const list=document.querySelector('#documentList'); if(!list)return;
  const docs=documentSource==='remote'?remoteDocuments:storedDocuments;
  list.innerHTML=docs.length?docs.map((doc,index)=>{
    const title=escapeHtml(doc.title||doc.name||'Documento');
    const category=escapeHtml(doc.category||doc.type||'Documento');
    const description=escapeHtml(doc.description||'');
    const manage=documentSource==='remote'&&currentRole==='admin'&&documentView==='manage';
    if(manage){
      return '<div class="document-row"><span class="document-icon">▤</span><div><strong>'+title+'</strong><small>'+category+' · Documento compartido</small><div class="document-description-edit"><input type="text" value="'+description+'" placeholder="Aclara para qué sirve este documento" data-description-input="'+escapeHtml(doc.id)+'"><button type="button" class="document-save-description" data-description-id="'+escapeHtml(doc.id)+'">Guardar</button></div></div><button type="button" class="document-remove" data-remote-path="'+escapeHtml(doc.storage_path)+'" data-remote-id="'+escapeHtml(doc.id)+'" aria-label="Quitar '+title+'">×</button></div>';
    }
    const openButton=documentSource==='remote'?'<button type="button" class="document-open" data-document-path="'+escapeHtml(doc.storage_path)+'" aria-label="Abrir '+title+'">Abrir documento ↗</button>':'';
    return '<details class="document-accordion"><summary><span class="document-accordion-icon">▤</span><span class="document-accordion-title"><strong>'+title+'</strong><small>'+category+' · Documento compartido</small></span><span class="document-accordion-chevron" aria-hidden="true">＋</span></summary><div class="document-accordion-body">'+(description?'<p class="document-description">'+description+'</p>':'<p class="document-description document-description-empty">Pulsa “Abrir documento” para consultar este archivo.</p>')+openButton+'</div></details>';
  }).join(''):'<p class="documents-empty">Todavía no hay documentos añadidos.</p>';
  list.querySelectorAll('[data-document-index]').forEach(button=>button.onclick=()=>{storedDocuments.splice(Number(button.dataset.documentIndex),1);localStorage.setItem('comunidad-documents',JSON.stringify(storedDocuments));renderDocuments();showToast('Documento quitado.');});
  list.querySelectorAll('[data-document-path]').forEach(button=>button.onclick=()=>openRemoteDocument(button.dataset.documentPath));
  list.querySelectorAll('[data-remote-path]').forEach(button=>button.onclick=()=>deleteRemoteDocument(button.dataset.remotePath,button.dataset.remoteId));
  list.querySelectorAll('[data-description-id]').forEach(button=>button.onclick=()=>saveDocumentDescription(button.dataset.descriptionId));
}
async function saveDocumentDescription(id){ const input=document.querySelector(`[data-description-input="${CSS.escape(id)}"]`); if(!input||!supabaseClient||!supabaseSession) return; const description=input.value.trim(); const {error}=await supabaseClient.from('documents').update({description}).eq('id',id); if(error){showToast(`No se pudo guardar la descripción: ${error.message}`);return;} const doc=remoteDocuments.find(item=>item.id===id); if(doc) doc.description=description; renderDocuments(); showToast('Descripción guardada.'); }
async function deleteRemoteDocument(path,id){ if(!supabaseClient || !supabaseSession || currentRole!=='admin') return; const name=remoteDocuments.find(doc=>doc.id===id)?.title||'este documento'; if(!window.confirm(`¿Quieres quitar «${name}» de la comunidad?`)) return; const {error:storageError}=await supabaseClient.storage.from('community-documents').remove([path]); if(storageError){showToast(`No se pudo quitar el archivo: ${storageError.message}`); return;} const {error:rowError}=await supabaseClient.from('documents').delete().eq('id',id); if(rowError){showToast(`No se pudo quitar el registro: ${rowError.message}`); return;} await refreshRemoteDocuments(); showToast('Documento quitado.'); }
async function refreshRemoteDocuments(){ if(!supabaseClient || !supabaseSession) return false; const {data,error}=await supabaseClient.from('documents').select('*').order('created_at',{ascending:false}); if(error){showToast(`No se pudieron consultar los documentos: ${error.message}`); return false;} remoteDocuments=data||[]; documentSource='remote'; renderDocuments(); return true; }
async function refreshRemoteNotices({append=false}={}){if(!supabaseClient||!supabaseSession)return false;const page=append?noticePage+1:0;const from=page*LIST_PAGE_SIZE,to=from+LIST_PAGE_SIZE-1;const {data,error,count}=await supabaseClient.from('community_notices').select('*',{count:'exact'}).order('created_at',{ascending:false}).range(from,to);if(error){showToast('No se pudieron consultar los avisos: '+error.message);return false;}noticePage=page;noticeTotal=count||0;const mapped=(data||[]).map(item=>{const dateInfo=formatNoticeDate(item.event_date);return {...item,date:dateInfo.day,month:dateInfo.month,eventDate:item.event_date};});if(append)notices.splice(notices.length,0,...mapped);else notices.splice(0,notices.length,...mapped);renderNotices();renderCalendar();refreshNoveltyNotifications();return true;}
async function loadMoreNotices(){await refreshRemoteNotices({append:true});}
async function refreshRemoteIncidents({append=false}={}){if(!supabaseClient||!supabaseSession)return false;const page=append?incidentPage+1:0;const from=page*LIST_PAGE_SIZE,to=from+LIST_PAGE_SIZE-1;const {data,error,count}=await supabaseClient.from('community_incident_notifications').select('*',{count:'exact'}).order('created_at',{ascending:false}).range(from,to);if(error){showToast('No se pudieron consultar las incidencias: '+error.message);return false;}incidentPage=page;incidentTotal=count||0;if(append)remoteIncidents.push(...(data||[]));else remoteIncidents=data||[];renderIncidents();refreshNoveltyNotifications();return true;}
async function loadMoreIncidents(){await refreshRemoteIncidents({append:true});}
async function refreshNeighborProfile(){if(!supabaseClient||!supabaseSession||currentRole!=='neighbor')return false;const {data,error}=await supabaseClient.rpc('get_neighbor_profile');if(error){return false;}neighborProfile=data||{};updateNeighborProfileView();return true;}
function updateNeighborProfileView(){if(currentRole!=='neighbor')return;document.querySelector('#profileName').textContent=neighborProfile.name||'Vecino autorizado';document.querySelector('#profileAddress').textContent=neighborProfile.floor||'Piso confirmado';document.querySelector('#profileStatus').textContent='Cuenta verificada';}
function showNeighborProfile(){const form=document.querySelector('#registerForm');if(!form)return;document.querySelector('#registerTitle').textContent='Mi perfil';document.querySelector('#registerModal .modal-intro').textContent='Estos son los datos de tu cuenta en la comunidad.';['invite','password'].forEach(name=>setNeighborFieldVisible(name,false,false));['name','floor','phone','username'].forEach(name=>setNeighborFieldVisible(name,true,false));const values={name:neighborProfile.name||'',floor:neighborProfile.floor||'',phone:neighborProfile.phone||'',username:neighborProfile.username||''};Object.entries(values).forEach(([name,value])=>{const input=form.querySelector(`[name="${name}"]`);if(input){input.value=value;input.readOnly=true;}});form.querySelector('button[type="submit"]').hidden=true;openModal('registerModal');}
function incidentReporter(item){const find=(keys,fallback)=>{for(const key of keys){const value=item?.[key]??item?.reporter?.[key];if(value!==undefined&&value!==null&&String(value).trim())return String(value).trim();}return fallback;};return{name:find(['reporter_name','neighbor_name','full_name','created_by_name','requester_name','user_name'],neighborProfile.name||'Vecino no identificado'),phone:find(['reporter_phone','neighbor_phone','phone','user_phone'],neighborProfile.phone||'No indicado'),floor:find(['reporter_floor','neighbor_floor','floor','user_floor'],neighborProfile.floor||'No indicado'),username:find(['reporter_username','neighbor_username','username','user_username'],neighborProfile.username||'No indicado')};}
async function sendIncidentEmail(item,{manual=false}={}){const {data,error}=await supabaseClient.functions.invoke('send-incident-email',{body:{incident_id:item.id,manual}});if(error){let message=error.message||'No se pudo contactar con el servicio de correo.';try{const response=error.context;if(response&&typeof response.json==='function'){const details=await response.json();if(details?.error)message=details.error;}}catch{}throw new Error(message);}if(!data?.ok&&!data?.skipped)throw new Error(data?.error||'El servicio de correo no confirmó el envío.');return data||{};}
async function loadIncidentEmailSetting(){const panel=document.querySelector('#incidentEmailSetting'),input=document.querySelector('#automaticIncidentEmail');if(!panel||!input)return;const isAdmin=currentRole==='admin'&&Boolean(supabaseSession)&&!supabaseSession.user?.is_anonymous;panel.hidden=!isAdmin;if(!isAdmin)return;const {data,error}=await supabaseClient.rpc('get_incident_email_setting');if(error){showToast('No se pudo leer el ajuste de envío automático.');return;}automaticIncidentEmail=Boolean(data);input.checked=automaticIncidentEmail;document.querySelector('#automaticIncidentEmailState').textContent=automaticIncidentEmail?'Activado':'Desactivado';}
async function saveIncidentEmailSetting(enabled){const input=document.querySelector('#automaticIncidentEmail');if(!supabaseClient||!supabaseSession||currentRole!=='admin'||supabaseSession.user?.is_anonymous)return;input.disabled=true;const {data,error}=await supabaseClient.rpc('set_incident_email_setting',{p_enabled:enabled});input.disabled=false;if(error){input.checked=automaticIncidentEmail;showToast(`No se pudo guardar el ajuste: ${error.message}`);return;}automaticIncidentEmail=Boolean(data);input.checked=automaticIncidentEmail;document.querySelector('#automaticIncidentEmailState').textContent=automaticIncidentEmail?'Activado':'Desactivado';showToast(automaticIncidentEmail?'Envío automático activado.':'Envío automático desactivado.');}
function setIncidentButtonsBusy(id,busy){document.querySelectorAll('.incident-actions button').forEach(button=>{const buttonId=button.dataset.incidentId||button.dataset.incidentEmail||button.dataset.incidentDelete;if(String(buttonId)===String(id))button.disabled=busy;});}
function beginIncidentAction(id){if(incidentActionsInFlight.has(String(id))){showToast('Esta incidencia ya se está procesando. Espera un momento.');return false;}incidentActionsInFlight.add(String(id));setIncidentButtonsBusy(id,true);return true;}
function endIncidentAction(id){incidentActionsInFlight.delete(String(id));setIncidentButtonsBusy(id,false);}
async function sendIncidentNow(id){if(!supabaseClient||!supabaseSession||currentRole!=='admin')return;const item=remoteIncidents.find(i=>String(i.id)===String(id));if(!item||String(item.type||'Incidencia').toLowerCase()==='sugerencia'||item.sent_at||item.email_status==='sent')return;if(!beginIncidentAction(id))return;try{await sendIncidentEmail(item,{manual:true});await refreshRemoteIncidents();showAdminActionPopup('La incidencia sigue pendiente de tramitar.','Correo enviado');}catch(error){await refreshRemoteIncidents();showAdminActionPopup(`No se pudo enviar el correo. ${error.message||''}`,'Error al enviar el correo');}finally{endIncidentAction(id);}}
async function updateIncidentStatus(id,status){if(!supabaseClient||!supabaseSession||currentRole!=='admin')return;const item=remoteIncidents.find(i=>String(i.id)===String(id));if(!item||!beginIncidentAction(id))return;try{const isIncident=String(item.type||'Incidencia').toLowerCase()!=='sugerencia';const shouldSend=status==='reviewed'&&isIncident&&String(item.status||'pending').toLowerCase()==='pending'&&!item.sent_at&&item.email_status!=='sent';let emailPending=false;if(shouldSend){try{await sendIncidentEmail(item,{manual:true});}catch(error){emailPending=true;await refreshRemoteIncidents();showAdminActionPopup(`El correo no se pudo enviar todavía. La incidencia se tramitará y podrás reenviarlo. ${error.message||''}`,'Correo pendiente');}}const {data,error}=await supabaseClient.from('community_incident_notifications').update({status,updated_at:new Date().toISOString()}).eq('id',id).select('id').maybeSingle();if(error)throw error;if(!data)throw new Error('El servidor no autorizó el cambio o la incidencia ya no existe.');await refreshRemoteIncidents();showAdminActionPopup(shouldSend&&!emailPending?'Incidencia tramitada y correo enviado.':emailPending?'Incidencia tramitada. El correo quedó pendiente y puedes reenviarlo.':`Incidencia marcada como ${incidentStatusLabels[status].toLowerCase()}.`,'Incidencia actualizada');}catch(error){await refreshRemoteIncidents();showAdminActionPopup(`No se pudo actualizar la incidencia. ${error.message||''}`,'No se pudo actualizar');}finally{endIncidentAction(id);}}
async function deleteRemoteIncident(id){if(!supabaseClient||!supabaseSession||currentRole!=='admin')return;if(!window.confirm('¿Quieres eliminar esta incidencia?'))return;if(!beginIncidentAction(id))return;try{const {data,error}=await supabaseClient.from('community_incident_notifications').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',id).select('id').maybeSingle();if(error)throw error;if(!data)throw new Error('El servidor no autorizó el cambio o la incidencia ya no existe.');await refreshRemoteIncidents();showAdminActionPopup('La incidencia se ha eliminado del listado activo.','Incidencia eliminada');}catch(error){await refreshRemoteIncidents();showAdminActionPopup(`No se pudo archivar la incidencia. ${error.message||''}`,'No se pudo eliminar')}finally{endIncidentAction(id);}}
async function deleteRemoteNotice(id){if(!supabaseClient||!supabaseSession||currentRole!=='admin')return;const {error}=await supabaseClient.from('community_notices').delete().eq('id',id);if(error){showToast(`No se pudo eliminar el aviso: ${error.message}`);return;}await refreshRemoteNotices();showToast('Aviso eliminado.');}
async function refreshNeighborAccess(){
  if(!invitationCode||!supabaseClient||!supabaseSession)return;
  const wasApproved=neighborApproved;
  await checkNeighborAccess();
  if(neighborApproved){
    await refreshRemoteDocuments();
    await refreshRemoteNotices();
  }
  applyAccessGate();
  if(neighborApproved&&!wasApproved)showToast('Acceso autorizado. Ya puedes consultar la comunidad.');
}
function subscribeToRealtime(){if(!supabaseClient||!supabaseSession)return;if(realtimeChannel)supabaseClient.removeChannel(realtimeChannel);realtimeChannel=supabaseClient.channel('community-live').on('postgres_changes',{event:'*',schema:'public',table:'community_notices'},()=>refreshRemoteNotices()).on('postgres_changes',{event:'*',schema:'public',table:'documents'},()=>refreshRemoteDocuments()).on('postgres_changes',{event:'*',schema:'public',table:'community_incident_notifications'},()=>refreshRemoteIncidents()).on('postgres_changes',{event:'*',schema:'public',table:'community_chat_messages'},()=>refreshChatNotifications(true)).on('postgres_changes',{event:'*',schema:'public',table:'community_access_requests'},()=>{if(currentRole==='admin'){refreshAccessRequests();refreshApprovedResidents();}else if(invitationCode)refreshNeighborAccess();}).subscribe();}
async function openRemoteDocument(path){ const {data,error}=await supabaseClient.storage.from('community-documents').createSignedUrl(path,600); if(error){showToast('No se pudo abrir el documento.'); return;} window.open(data.signedUrl,'_blank','noopener'); }
function updateAuthButton(){ const button=document.querySelector('#authBtn'); if(!button)return; const canLogout=Boolean(supabaseSession)&&((currentRole==='admin'&&!supabaseSession.user?.is_anonymous)||neighborApproved); button.hidden=!canLogout; button.textContent=canLogout?'Salir':'Entrar'; }
async function startNeighborSession(){ if(!supabaseClient)return false; const {data,error}=await supabaseClient.auth.signInAnonymously(); if(error){showToast('No se pudo preparar el acceso seguro del vecino.');return false;} supabaseSession=data.session; updateAuthButton(); return true; }
async function initSupabase(){ if(!supabaseClient){applyAccessGate();if(adminLoginRequested)showAdminLoginForm();else if(neighborLoginRequested)showNeighborLoginForm();return;} const passwordRecovery=new URLSearchParams(window.location.hash.slice(1)).get('type')==='recovery'; const {data}=await supabaseClient.auth.getSession(); supabaseSession=data.session; if(passwordRecovery&&supabaseSession&&!supabaseSession.user?.is_anonymous){currentRole='admin';document.querySelector('.role-choice[data-role="admin"]')?.click();} updateAuthButton(); if((invitationCode||publicRegistrationRequested||neighborLoginRequested)&&!supabaseSession)await startNeighborSession(); if(supabaseSession){await refreshRemoteIncidents();} if(supabaseSession&&currentRole==='admin'&&!supabaseSession.user?.is_anonymous){await loadIncidentEmailSetting();await refreshAccessRequests();await refreshApprovedResidents();await refreshRemoteNotices();} if(invitationCode){await loadNeighborInviteState();if(neighborInviteState==='approved'){showNeighborPasswordForm(false);}else if(neighborInviteState==='approved_unconfigured'){showNeighborPasswordForm(true);}else if(neighborInviteState==='pending'){showNeighborPendingState();}else showNeighborRegistrationForm();} else if(publicRegistrationRequested){showPublicRegistrationForm();} else if(neighborLoginRequested){showNeighborLoginForm();} if(supabaseSession)subscribeToRealtime(); applyAccessGate(); if(adminLoginRequested&&(!supabaseSession||supabaseSession.user?.is_anonymous))showAdminLoginForm(); supabaseClient.auth.onAuthStateChange(async(_event,session)=>{supabaseSession=session;if(!session)neighborApproved=false; updateAuthButton(); syncDocumentPermissions(); if(session){await refreshRemoteIncidents();} if(session&&currentRole==='admin'&&!session.user?.is_anonymous){await refreshAccessRequests();await refreshApprovedResidents();await refreshRemoteNotices();await loadIncidentEmailSetting();} if(session)subscribeToRealtime(); applyAccessGate(); if(_event==='PASSWORD_RECOVERY'){currentRole='admin';document.querySelector('.role-choice[data-role="admin"]')?.click();openModal('changeAdminPasswordModal');} if(adminLoginRequested&&(!session||session.user?.is_anonymous))showAdminLoginForm();}); if(passwordRecovery&&supabaseSession&&!supabaseSession.user?.is_anonymous)openModal('changeAdminPasswordModal'); }
function openModal(id){ const modal=document.querySelector('#'+id); if(!modal)return; modal.hidden=false; if(id==='documentsModal'){document.documentElement.classList.add('documents-viewer-open');document.body.classList.add('documents-viewer-open');document.querySelector('.mobile-nav')?.setAttribute('data-documents-hidden','true');} }
function closeModal(id){ const modal=document.querySelector('#'+id); if(modal)modal.hidden=true; if(id==='documentsModal'){document.documentElement.classList.remove('documents-viewer-open');document.body.classList.remove('documents-viewer-open');document.querySelector('.mobile-nav')?.removeAttribute('data-documents-hidden');} if(id==='communityChatModal'&&chatPollHandle){clearInterval(chatPollHandle);chatPollHandle=null;chatRequestId=null;} }
let toastTimer=null; function showToast(message,duration=5000){ if(!toast)return; toast.textContent=message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('show'),duration); }
function urlBase64ToUint8Array(value){const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(base64),char=>char.charCodeAt(0));}
async function updatePushButton(){const button=document.querySelector('#enableNotificationsBtn');if(!button)return;if(!('Notification' in window)||!('serviceWorker' in navigator)||!window.SUPABASE_CONFIG?.vapidPublicKey){button.hidden=true;return;}try{const registration=await navigator.serviceWorker.ready;pushSubscription=await registration.pushManager.getSubscription();button.textContent=pushSubscription?'Notificaciones activadas':'Activar notificaciones';button.classList.toggle('is-active',Boolean(pushSubscription));}catch{button.textContent='Activar notificaciones';}}
async function enablePushNotifications(){const button=document.querySelector('#enableNotificationsBtn');if(!supabaseClient||!supabaseSession){showToast('Inicia sesión para activar las notificaciones.');return;}if(!('Notification' in window)||!('serviceWorker' in navigator)||!window.SUPABASE_CONFIG?.vapidPublicKey){showToast('Este navegador no permite notificaciones web.');return;}try{const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();if(permission!=='granted'){showToast('No se han permitido las notificaciones.');return;}const registration=await navigator.serviceWorker.ready;pushSubscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(window.SUPABASE_CONFIG.vapidPublicKey)});const json=pushSubscription.toJSON();const {error}=await supabaseClient.rpc('save_push_subscription',{p_endpoint:json.endpoint,p_p256dh:json.keys?.p256dh||'',p_auth:json.keys?.auth||''});if(error)throw error;button.textContent='Notificaciones activadas';button.classList.add('is-active');showToast('Notificaciones activadas en este dispositivo.');}catch(error){showToast(`No se pudieron activar las notificaciones: ${error.message||'comprueba los permisos del navegador.'}`);}}
document.querySelector('#newNoticeBtn').onclick=()=>{const dateInput=document.querySelector('#noticeForm input[name="date"]');if(dateInput&&!dateInput.value)dateInput.value=new Date().toISOString().slice(0,10);openModal('noticeModal');};
document.querySelector('#newIncidentBtn').onclick=()=>openModal('incidentModal');
document.querySelector('#newIncidentBtn').hidden=true;
document.querySelector('#quickIncidentBtn').onclick=()=>openModal('incidentModal');
document.querySelector('#profileBtn').onclick=()=> currentRole==='admin' ? showToast('Perfil de Eduardo Santamaría · administrador de la aplicación.') : showNeighborProfile();
document.querySelector('#enableNotificationsBtn')?.addEventListener('click',enablePushNotifications);
document.querySelector('#openNeighborChatBtn').onclick=openNeighborCommunityChat;
document.querySelector('#registerForm').addEventListener('submit',()=>setTimeout(()=>{if(currentRole==='neighbor'&&neighborApproved)refreshNeighborProfile();},1200));
document.querySelector('#viewAllBtn').onclick=()=>showToast('Aquí aparecerá el historial completo de avisos.');
document.querySelector('#incidentHistoryBtn').onclick=()=>{showIncidentHistory=!showIncidentHistory;renderIncidents();};
document.querySelector('#automaticIncidentEmail').onchange=e=>saveIncidentEmailSetting(e.currentTarget.checked);
document.querySelector('#changeAdminPasswordBtn').onclick=()=>{if(currentRole!=='admin'||!supabaseSession||supabaseSession.user?.is_anonymous){showToast('Inicia sesión como administrador para cambiar la contraseña.');return;}document.querySelector('#changeAdminPasswordForm').reset();openModal('changeAdminPasswordModal');};
document.querySelector('#changeAdminPasswordForm').onsubmit=async e=>{e.preventDefault();if(currentRole!=='admin'||!supabaseSession||supabaseSession.user?.is_anonymous){showToast('Inicia sesión como administrador para cambiar la contraseña.');return;}const form=e.currentTarget,data=new FormData(form),password=String(data.get('password')||''),confirmation=String(data.get('passwordConfirm')||'');if(password.length<8){showToast('La contraseña debe tener al menos 8 caracteres.');return;}if(password!==confirmation){showToast('Las contraseñas no coinciden.');return;}const submit=form.querySelector('[type=submit]');submit.disabled=true;try{const {error}=await supabaseClient.auth.updateUser({password});if(error)throw error;form.reset();closeModal('changeAdminPasswordModal');showToast('Contraseña actualizada.');}catch(error){showToast(`No se pudo cambiar la contraseña: ${error.message||'inténtalo de nuevo.'}`);}finally{submit.disabled=false;}};

document.querySelector('#changeNeighborPasswordBtn').onclick=()=>{if(currentRole!=='neighbor'||!neighborApproved||!supabaseSession){showToast('Inicia sesión como vecino para cambiar la contraseña.');return;}document.querySelector('#changeNeighborPasswordForm').reset();openModal('changeNeighborPasswordModal');};
document.querySelector('#changeNeighborPasswordForm').onsubmit=async e=>{e.preventDefault();if(currentRole!=='neighbor'||!neighborApproved||!supabaseSession){showToast('Inicia sesión como vecino para cambiar la contraseña.');return;}const form=e.currentTarget,data=new FormData(form),currentPassword=String(data.get('currentPassword')||''),password=String(data.get('password')||''),confirmation=String(data.get('passwordConfirm')||'');if(currentPassword.length<6){showToast('Indica tu contraseña actual.');return;}if(password.length<8){showToast('La contraseña nueva debe tener al menos 8 caracteres.');return;}if(password!==confirmation){showToast('Las contraseñas nuevas no coinciden.');return;}const submit=form.querySelector('[type=submit]');submit.disabled=true;try{const {data:ok,error}=await supabaseClient.rpc('change_neighbor_password',{p_current_password:currentPassword,p_new_password:password});if(error)throw error;if(!ok)throw new Error('No se pudo verificar la cuenta vecinal.');form.reset();closeModal('changeNeighborPasswordModal');showToast('Contraseña actualizada.');}catch(error){showToast(`No se pudo cambiar la contraseña: ${error.message||'inténtalo de nuevo.'}`);}finally{submit.disabled=false;}};
function updateChatAccessButtons(){const chatButton=document.querySelector('#openNeighborChatBtn'),passwordButton=document.querySelector('#changeNeighborPasswordBtn');const neighborReady=currentRole==='neighbor'&&neighborApproved&&Boolean(supabaseSession);const passwordReady=currentRole==='neighbor';if(chatButton)chatButton.hidden=!neighborReady;if(passwordButton)passwordButton.hidden=!passwordReady;}
function notificationScope(){const adminId=supabaseSession?.user?.is_anonymous?null:supabaseSession?.user?.id;const neighborId=neighborProfile?.id||neighborProfile?.user_id||neighborProfile?.username||neighborProfile?.access_request_id||supabaseSession?.user?.id||'session';return currentRole==='admin'&&adminId?'admin-'+adminId:'neighbor-'+neighborId;}
function scopedNotificationKey(key){return key.startsWith('comunidad-')&&key!=='comunidad-documents'?key+'::'+notificationScope():key;}
function readSeenIds(key){try{const value=JSON.parse(localStorage.getItem(scopedNotificationKey(key))||'[]');return Array.isArray(value)?value.map(String):[];}catch{return[];}}
function writeSeenIds(key,ids){localStorage.setItem(scopedNotificationKey(key),JSON.stringify([...new Set((ids||[]).map(String))]));}
function getNoveltyIncidentItems(){const terminal=['resolved','cancelled'];const isIncident=item=>String(item.type||'Incidencia').toLowerCase()==='incidencia';const isSuggestion=item=>String(item.type||'').toLowerCase()==='sugerencia';if(currentRole==='admin')return{incidents:remoteIncidents.filter(item=>!terminal.includes(String(item.status||'pending').toLowerCase())&&isIncident(item)),suggestions:remoteIncidents.filter(item=>!terminal.includes(String(item.status||'pending').toLowerCase())&&isSuggestion(item))};return{incidents:remoteIncidents.filter(item=>String(item.status||'pending').toLowerCase()==='reviewed'&&isIncident(item)),suggestions:remoteIncidents.filter(item=>String(item.status||'pending').toLowerCase()==='reviewed'&&isSuggestion(item))};}
function renderNoveltyNotifications(){const badge=document.querySelector('#notificationBadge'),noticeBadge=document.querySelector('#noticeUnreadCount'),incidentBadge=document.querySelector('#incidentUnreadCount'),suggestionBadge=document.querySelector('#suggestionUnreadCount'),requestBadge=document.querySelector('#requestUnreadCount'),list=document.querySelector('#notificationsList');const topTotal=topNoveltyState.chat+topNoveltyState.incidents+topNoveltyState.suggestions+topNoveltyState.documents+topNoveltyState.notices+topNoveltyState.requests;const values=[['navNoticeUnread','mobileNoticeUnread',noveltyState.notices],['navIncidentUnread','mobileIncidentUnread',noveltyState.incidents+noveltyState.suggestions],['navChatUnread','mobileChatUnread',noveltyState.chat],['navRequestUnread','mobileRequestUnread',noveltyState.requests]];if(badge){badge.textContent=topTotal>99?'99+':String(topTotal);badge.hidden=!topTotal;badge.setAttribute('aria-label',topTotal+' novedades sin leer');}[[noticeBadge,noveltyState.notices],[incidentBadge,noveltyState.incidents],[suggestionBadge,noveltyState.suggestions],[requestBadge,noveltyState.requests]].forEach(([node,count])=>{if(node){node.textContent=count>99?'99+':String(count);node.hidden=!count;node.setAttribute('aria-label',count+' elementos sin leer');}});values.forEach(([desktop,mobile,count])=>[desktop,mobile].forEach(id=>{const node=document.querySelector('#'+id);if(node){node.textContent=count>99?'99+':String(count);node.hidden=!count;node.setAttribute('aria-label',count+' elementos sin leer');}}));document.title=topTotal?'('+topTotal+') Comunidad de vecinos Cuartel de la Cava':'Comunidad de vecinos Cuartel de la Cava';if(!list)return;const source=topTotal?topNoveltyState:lastOpenedNoveltySummary;const items=[];if(source.notices)items.push('<p><strong>Avisos:</strong> '+source.notices+' nuevo'+(source.notices===1?'':'s')+' pendiente'+(source.notices===1?'':'s')+' de lectura.</p>');if(source.incidents)items.push('<p><strong>Incidencias:</strong> '+source.incidents+' con novedades para revisar.</p>');if(source.suggestions)items.push('<p><strong>Sugerencias:</strong> '+source.suggestions+' nueva'+(source.suggestions===1?'':'s')+' o actualizada'+(source.suggestions===1?'':'s')+'.</p>');if(source.chat)items.push('<p><strong>Chats:</strong> '+source.chat+' mensaje'+(source.chat===1?'':'s')+' nuevo'+(source.chat===1?'':'s')+'.</p>');if(source.documents)items.push('<p><strong>Documentos:</strong> '+source.documents+' nuevo'+(source.documents===1?'':'s')+' disponible'+(source.documents===1?'':'s')+'.</p>');if(source.requests)items.push('<p><strong>Solicitudes de alta:</strong> '+source.requests+' pendiente'+(source.requests===1?'':'s')+' de revisión.</p>');list.innerHTML=items.length?items.join(''):'<p class="documents-empty">No hay novedades.</p>';}
function markNotificationSectionAsRead(section){if(section==='notices'){const keys=notices.map(noticeKey);writeSeenIds('comunidad-seen-notices',readSeenIds('comunidad-seen-notices').concat(keys));writeSeenIds('comunidad-top-seen-notices',readSeenIds('comunidad-top-seen-notices').concat(keys));}if(section==='requests'){const ids=accessRequests.filter(item=>['pending','more_info'].includes(String(item.status||'').toLowerCase())).map(item=>item.id);writeSeenIds('comunidad-seen-requests',readSeenIds('comunidad-seen-requests').concat(ids));writeSeenIds('comunidad-top-seen-requests',readSeenIds('comunidad-top-seen-requests').concat(ids));}if(section==='incidents'||section==='suggestions'){const groups=getNoveltyIncidentItems();const key=section==='incidents'?'comunidad-seen-incidents':'comunidad-seen-suggestions';const topKey=section==='incidents'?'comunidad-top-seen-incidents':'comunidad-top-seen-suggestions';const ids=groups[section].map(item=>item.id);writeSeenIds(key,readSeenIds(key).concat(ids));writeSeenIds(topKey,readSeenIds(topKey).concat(ids));}refreshNoveltyNotifications();renderNotices();renderIncidents();}
async function refreshNoveltyNotifications(){if(!supabaseClient||!supabaseSession)return;const incomingRole=currentRole==='admin'?'neighbor':'admin';const {data:chatData}=await supabaseClient.from('community_chat_messages').select('id').eq('sender_role',incomingRole).is('read_at',null);const sectionSeenChats=readSeenIds('comunidad-seen-chats'),topSeenChats=readSeenIds('comunidad-top-seen-chats');const actualChats=(chatData||[]).filter(item=>!sectionSeenChats.includes(String(item.id)));const groups=getNoveltyIncidentItems();const sectionSeenIncidents=readSeenIds('comunidad-seen-incidents'),sectionSeenSuggestions=readSeenIds('comunidad-seen-suggestions');const topSeenIncidents=readSeenIds('comunidad-top-seen-incidents'),topSeenSuggestions=readSeenIds('comunidad-top-seen-suggestions');const actualIncidents=groups.incidents.filter(item=>!sectionSeenIncidents.includes(String(item.id))),actualSuggestions=groups.suggestions.filter(item=>!sectionSeenSuggestions.includes(String(item.id)));const seenNotices=readSeenIds('comunidad-seen-notices'),topSeenNotices=readSeenIds('comunidad-top-seen-notices');const actualNotices=notices.filter(item=>!seenNotices.includes(noticeKey(item)));const seenDocuments=readSeenIds('comunidad-seen-documents'),topSeenDocuments=readSeenIds('comunidad-top-seen-documents');const actualDocuments=(remoteDocuments||[]).filter(item=>item.id&&!seenDocuments.includes(String(item.id)));const seenRequests=readSeenIds('comunidad-seen-requests'),topSeenRequests=readSeenIds('comunidad-top-seen-requests');const actualRequests=accessRequests.filter(item=>['pending','more_info'].includes(String(item.status||'').toLowerCase())&&!seenRequests.includes(String(item.id)));noveltyState={chat:actualChats.length,incidents:actualIncidents.length,suggestions:actualSuggestions.length,documents:actualDocuments.length,notices:actualNotices.length,requests:actualRequests.length};topNoveltyState={chat:actualChats.filter(item=>!topSeenChats.includes(String(item.id))).length,incidents:actualIncidents.filter(item=>!topSeenIncidents.includes(String(item.id))).length,suggestions:actualSuggestions.filter(item=>!topSeenSuggestions.includes(String(item.id))).length,documents:actualDocuments.filter(item=>!topSeenDocuments.includes(String(item.id))).length,notices:actualNotices.filter(item=>!topSeenNotices.includes(noticeKey(item))).length,requests:actualRequests.filter(item=>!topSeenRequests.includes(String(item.id))).length};renderNoveltyNotifications();}
async function refreshChatNotifications(notify=true){if(!supabaseClient||!supabaseSession||(currentRole==='neighbor'&&!neighborApproved))return;const previousChatCounts=JSON.stringify(chatUnreadByRequest);const incomingRole=currentRole==='admin'?'neighbor':'admin';const {data,error}=await supabaseClient.from('community_chat_messages').select('access_request_id').eq('sender_role',incomingRole).is('read_at',null);if(error)return;chatUnreadByRequest={};neighborUnreadCount=0;for(const message of data||[]){if(currentRole==='admin')chatUnreadByRequest[message.access_request_id]=(chatUnreadByRequest[message.access_request_id]||0)+1;else neighborUnreadCount++;}const total=currentRole==='admin'?Object.values(chatUnreadByRequest).reduce((sum,value)=>sum+value,0):neighborUnreadCount;if(notify&&chatNotificationsPrimed&&total>previousUnreadTotal){showToast(currentRole==='admin'?'Tienes un mensaje nuevo de un vecino.':'Tienes un mensaje nuevo del presidente.');}previousUnreadTotal=total;chatNotificationsPrimed=true;const badge=document.querySelector('#neighborChatUnread');if(badge){badge.textContent=neighborUnreadCount;badge.hidden=!neighborUnreadCount;}if(currentRole==='admin'&&previousChatCounts!==JSON.stringify(chatUnreadByRequest))renderApprovedResidents();renderNoveltyNotifications();}
async function openNeighborCommunityChat(){if(!supabaseClient||!supabaseSession||!neighborApproved){showToast('Inicia sesión como vecino para abrir el chat.');return;}const {data,error}=await supabaseClient.rpc('get_my_community_chat_request_id');if(error||!data){showToast(error?.message||'No se encontró tu cuenta vecinal.');return;}openCommunityChat(data, 'Presidente de la comunidad');}
async function openCommunityChat(requestId,displayName){if(!supabaseClient||!supabaseSession)return;chatRequestId=requestId;const chatTitle=displayName==='Administrador de la comunidad'?'Presidente de la comunidad':(displayName||'Presidente de la comunidad');document.querySelector('#communityChatTitle').textContent=chatTitle;document.querySelector('#communityChatMessages').innerHTML='<p class="documents-empty">Cargando mensajes…</p>';document.querySelector('#communityChatForm').reset();openModal('communityChatModal');await loadCommunityChatMessages();if(chatPollHandle)clearInterval(chatPollHandle);chatPollHandle=setInterval(loadCommunityChatMessages,6000);}
async function loadCommunityChatMessages(){if(!chatRequestId||!supabaseClient||!supabaseSession)return;const list=document.querySelector('#communityChatMessages');const {data,error}=await supabaseClient.from('community_chat_messages').select('id,sender_role,message,created_at,read_at').eq('access_request_id',chatRequestId).order('created_at',{ascending:false}).range(0,29);if(error){list.innerHTML='<p class="documents-empty">No se pudieron cargar los mensajes. Actualiza la aplicación e inténtalo de nuevo.</p>';return;}const messages=(data||[]).reverse();const incomingRole=currentRole==='admin'?'neighbor':'admin';const firstUnread=messages.findIndex(item=>item.sender_role===incomingRole&&!item.read_at);list.innerHTML=messages.length?messages.map((item,index)=>{const mine=(currentRole==='admin'&&item.sender_role==='admin')||(currentRole==='neighbor'&&item.sender_role==='neighbor');const time=new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(item.created_at));const separator=index===firstUnread?'<div class="chat-new-separator">Mensajes nuevos</div>':'';return separator+`<article class="chat-message ${mine?'mine':'theirs'}"><small>${mine?'Tú':item.sender_role==='admin'?'Presidente':'Vecino'} · ${escapeHtml(time)}</small><p>${escapeHtml(item.message)}</p></article>`}).join(''):'<p class="documents-empty">Aún no hay mensajes. Escribe el primero.</p>';if(firstUnread>=0){const unreadIds=messages.slice(firstUnread).filter(item=>item.sender_role===incomingRole&&!item.read_at).map(item=>item.id);writeSeenIds('comunidad-seen-chats',readSeenIds('comunidad-seen-chats').concat(unreadIds));writeSeenIds('comunidad-top-seen-chats',readSeenIds('comunidad-top-seen-chats').concat(unreadIds));}list.scrollTop=list.scrollHeight;if(document.visibilityState==='visible'){await supabaseClient.rpc('mark_community_chat_read',{p_access_request_id:chatRequestId});}await refreshChatNotifications(false);}
document.querySelector('#communityChatForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,input=form.querySelector('[name="message"]'),message=String(input.value||'').trim();if(!message||!chatRequestId)return;const submit=form.querySelector('[type=submit]');submit.disabled=true;try{const {error}=await supabaseClient.rpc('send_community_chat_message',{p_access_request_id:chatRequestId,p_message:message});if(error)throw error;input.value='';await loadCommunityChatMessages();}catch(error){showToast(`No se pudo enviar el mensaje: ${error.message||'inténtalo de nuevo.'}`);}finally{submit.disabled=false;input.focus();}};
function applyAccessGate(){ const authenticatedAdmin=Boolean(supabaseSession)&&currentRole==='admin'&&!supabaseSession.user?.is_anonymous; const authenticatedNeighbor=Boolean(neighborApproved); const hasAccess=authenticatedAdmin||authenticatedNeighbor; const needsChoice=!hasAccess&&!invitationCode&&!neighborLoginRequested&&!adminLoginRequested&&!publicRegistrationRequested; document.body.classList.toggle('access-locked',!hasAccess); document.body.classList.toggle('access-ready',hasAccess); if(accessGate) accessGate.hidden=hasAccess||!needsChoice; updateChatAccessButtons(); }
async function loadNeighborInviteState(){ if(!invitationCode||!supabaseClient){neighborInviteState='new';return neighborInviteState;} const {data,error}=await supabaseClient.rpc('get_invitation_state',{p_invitation_code:invitationCode}); if(error){neighborInviteState='new';return neighborInviteState;} neighborInviteState=String(data||'new'); return neighborInviteState; }
async function checkNeighborAccess(password=''){ if(!invitationCode||!supabaseClient||!password){neighborApproved=false;return false;} const {data,error}=await supabaseClient.rpc('check_invitation_access',{p_invitation_code:invitationCode,p_password:password}); if(error){neighborApproved=false;return false;} neighborApproved=Boolean(data); return neighborApproved; }
function setNeighborFieldVisible(name,visible,required=visible){const input=document.querySelector(`#registerForm [name="${name}"]`);const label=input?.closest('label');if(!input||!label)return;label.hidden=!visible;input.required=required;}
function showNeighborPasswordForm(unconfigured=false){const form=document.querySelector('#registerForm');if(!form)return;['invite','name','floor','phone'].forEach(name=>setNeighborFieldVisible(name,false,false));setNeighborFieldVisible('username',true,true);setNeighborFieldVisible('password',true,true);const title=document.querySelector('#registerTitle'),intro=document.querySelector('#registerModal .modal-intro'),submit=form.querySelector('button[type="submit"]');title.textContent='Entrar en la comunidad';intro.textContent='Tu solicitud ha sido aceptada. Usa tu usuario y contraseña para entrar.';submit.textContent='Entrar';openModal('registerModal');}
function showNeighborRegistrationForm(){const form=document.querySelector('#registerForm');if(!form)return;setNeighborFieldVisible('invite',Boolean(invitationCode),Boolean(invitationCode));['name','floor','phone','username','password'].forEach(name=>setNeighborFieldVisible(name,true,true));['name','floor','phone','username','password'].forEach(name=>{const input=form.querySelector(`[name="${name}"]`);if(input)input.readOnly=false;});document.querySelector('#registerTitle').textContent='Solicitar acceso';document.querySelector('#registerModal .modal-intro').textContent=invitationCode?'Rellena tus datos para que el administrador revise la solicitud.':'Rellena tus datos para enviarlos al administrador.';const submit=form.querySelector('button[type="submit"]');submit.hidden=false;submit.textContent='Enviar solicitud';openModal('registerModal');}
function showPublicRegistrationForm(){showNeighborRegistrationForm();setNeighborFieldVisible('invite',false,false);document.querySelector('#registerTitle').textContent='Crear acceso de vecino';}
function showNeighborLoginForm(){currentRole='neighbor';document.querySelector('#recoverAdminPasswordBtn').hidden=true;document.querySelector('#authTitle').textContent='Entrar como vecino';document.querySelector('#authIntro').textContent='Usa tu usuario y contraseña para entrar desde cualquier dispositivo.';document.querySelector('#authUsernameLabel').hidden=false;document.querySelector('#authUsernameLabel input').required=true;openModal('authModal');}
function showAdminLoginForm(){currentRole='admin';document.querySelector('#recoverAdminPasswordBtn').hidden=false;document.querySelector('#authTitle').textContent='Entrar como administrador';document.querySelector('#authIntro').textContent='Usa el usuario y la contraseña del administrador.';document.querySelector('#authUsernameLabel').hidden=false;document.querySelector('#authUsernameLabel input').required=true;openModal('authModal');}
function showNeighborPendingState(){const form=document.querySelector('#registerForm');if(form)form.querySelector('button[type="submit"]').disabled=true;document.querySelector('#registerTitle').textContent='Solicitud pendiente';document.querySelector('#registerModal .modal-intro').textContent='Tus datos ya se han enviado. El administrador de la aplicación debe aceptar la solicitud antes de permitir el acceso.';openModal('registerModal');}
async function refreshAccessRequests(){ if(!supabaseClient||!supabaseSession||currentRole!=='admin') return; const {data,error}=await supabaseClient.from('community_access_requests').select('*').in('status',['pending','more_info']).order('created_at',{ascending:false}); if(error){showToast(`No se pudieron consultar las solicitudes: ${error.message}`);return;} accessRequests=data||[]; requestUnreadCount=accessRequests.filter(item=>['pending','more_info'].includes(String(item.status||'').toLowerCase())).length; renderAccessRequests(); await refreshNoveltyNotifications(); }
async function refreshApprovedResidents(){ if(!supabaseClient||!supabaseSession||currentRole!=='admin') return; const {data,error}=await supabaseClient.from('community_access_requests').select('*').eq('status','approved').order('created_at',{ascending:false}); if(error){showToast(`No se pudieron consultar los vecinos autorizados: ${error.message}`);return;} approvedResidents=data||[]; renderApprovedResidents(); renderIncidents(); }
function renderAccessRequests(){ const list=document.querySelector('#approvalList'); if(!list)return; const count=document.querySelector('#requestCount'); if(count) count.textContent=`${accessRequests.length} pendiente${accessRequests.length===1?'':'s'}`; if(!accessRequests.length){list.innerHTML='<p class="documents-empty">No hay solicitudes pendientes.</p>';return;} list.innerHTML=accessRequests.map(request=>`<article class="approval-card" data-request-id="${escapeHtml(request.id)}"><div class="approval-avatar">${escapeHtml((request.full_name||'V').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase())}</div><div><strong>${escapeHtml(request.full_name)}</strong><p>${escapeHtml(request.floor)} · Usuario: ${escapeHtml(request.username||'pendiente')}</p></div><div class="approval-actions"><button class="approve-btn" data-request-action="approved">Aceptar</button><button class="reject-btn" data-request-action="rejected">Rechazar</button></div></article>`).join(''); list.querySelectorAll('[data-request-action]').forEach(button=>button.onclick=()=>reviewAccessRequest(button.closest('[data-request-id]').dataset.requestId,button.dataset.requestAction)); }
function formatLastSeen(value){if(!value)return'Nunca ha accedido';const date=new Date(value);return Number.isNaN(date.getTime())?'Sin registro':new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'short'}).format(date);}
function renderApprovedResidents(){ const list=document.querySelector('#approvedList'); if(!list)return; const count=document.querySelector('#approvedCount'),summary=document.querySelector('#approvedResidentsSummary'),pagination=document.querySelector('#approvedResidentsPagination'),pageLabel=document.querySelector('#approvedResidentsPageLabel'),prev=document.querySelector('#approvedResidentsPrev'),next=document.querySelector('#approvedResidentsNext'); if(count) count.textContent=approvedResidents.length; const query=approvedResidentsQuery.trim().toLocaleLowerCase(); const filtered=approvedResidents.filter(request=>[request.full_name,request.floor,request.username,request.phone].some(value=>String(value||'').toLocaleLowerCase().includes(query))); const totalPages=Math.max(1,Math.ceil(filtered.length/APPROVED_RESIDENTS_PAGE_SIZE)); approvedResidentsPage=Math.min(approvedResidentsPage,totalPages-1); const start=approvedResidentsPage*APPROVED_RESIDENTS_PAGE_SIZE; const visible=filtered.slice(start,start+APPROVED_RESIDENTS_PAGE_SIZE); if(summary)summary.textContent=query?`${filtered.length} resultado${filtered.length===1?'':'s'}`:`${approvedResidents.length} vecino${approvedResidents.length===1?'':'s'}`; if(!filtered.length){list.innerHTML='<p class="documents-empty">No hay vecinos que coincidan con la búsqueda.</p>';}else{list.innerHTML=visible.map(request=>{const unread=Number(chatUnreadByRequest[request.id]||0);const phone=request.phone?`Teléfono: ${escapeHtml(request.phone)}`:'Teléfono no indicado';return `<article class="approval-card approved-card" data-approved-id="${escapeHtml(request.id)}"><div class="approval-avatar">${escapeHtml((request.full_name||'V').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase())}</div><div><strong>${escapeHtml(request.full_name)}</strong><p>${escapeHtml(request.floor)} · ${phone}</p><small>${request.username?`Usuario: ${escapeHtml(request.username)} · `:''}Último acceso: ${escapeHtml(formatLastSeen(request.last_seen_at))}</small></div><div class="approval-actions"><button class="secondary-btn chat-open-btn" type="button" data-open-community-chat="${escapeHtml(request.id)}" data-chat-name="${escapeHtml(request.full_name)}">Chat${unread?` <span class="chat-unread-badge">${unread}</span>`:''}</button><button class="reject-btn" data-remove-access="${escapeHtml(request.id)}">Dar de baja</button></div></article>`}).join('');} if(pagination){pagination.hidden=filtered.length<=APPROVED_RESIDENTS_PAGE_SIZE;if(pageLabel)pageLabel.textContent=`Página ${approvedResidentsPage+1} de ${totalPages}`;if(prev)prev.disabled=approvedResidentsPage===0;if(next)next.disabled=approvedResidentsPage>=totalPages-1;} list.querySelectorAll('[data-remove-access]').forEach(button=>button.onclick=()=>removeResidentAccess(button.dataset.removeAccess));list.querySelectorAll('[data-open-community-chat]').forEach(button=>button.onclick=()=>openCommunityChat(button.dataset.openCommunityChat,button.dataset.chatName)); }
document.querySelector('#approvedResidentsSearch')?.addEventListener('input',event=>{approvedResidentsQuery=event.currentTarget.value;approvedResidentsPage=0;renderApprovedResidents();});document.querySelector('#approvedResidentsPrev')?.addEventListener('click',()=>{approvedResidentsPage=Math.max(0,approvedResidentsPage-1);renderApprovedResidents();});document.querySelector('#approvedResidentsNext')?.addEventListener('click',()=>{approvedResidentsPage+=1;renderApprovedResidents();});
async function reviewAccessRequest(id,status){ if(!supabaseClient||!supabaseSession)return; let reviewNote=null; if(status==='more_info'){reviewNote=window.prompt('Escribe qué información debe completar el vecino:','Indica el portal, el piso o cualquier dato que falte.'); if(reviewNote===null)return;} const {error}=await supabaseClient.from('community_access_requests').update({status,review_note:reviewNote,reviewed_at:new Date().toISOString(),reviewed_by:supabaseSession.user.id}).eq('id',id); if(error){showToast(`No se pudo actualizar la solicitud: ${error.message}`);return;} await refreshAccessRequests(); await refreshApprovedResidents(); showToast(status==='approved'?'Vecino aceptado.':'Se ha solicitado más información.'); }
async function removeResidentAccess(id){ if(!supabaseClient||!supabaseSession)return; const resident=approvedResidents.find(item=>item.id===id); if(!resident)return; if(!window.confirm(`¿Quieres dar de baja a ${resident.full_name}?`))return; const {error}=await supabaseClient.from('community_access_requests').update({status:'rejected',review_note:'Acceso retirado por el administrador de la aplicación',reviewed_at:new Date().toISOString(),reviewed_by:supabaseSession.user.id}).eq('id',id); if(error){showToast(`No se pudo dar de baja: ${error.message}`);return;} await refreshApprovedResidents(); showToast('Acceso retirado.'); }
document.querySelector('#inviteNeighborBtn')?.addEventListener('click',()=>{document.querySelector('#inviteResult').hidden=true;document.querySelector('#inviteCreateActions').hidden=false;openModal('inviteModal');});
function getAppBaseUrl(){const path=window.location.pathname.endsWith('/')?window.location.pathname:`${window.location.pathname}/`;return `${window.location.origin}${path}`;}
document.querySelector('#createInviteBtn').onclick=async()=>{if(!supabaseClient||!supabaseSession){showToast('Inicia sesión como administrador de la aplicación para crear enlaces.');return;} const code=`CAVA-${crypto.randomUUID().slice(0,8).toUpperCase()}`; const {error}=await supabaseClient.from('community_invitations').insert({code}); if(error){showToast(`No se pudo crear el enlace: ${error.message}`);return;} const link=`${getAppBaseUrl()}?perfil=vecino&invite=${encodeURIComponent(code)}`; document.querySelector('#inviteLink').value=link; document.querySelector('#inviteWhatsapp').href=`https://wa.me/?text=${encodeURIComponent(`Hola. Para solicitar acceso a la comunidad, completa tus datos aquí: ${link}`)}`; document.querySelector('#inviteResult').hidden=false;document.querySelector('#inviteCreateActions').hidden=true;showToast('Enlace creado.');};
document.querySelector('#copyInviteLink').onclick=async()=>{await navigator.clipboard.writeText(document.querySelector('#inviteLink').value);showToast('Enlace copiado.');};
function setDocumentView(view){ documentView=view; document.querySelectorAll('[data-document-view]').forEach(button=>button.classList.toggle('active',button.dataset.documentView===view)); const admin=currentRole==='admin' && Boolean(supabaseSession) && !supabaseSession.user?.is_anonymous; document.querySelector('#documentForm').hidden=!(admin && view==='manage'); document.querySelector('#documentsIntro').textContent=view==='manage'?'Sube, revisa y elimina documentos de la comunidad.':'Consulta los documentos publicados por el administrador de la aplicación.'; renderDocuments(); }
async function openDocuments(view='consult'){ setDocumentView(view); if(supabaseSession){await refreshRemoteDocuments();} else {documentSource='local';renderDocuments();} openModal('documentsModal'); }
document.querySelector('#openDocumentsBtn').onclick=()=>openDocuments('consult');
document.querySelector('#manageDocumentsBtn').onclick=()=>openDocuments('manage');
document.querySelectorAll('[data-document-view]').forEach(button=>button.onclick=()=>{if(button.dataset.documentView==='manage' && !(currentRole==='admin' && supabaseSession)) return; setDocumentView(button.dataset.documentView);});
document.querySelector('#recoverAdminPasswordBtn').onclick=async()=>{if(!supabaseClient){showToast('No se pudo conectar con el sistema de acceso.');return;}const username=String(document.querySelector('#authForm [name="username"]').value||'').trim().toLowerCase();let email=username.includes('@')?username:null;if(!email){const {data,error}=await supabaseClient.rpc('resolve_admin_username',{p_username:username||'administrador'});if(error||!data){showToast('Escribe el usuario administrador para localizar la cuenta.');return;}email=data;}const redirectTo=`${window.location.origin}${window.location.pathname}`;const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo});if(error){showToast(`No se pudo enviar el enlace: ${error.message||''}`);return;}showToast('Enlace enviado al correo del administrador. Revisa también Spam.');};
document.querySelector('#notificationsBtn').onclick=async()=>{const panel=document.querySelector('#notificationsPanel');if(!panel)return;panel.hidden=!panel.hidden;if(!panel.hidden){lastOpenedNoveltySummary={...topNoveltyState};const groups=getNoveltyIncidentItems();writeSeenIds('comunidad-top-seen-incidents',readSeenIds('comunidad-top-seen-incidents').concat(groups.incidents.map(item=>item.id)));writeSeenIds('comunidad-top-seen-suggestions',readSeenIds('comunidad-top-seen-suggestions').concat(groups.suggestions.map(item=>item.id)));writeSeenIds('comunidad-top-seen-notices',readSeenIds('comunidad-top-seen-notices').concat(notices.map(noticeKey)));writeSeenIds('comunidad-top-seen-documents',readSeenIds('comunidad-top-seen-documents').concat((remoteDocuments||[]).map(item=>item.id)));writeSeenIds('comunidad-top-seen-requests',readSeenIds('comunidad-top-seen-requests').concat(accessRequests.filter(item=>['pending','more_info'].includes(String(item.status||'').toLowerCase())).map(item=>item.id)));const incomingRole=currentRole==='admin'?'neighbor':'admin';const {data:unreadChats}=await supabaseClient.from('community_chat_messages').select('id').eq('sender_role',incomingRole).is('read_at',null);writeSeenIds('comunidad-top-seen-chats',readSeenIds('comunidad-top-seen-chats').concat((unreadChats||[]).map(item=>item.id)));await refreshNoveltyNotifications();}};
document.querySelector('#authBtn').onclick=async()=>{if(supabaseSession){await supabaseClient.auth.signOut();showToast('Sesión cerrada.');}else openModal('authModal');};
document.querySelector('#newUserChoice').onclick=()=>{window.location.href=`${window.location.pathname}?registro=1`;};
document.querySelector('#userChoice').onclick=()=>{window.location.href=`${window.location.pathname}?entrar=1`;};
document.querySelector('#accessGateAction').onclick=()=>window.location.href=`${window.location.pathname}?registro=1`;
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>closeModal(button.dataset.close));
document.querySelectorAll('.modal-backdrop').forEach(backdrop=>backdrop.onclick=e=>{if(e.target===backdrop)closeModal(backdrop.id)});
function navigateToSection(section){
  const chatTarget=section==='chat'?'solicitudes':section;
  document.querySelectorAll('[data-section]').forEach(item=>{
    const active=item.dataset.section===section;
    item.classList.toggle('active',active);
    if(active)item.setAttribute('aria-current','page');
    else item.removeAttribute('aria-current');
  });
  if(section==='chat'){
    if(currentRole==='neighbor'){
      openNeighborCommunityChat();
      return;
    }
    const chatArea=document.getElementById('solicitudes');
    if(chatArea&&!chatArea.hidden){
      const topbar=document.querySelector('.topbar');
      const offset=(topbar?.getBoundingClientRect().height||0)+12;
      const top=Math.max(0,chatArea.getBoundingClientRect().top+window.scrollY-offset);
      window.scrollTo({top,behavior:'smooth'});
    }
    return;
  }
  // Documentos es un acceso a la sección de la página, no una orden para abrir el modal.
  const target=section==='inicio'?document.querySelector('.welcome'):document.getElementById(chatTarget);
  if(!target)return;
  const topbar=document.querySelector('.topbar');
  const offset=(topbar?.getBoundingClientRect().height||0)+12;
  const top=Math.max(0,target.getBoundingClientRect().top+window.scrollY-offset);
  window.scrollTo({top,behavior:'smooth'});
}
function navigateFromHash(){const section=window.location.hash.replace(/^#/,'');if(['inicio','avisos','incidencias','chat','documentos','solicitudes'].includes(section))navigateToSection(section);}
document.querySelectorAll('[data-mark-section]').forEach(button=>button.onclick=()=>markNotificationSectionAsRead(button.dataset.markSection));
document.querySelectorAll('.side-nav [data-section]').forEach(button=>{
  const activate=event=>{
    event.preventDefault();
    event.stopPropagation();
    navigateToSection(button.dataset.section);
  };
  button.addEventListener('click',activate,true);
});
document.querySelectorAll('.mobile-nav a[data-section="chat"]').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();
  navigateToSection('chat');
}));
window.addEventListener('hashchange',navigateFromHash);
document.querySelector('#registerForm').onsubmit=async e=>{e.preventDefault(); const form=e.currentTarget; const data=new FormData(form); if(!supabaseClient){showToast('La aplicación no está conectada.');return;} if(!supabaseSession&&!(await startNeighborSession()))return; const password=String(data.get('password')||'').trim(),username=String(data.get('username')||'').trim().toLowerCase(),invite=String(data.get('invite')||invitationCode||'').trim(),phone=String(data.get('phone')||'').trim(); if(password.length<6){showToast('La contraseña debe tener al menos 6 caracteres.');return;} if(neighborInviteState==='approved'){const {data:ok,error}=await supabaseClient.rpc('login_neighbor_account',{p_username:username,p_password:password});if(error||!ok){showToast(error?.message||'El usuario o la contraseña no coinciden.');return;}neighborApproved=true;updateAuthButton();closeModal('registerModal');form.reset();await refreshNeighborProfile();await refreshRemoteDocuments();await refreshRemoteNotices();applyAccessGate();updateChatAccessButtons();await refreshChatNotifications(false);showToast('Sesión iniciada.');return;} let error; if(invite){({error}=await supabaseClient.rpc('claim_neighbor_access_request',{p_invitation_code:invite,p_full_name:String(data.get('name')||'').trim(),p_floor:String(data.get('floor')||'').trim(),p_username:username,p_password:password}));}else{({error}=await supabaseClient.rpc('register_neighbor_account',{p_username:username,p_full_name:String(data.get('name')||'').trim(),p_phone:phone,p_floor:String(data.get('floor')||'').trim(),p_password:password}));}if(error){showToast(`No se pudo enviar la solicitud: ${error.message}`);return;}neighborRequestSent=true;closeModal('registerModal');form.reset();applyAccessGate();showToast('Solicitud enviada. El administrador revisará tus datos.');};
document.querySelector('#noticeForm').onsubmit=async e=>{e.preventDefault(); const form=e.currentTarget; const data=new FormData(form); if(!supabaseSession||currentRole!=='admin'){showToast('Inicia sesión como administrador para publicar avisos.');return;} const {error}=await supabaseClient.from('community_notices').insert({title:String(data.get('title')).trim(),message:String(data.get('message')).trim(),event_date:data.get('date'),tag:'Nuevo',created_by:supabaseSession.user.id});if(error){showToast(`No se pudo publicar el aviso: ${error.message}`);return;}await refreshRemoteNotices();closeModal('noticeModal');form.reset();showToast('Aviso publicado para toda la comunidad.');};
document.querySelector('#prevMonthBtn').onclick=()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);renderCalendar();};
document.querySelector('#nextMonthBtn').onclick=()=>{calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);renderCalendar();};
document.querySelector('#documentForm').onsubmit=async e=>{e.preventDefault(); const form=e.currentTarget; const data=new FormData(form); const file=data.get('file'); if(!file?.name){showToast('Selecciona primero un archivo.'); return;} if(!supabaseClient || !supabaseSession){showToast('Inicia sesión para subir documentos.'); return;} const submit=form.querySelector('button[type="submit"]'); submit.disabled=true; submit.textContent='Guardando…'; showToast('Guardando documento…'); try{const path=`${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`; const {error:uploadError}=await supabaseClient.storage.from('community-documents').upload(path,file,{upsert:false}); if(uploadError) throw new Error(`No se pudo guardar el archivo: ${uploadError.message}`); const {error:rowError}=await supabaseClient.from('documents').insert({title:file.name,description:String(data.get('description')||'').trim(),category:data.get('type'),storage_path:path}); if(rowError){await supabaseClient.storage.from('community-documents').remove([path]); throw new Error(`No se pudo registrar el documento: ${rowError.message}`);} form.reset(); await refreshRemoteDocuments(); showToast('Documento guardado en Supabase.');}catch(error){showToast(error.message||'No se pudo guardar el documento.');}finally{submit.disabled=false; submit.textContent='Añadir documento';}};
document.querySelector('#authForm').onsubmit=async e=>{e.preventDefault(); if(!supabaseClient){showToast('Supabase no está configurado.');return;} const data=new FormData(e.currentTarget),username=String(data.get('username')||'').trim().toLowerCase(),password=String(data.get('password')||''); if(currentRole==='admin'||username==='administrador'){let adminEmail=username.includes('@')?username:null;if(!adminEmail){const {data:resolvedEmail,error:resolveError}=await supabaseClient.rpc('resolve_admin_username',{p_username:username});if(resolveError||!resolvedEmail){showToast('El usuario de administrador no coincide.');return;}adminEmail=resolvedEmail;}currentRole='admin';if(supabaseSession?.user?.is_anonymous){const {error:signOutError}=await supabaseClient.auth.signOut();if(signOutError){showToast('No se pudo cerrar la sesión anterior. Inténtalo de nuevo.');return;}supabaseSession=null;}const {error}=await supabaseClient.auth.signInWithPassword({email:adminEmail,password});if(error){showToast('El usuario o la contraseña del administrador no coinciden.');return;}document.querySelector('.role-choice[data-role="admin"]')?.click();closeModal('authModal');await refreshAccessRequests();await refreshApprovedResidents();await refreshRemoteDocuments();await refreshRemoteNotices();await loadIncidentEmailSetting();applyAccessGate();await refreshChatNotifications(false);showToast('Sesión iniciada como administrador.');return;} if(!supabaseSession&&!(await startNeighborSession()))return; const {data:ok,error}=await supabaseClient.rpc('login_neighbor_account',{p_username:username,p_password:password});if(error||!ok){showToast(error?.message||'El usuario o la contraseña no coinciden, o la cuenta aún no está aprobada.');return;}neighborApproved=true;currentRole='neighbor';updateAuthButton();closeModal('authModal');await refreshNeighborProfile();await refreshRemoteDocuments();await refreshRemoteNotices();applyAccessGate();await refreshChatNotifications(false);showToast('Sesión iniciada.');};
document.querySelector('#authForm').addEventListener('submit',()=>setTimeout(()=>{if(currentRole==='neighbor'&&neighborApproved)refreshNeighborProfile();},1200));
document.querySelector('#backToAccessBtn').onclick=()=>{window.location.href=`${window.location.pathname}?entrar=1`;};
document.querySelector('[data-auth-signup]').onclick=()=>{if(neighborLoginRequested){window.location.href=`${window.location.pathname}?registro=1`;return;}showNeighborRegistrationForm();};
async function prepareIncidentPhoto(file){
  if(!file.type.startsWith('image/'))throw new Error('Solo se pueden adjuntar imágenes.');
  if(file.size<=2500000)return file;
  try{
    const bitmap=await createImageBitmap(file);
    const maxSide=1600;
    const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    bitmap.close?.();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));
    if(!blob)return file;
    const baseName=file.name.replace(/\.[^.]+$/,'')||'foto';
    return new File([blob],`${baseName}.jpg`,{type:'image/jpeg',lastModified:file.lastModified});
  }catch{return file;}
}
async function uploadIncidentPhotos(incidentId,files){
  if(!files.length)return[];
  const uploaded=[];
  for(const originalFile of files){
    const file=await prepareIncidentPhoto(originalFile);
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${supabaseSession.user.id}/${incidentId}/${crypto.randomUUID()}-${safeName}`;
    const {error}=await supabaseClient.storage.from('incident-photos').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'});
    if(error)throw new Error(`No se pudo subir la foto «${originalFile.name}»: ${error.message}`);
    uploaded.push({path,name:originalFile.name,type:file.type,size:file.size});
  }
  const {error}=await supabaseClient.rpc('save_incident_attachments',{p_incident_id:incidentId,p_attachments:uploaded});
  if(error)throw new Error(`No se pudieron guardar las fotos: ${error.message}`);
  return uploaded;
}
const incidentPhotoInput=document.querySelector('#incidentPhotoInput'),incidentPhotoList=document.querySelector('#incidentPhotoList'),incidentPhotoAdd=document.querySelector('#incidentPhotoAdd');function renderIncidentPhotoList(){if(!incidentPhotoList)return;incidentPhotoList.innerHTML=incidentPhotoFiles.length?incidentPhotoFiles.map(file=>`<span>${file.name}</span>`).join(''):'<span class="photo-empty">No has seleccionado fotos.</span>';}incidentPhotoInput?.addEventListener('change',()=>{const selected=Array.from(incidentPhotoInput.files||[]);for(const file of selected){if(!incidentPhotoFiles.some(existing=>existing.name===file.name&&existing.size===file.size&&existing.lastModified===file.lastModified))incidentPhotoFiles.push(file);}incidentPhotoInput.value='';renderIncidentPhotoList();});incidentPhotoAdd?.addEventListener('click',()=>incidentPhotoInput?.click());renderIncidentPhotoList();document.querySelector('#incidentForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,data=new FormData(form),type=String(data.get('type')||'Incidencia').trim(),title=String(data.get('title')||'').trim(),message=String(data.get('message')||'').trim(),location=String(data.get('location')||'').trim(),photos=incidentPhotoFiles.slice();if(!supabaseClient||!supabaseSession){showToast('Necesitas iniciar sesión para comunicar una incidencia.');return;}const submit=form.querySelector('[type=submit]');submit.disabled=true;try{const {data:incidentId,error}=await supabaseClient.rpc('notify_new_incident',{p_title:title,p_message:message,p_location:location||null,p_type:type});if(error)throw new Error(error.message||'No se pudo guardar la comunicación.');if(photos.length)await uploadIncidentPhotos(incidentId,photos);closeModal('incidentModal');form.reset();incidentPhotoFiles=[];renderIncidentPhotoList();showToast(type.toLowerCase()==='incidencia'?'La incidencia ha sido enviada al administrador.':'La comunicación ha sido enviada al administrador.');await refreshRemoteIncidents();if(type.toLowerCase()==='incidencia'){try{const result=await sendIncidentEmail({id:incidentId});if(result.sent)showToast('Incidencia enviada también por correo al administrador.');else if(result.skipped)showToast('Incidencia guardada y pendiente de revisión.');else showToast('Incidencia registrada.');}catch(error){await refreshRemoteIncidents();showToast(`Incidencia guardada, pero quedó pendiente de envío de correo: ${error.message||''}`);}}else showToast(currentRole==='admin'?'La comunicación ha sido enviada y guardada.':'Comunicación enviada al administrador y pendiente de revisión.');}catch(error){showToast(error.message||'No se pudo guardar la comunicación.');}finally{submit.disabled=false;}};
document.querySelectorAll('.role-choice').forEach(button=>button.onclick=()=>{ if(button.dataset.role==='admin'&&(!supabaseSession||supabaseSession.user?.is_anonymous)){showToast('El modo administrador solo está disponible para la cuenta administradora.');updateRoleSwitcher();return;} currentRole=button.dataset.role; document.querySelectorAll('.role-choice').forEach(item=>item.classList.toggle('active',item===button)); const admin=currentRole==='admin'; document.querySelector('#roleName').textContent=admin?'Administrador de la aplicación':'Vecino'; document.querySelector('#roleDescription').textContent=admin?'Gestionas la información que se publica para toda la comunidad.':'Puedes consultar la información y comunicar incidencias visibles para toda la comunidad.'; document.querySelector('#topRole').textContent=admin?'Administrador de la aplicación':'Vecino'; document.querySelector('.avatar').textContent=admin?'ES':'V'; document.querySelector('#newNoticeBtn').hidden=!admin; document.querySelector('#noticePermission').textContent=admin?'Solo el administrador de la aplicación puede publicar avisos visibles para toda la comunidad.':'Aquí puedes consultar los avisos publicados por el administrador de la aplicación.'; document.querySelector('#incidentHeading').textContent='Incidencias y sugerencias'; document.querySelector('#incidentPermission').textContent=admin?'Gestiona las incidencias que te comunican los vecinos.':'Las comunicaciones solo aparecen a los vecinos cuando el administrador las tramita.'; document.querySelector('#newIncidentBtn').textContent=admin?'＋ Registrar incidencia':'＋ Enviar al administrador'; document.querySelector('#incidentTitle').textContent=admin?'Registrar incidencia':'Enviar al administrador'; document.querySelector('#incidentIntro').textContent=admin?'Registra una incidencia para hacer seguimiento.':'La comunicación queda pendiente de revisión. Los vecinos la verán cuando el administrador la tramite.'; document.querySelector('#incidentSubmit').textContent=admin?'Guardar incidencia':'Enviar al administrador'; document.querySelector('#solicitudes').hidden=!admin; document.querySelector('#profileLabel').textContent=admin?'ADMINISTRADOR DE LA APLICACIÓN':'VECINO'; document.querySelector('#profileName').textContent=admin?'Eduardo Santamaría':'Nombre del vecino'; document.querySelector('#profileAddress').textContent=admin?'Portal 1 · 1.º F':'Portal y piso'; document.querySelector('#profileStatus').textContent=admin?'Cuenta administradora':'Cuenta pendiente de verificación';updateChatAccessButtons(); });
const requestedProfile = new URLSearchParams(window.location.search).get('perfil');
if(requestedProfile === 'vecino' || requestedProfile === 'neighbor' || publicRegistrationRequested || neighborLoginRequested){
  currentRole='neighbor';
  document.querySelectorAll('.role-choice').forEach(item=>item.classList.toggle('active',item.dataset.role==='neighbor'));
  document.querySelector('#roleName').textContent='Vecino';
  document.querySelector('#roleDescription').textContent='Puedes consultar la información y comunicar incidencias visibles para toda la comunidad.';
  document.querySelector('#topRole').textContent='Vecino';
  document.querySelector('.avatar').textContent='V';
  document.querySelector('#newNoticeBtn').hidden=true;
  document.querySelector('#noticePermission').textContent='Aquí puedes consultar los avisos publicados por el administrador de la aplicación.';
  document.querySelector('#incidentHeading').textContent='Incidencias y sugerencias';
  document.querySelector('#incidentPermission').textContent='Las comunicaciones solo aparecen a los vecinos cuando el administrador las tramita.';
  document.querySelector('#newIncidentBtn').textContent='＋ Enviar incidencia o sugerencia';
  document.querySelector('#incidentTitle').textContent='Enviar al administrador';
  document.querySelector('#incidentIntro').textContent='La comunicación queda pendiente de revisión. Los vecinos la verán cuando el administrador la tramite.';
  document.querySelector('#incidentSubmit').textContent='Enviar al administrador';
  document.querySelector('#solicitudes').hidden=true;
  document.querySelector('#profileLabel').textContent='VECINO';
  document.querySelector('#profileName').textContent='Nombre del vecino';
  document.querySelector('#profileAddress').textContent='Piso pendiente de confirmar';
  document.querySelector('#profileStatus').textContent='Cuenta pendiente de verificación';
}
function updateRoleSwitcher(){const switcher=document.querySelector('.role-switcher');const canSwitch=Boolean(supabaseSession)&&!supabaseSession.user?.is_anonymous;if(switcher){switcher.hidden=!canSwitch;switcher.style.display=canSwitch?'flex':'none';}document.querySelectorAll('.role-choice[data-role="admin"]').forEach(button=>{button.hidden=!canSwitch;button.style.display=canSwitch?'':'none';});}
function syncDocumentPermissions(){
  const admin=currentRole==='admin' && Boolean(supabaseSession) && !supabaseSession.user?.is_anonymous;
  document.querySelector('#manageDocumentsBtn').hidden=!admin;
  document.querySelector('#manageDocumentsTab').hidden=!admin;
  if(!admin && documentView==='manage') documentView='consult';
  setDocumentView(documentView);
  document.querySelector('#incidentHistoryBtn').hidden=!admin;const installButton=document.querySelector('#installAppBtn'),shareButton=document.querySelector('#shareAppBtn');if(installButton)installButton.hidden=!admin;if(shareButton)shareButton.hidden=!admin;const requestsNav=document.querySelector('#adminRequestsNav'),mobileRequestsNav=document.querySelector('#mobileRequestsNav');if(requestsNav)requestsNav.hidden=!admin;if(mobileRequestsNav)mobileRequestsNav.hidden=!admin;updateRoleSwitcher();const passwordButton=document.querySelector('#changeAdminPasswordBtn');if(passwordButton)passwordButton.hidden=!admin;const setting=document.querySelector('#incidentEmailSetting');if(setting)setting.hidden=!admin;updateChatAccessButtons(); if(admin&&supabaseSession&&!supabaseSession.user?.is_anonymous)loadIncidentEmailSetting();
}
document.querySelectorAll('.role-choice').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.role==='admin'&&(!supabaseSession||supabaseSession.user?.is_anonymous)){currentRole='neighbor';updateRoleSwitcher();showToast('El modo administrador solo está disponible para la cuenta administradora.');return;}showIncidentHistory=false;syncDocumentPermissions();renderIncidents();}));
syncDocumentPermissions();
if(invitationCode){
  currentRole='neighbor';
  document.querySelectorAll('.role-choice').forEach(item=>item.classList.remove('active'));
  document.querySelector('.role-choice[data-role="neighbor"]')?.classList.add('active');
  document.querySelector('#roleName').textContent='Vecino';
  document.querySelector('#roleDescription').textContent='Puedes consultar la información y comunicar incidencias visibles para toda la comunidad.';
  document.querySelector('#topRole').textContent='Vecino';
  document.querySelector('.avatar').textContent='V';
  document.querySelector('#newNoticeBtn').hidden=true;
  document.querySelector('#noticePermission').textContent='Aquí puedes consultar los avisos publicados por el administrador de la aplicación.';
  document.querySelector('#incidentHeading').textContent='Incidencias y sugerencias';
  document.querySelector('#incidentPermission').textContent='Las comunicaciones solo aparecen a los vecinos cuando el administrador las tramita.';
  document.querySelector('#newIncidentBtn').textContent='＋ Enviar incidencia o sugerencia';
  document.querySelector('#incidentTitle').textContent='Enviar al administrador';
  document.querySelector('#incidentIntro').textContent='La comunicación queda pendiente de revisión. Los vecinos la verán cuando el administrador la tramite.';
  document.querySelector('#incidentSubmit').textContent='Enviar al administrador';
  document.querySelector('#solicitudes').hidden=true;
  document.querySelector('#profileLabel').textContent='VECINO';
  document.querySelector('#profileName').textContent='Nuevo vecino';
  document.querySelector('#profileAddress').textContent='Pendiente de confirmar';
  document.querySelector('#profileStatus').textContent='Solicitud pendiente';
  const inviteInput=document.querySelector('#registerForm input[name="invite"]');
  inviteInput.value=invitationCode;
  inviteInput.readOnly=true;
}
function removePortalReferences(){
  document.querySelector('#profileAddress').textContent=currentRole==='admin'?'1.º F':'Piso pendiente de confirmar';
  const nextCard=document.querySelector('.next-card p');
  if(nextCard) nextCard.textContent='Mañana · 09:00 · Zonas comunes';
  document.querySelector('#registerModal .modal-intro').textContent='Rellena tus datos. El administrador de la aplicación revisará la solicitud antes de activar tu cuenta.';
  const floorLabel=document.querySelector('#registerForm input[name="floor"]')?.closest('label');
  if(floorLabel){ floorLabel.firstChild.textContent='Piso'; floorLabel.querySelector('input').placeholder='1.º F'; }
  const incidentLocation=document.querySelector('#incidentForm input[name="location"]')?.closest('label');
  if(incidentLocation){ incidentLocation.firstChild.textContent='Zona'; incidentLocation.querySelector('input').placeholder='Por ejemplo: garaje, azotea'; }
  const incidentTitle=document.querySelector('#incidentForm input[name="title"]');
  if(incidentTitle)incidentTitle.placeholder='Por ejemplo: luz fundida en las zonas comunes';
}
renderCurrentDate(); renderNotices(); renderCalendar(); renderIncidents(); removePortalReferences(); syncDocumentPermissions(); updatePushButton(); initSupabase().then(()=>{updatePushButton();refreshChatNotifications(false);setInterval(()=>{refreshChatNotifications(true);refreshNoveltyNotifications();},12000);});


// Instalación y compartir la aplicación.
let deferredInstallPrompt=null;
const installAppBtn=document.querySelector('#installAppBtn');
const shareAppBtn=document.querySelector('#shareAppBtn');
const installModal=document.querySelector('#installModal');
const shareAppLink=document.querySelector('#shareAppLink');
const installQr=document.querySelector('#installQr');
const installTitle=document.querySelector('#installTitle');
const installInstructions=document.querySelector('#installInstructions');
const installQrWrap=document.querySelector('.install-qr-wrap');
const shareLinkField=document.querySelector('#shareLinkField');
const copyShareLinkBtn=document.querySelector('#copyShareLinkBtn');
const appShareUrl=window.location.origin+window.location.pathname;
function drawInstallQr(){
  if(shareAppLink) shareAppLink.value=appShareUrl;
  if(installQr&&window.QRCode) QRCode.toCanvas(installQr,appShareUrl,{width:220,margin:2,color:{dark:'#17343a',light:'#ffffff'}},()=>{});
}
function openInstallModal(){
  drawInstallQr();
  if(installTitle)installTitle.textContent='Instalar Cuartel de la Cava';
  const userAgent=navigator.userAgent||'';
  const isIos=/iPhone|iPad|iPod/i.test(userAgent);
  const isAndroid=/Android/i.test(userAgent);
  if(installInstructions){
    installInstructions.innerHTML=isIos
      ? '<strong>En iPhone o iPad</strong><br>1. Abre este enlace en Safari.<br>2. Pulsa Compartir.<br>3. Elige “Añadir a pantalla de inicio”.<br><br>No necesitas descargar nada ni usar la App Store.'
      : isAndroid
        ? '<strong>En Android</strong><br>1. Abre este enlace en Chrome.<br>2. Pulsa “Instalar app” o el menú ⋮ → “Instalar app”.<br>3. Confirma la instalación.<br><br>La aplicación se añade a la pantalla de inicio sin pasar por Google Play.'
        : '<strong>En ordenador</strong><br>Usa el icono de instalación de la barra de direcciones o el menú del navegador → “Instalar Cuartel de la Cava”.<br><br>Es una aplicación web instalable; no requiere descargar un ejecutable.';
  }
  if(installQrWrap)installQrWrap.hidden=true;
  if(shareLinkField)shareLinkField.hidden=true;
  if(copyShareLinkBtn)copyShareLinkBtn.hidden=true;
  if(installModal)installModal.hidden=false;
}
function openShareModal(){
  drawInstallQr();
  if(installTitle)installTitle.textContent='Compartir enlace';
  if(installInstructions)installInstructions.textContent='Comparte este enlace con los vecinos para que puedan entrar en la comunidad.';
  if(installQrWrap)installQrWrap.hidden=true;
  if(shareLinkField)shareLinkField.hidden=false;
  if(copyShareLinkBtn){copyShareLinkBtn.hidden=false;copyShareLinkBtn.textContent='Copiar enlace';}
  if(installModal)installModal.hidden=false;
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;if(installAppBtn)installAppBtn.hidden=false;});
installAppBtn?.addEventListener('click',async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;installAppBtn.hidden=true;}else openInstallModal();});
shareAppBtn?.addEventListener('click',async()=>{if(navigator.share){try{await navigator.share({title:'Comunidad Cuartel de la Cava',url:appShareUrl});return;}catch(error){if(error?.name==='AbortError')return;}}openShareModal();});
document.querySelector('#copyShareLinkBtn')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(appShareUrl);showToast('Enlace copiado.');}catch(e){shareAppLink?.select();document.execCommand('copy');showToast('Enlace copiado.');}});
document.querySelectorAll('[data-close="installModal"]').forEach(button=>button.addEventListener('click',()=>{if(installModal)installModal.hidden=true;}));

/* Flujo confirmado de incidencias: se redefine aquí para mantener intactas las demás funciones. */
function renderIncidents(){
  const allItems=remoteIncidents.length?remoteIncidents:incidents,terminal=['resolved','cancelled'];
  const active=allItems.filter(i=>!terminal.includes(String(i.status||'pending').toLowerCase()));
  const visible=currentRole==='admin'?(showIncidentHistory?allItems.filter(i=>terminal.includes(String(i.status||'').toLowerCase())):active):allItems.filter(i=>!terminal.includes(String(i.status||'pending').toLowerCase()));
  const incidentItems=visible.filter(i=>String(i.type||'Incidencia').toLowerCase()!=='sugerencia');
  const suggestionItems=visible.filter(i=>String(i.type||'').toLowerCase()==='sugerencia');
  renderIncidentList(incidentList,incidentItems,showIncidentHistory?'No hay incidencias cerradas en el histórico.':currentRole==='admin'?'Todavía no hay incidencias pendientes.':'Todavía no has enviado incidencias.');
  renderIncidentList(suggestionList,suggestionItems,showIncidentHistory?'No hay sugerencias cerradas en el histórico.':currentRole==='admin'?'Todavía no hay sugerencias pendientes.':'Todavía no has enviado sugerencias.');
  const heading=document.querySelector('#incidentHeading'),note=document.querySelector('#incidentPermission'),toggle=document.querySelector('#incidentHistoryBtn');
  if(heading)heading.textContent=showIncidentHistory?'Histórico de incidencias y sugerencias':currentRole==='admin'?'Incidencias y sugerencias':'Mis solicitudes';
  if(note)note.textContent=currentRole==='admin'?(showIncidentHistory?'Actuaciones cerradas o eliminadas.':'Pendientes de tramitar o en seguimiento.'):'Aquí puedes comprobar que tus incidencias y sugerencias han llegado al administrador y consultar su estado.';
  if(toggle)toggle.textContent=showIncidentHistory?'← Volver a incidencias':'Ver histórico';
  const summary=document.querySelector('#incidentResultsSummary');if(summary)summary.textContent=currentRole==='admin'&&incidentItems.length?'Mostrando '+incidentItems.length+' incidencia'+(incidentItems.length===1?'':'s'):'';
  const more=document.querySelector('#incidentLoadMoreBtn');if(more){more.hidden=remoteIncidents.length>=incidentTotal||!incidentTotal;more.onclick=loadMoreIncidents;}
}
function decorateIncidentStatusBadges(){
  document.querySelectorAll('.incident-status').forEach(badge=>{
    if(badge.querySelector('.status-symbol'))return;
    const text=badge.textContent.trim(),key=text.includes('En tramitación')?'reviewed':text.includes('Tramitada')||text.includes('Solucionada')?'resolved':text.includes('Eliminada')?'cancelled':text.includes('Enviando')?'sending':'pending';
    badge.classList.add('status-'+key);badge.innerHTML=`<span class="status-symbol" aria-hidden="true">${key==='resolved'?'✓✓':key==='reviewed'?'◐':key==='cancelled'?'×':key==='sending'?'↻':'✓'}</span> ${escapeHtml(text)}`;badge.setAttribute('aria-label','Estado: '+text);
  });
  document.querySelectorAll('.incident-card[data-incident-key]').forEach(card=>{
    if(card.querySelector('.incident-updated-at'))return;
    const item=remoteIncidents.find(entry=>String(entry.id)===String(card.dataset.incidentKey));
    if(!item?.updated_at||item.updated_at===item.created_at)return;
    const copy=card.querySelector(':scope > div');if(!copy)return;
    const line=document.createElement('small');line.className='incident-updated-at';line.textContent='Último cambio: '+incidentDate(item.updated_at);copy.append(line);
  });
}
if(typeof MutationObserver!=='undefined')new MutationObserver(decorateIncidentStatusBadges).observe(document.body,{childList:true,subtree:true});

const confirmedIncidentForm=document.querySelector('#incidentForm');
if(confirmedIncidentForm)confirmedIncidentForm.onsubmit=async event=>{
  event.preventDefault();
  if(confirmedIncidentForm.dataset.submitting==='1')return;
  const data=new FormData(confirmedIncidentForm),type=String(data.get('type')||'Incidencia').trim(),title=String(data.get('title')||'').trim(),message=String(data.get('message')||'').trim(),location=String(data.get('location')||'').trim(),photos=incidentPhotoFiles.slice();
  if(!supabaseClient||!supabaseSession){showToast('Necesitas iniciar sesión para comunicar una incidencia.');return;}
  const submit=confirmedIncidentForm.querySelector('[type=submit]');confirmedIncidentForm.dataset.submitting='1';if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');submit.textContent='Enviando…';}
  try{
    await refreshRemoteIncidents();
    const recentMatch=remoteIncidents.find(item=>String(item.type||'').toLowerCase()===type.toLowerCase()&&String(item.title||'').trim()===title&&String(item.message||item.text||'').trim()===message&&String(item.location||'').trim()===location&&item.created_at&&Date.now()-new Date(item.created_at).getTime()<15*60*1000);
    let incidentId=recentMatch?.id,confirmed=recentMatch;
    if(!incidentId){
      const result=await supabaseClient.rpc('notify_new_incident',{p_title:title,p_message:message,p_location:location||null,p_type:type});
      if(result.error)throw new Error(result.error.message||'No se pudo guardar la comunicación.');
      incidentId=result.data;confirmed={id:incidentId,type,title,message,location,status:'pending',created_at:new Date().toISOString()};
      if(photos.length)await uploadIncidentPhotos(incidentId,photos);
      await refreshRemoteIncidents();
      confirmed=remoteIncidents.find(item=>String(item.id)===String(incidentId))||confirmed;
    }else if(photos.length&&getIncidentAttachments(recentMatch).length<photos.length){
      await uploadIncidentPhotos(incidentId,photos);
      await refreshRemoteIncidents();
      confirmed=remoteIncidents.find(item=>String(item.id)===String(incidentId))||confirmed;
    }
    showIncidentSubmissionStatus(confirmed);
    showIncidentConfirmation(type);
    closeModal('incidentModal');
    confirmedIncidentForm.reset();incidentPhotoFiles=[];renderIncidentPhotoList();
    if(type.toLowerCase()==='incidencia'&&!confirmed.sent_at&&confirmed.email_status!=='sent'){
      try{await sendIncidentEmail({id:incidentId});}catch(error){showToast('La incidencia ha sido recibida. El correo queda pendiente de envío.');}
    }
    await refreshRemoteIncidents();
  }catch(error){
    showIncidentSubmissionStatus({type},error.message||'No se pudo enviar la comunicación. Conservamos lo escrito para que puedas reintentarlo.');
  }finally{
    confirmedIncidentForm.dataset.submitting='0';if(submit){submit.disabled=false;submit.removeAttribute('aria-busy');submit.textContent=currentRole==='admin'?'Guardar incidencia':'Enviar al administrador';}
  }
};
document.querySelectorAll('.role-choice').forEach(button=>button.addEventListener('click',()=>setTimeout(renderIncidents,0)));
