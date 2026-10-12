const notices = [];
const incidents = [];
const noticeList = document.querySelector('#noticeList'), incidentList = document.querySelector('#incidentList'), toast = document.querySelector('#toast');
let currentRole = 'admin';
const storedDocuments = JSON.parse(localStorage.getItem('comunidad-documents') || '[]');
const supabaseClient = window.supabase && window.SUPABASE_CONFIG ? window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.publishableKey) : null;
let supabaseSession = null;
let remoteDocuments = [];
let documentSource = 'local';
let documentView = 'consult';
let accessRequests = [];
let approvedResidents = [];
const invitationCode = new URLSearchParams(window.location.search).get('invite');
let neighborApproved = false;
const accessGate = document.querySelector('#accessGate');
function renderCurrentDate(){
  const today = new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
  document.querySelector('#currentDate').textContent = today.toUpperCase();
}
function renderNotices(){ noticeList.innerHTML = notices.length ? notices.map(n => `<article class="notice-card"><div class="notice-date"><b>${n.date}</b>${n.month}</div><div class="notice-copy"><h3>${n.title}</h3><p>${n.message}</p></div><span class="notice-tag">${n.tag}</span></article>`).join('') : '<p class="documents-empty">Todavía no hay avisos publicados.</p>'; }
function renderIncidents(){ incidentList.innerHTML = incidents.length ? incidents.map(i => `<article class="incident-card"><span class="incident-icon">${i.icon}</span><div><h3>${i.title}</h3><p>${i.text}</p></div><span class="incident-status">${i.status}</span></article>`).join('') : '<p class="documents-empty">Todavía no hay incidencias registradas.</p>'; }
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[char]));}
function renderDocuments(){
  const list=document.querySelector('#documentList'); if(!list) return;
  const docs=documentSource==='remote' ? remoteDocuments : storedDocuments;
  list.innerHTML=docs.length ? docs.map((doc,index)=>{
    const title=escapeHtml(doc.title||doc.name||'Documento');
    const category=escapeHtml(doc.category||doc.type||'Documento');
    const description=escapeHtml(doc.description||'');
    const manage=documentSource==='remote' && currentRole==='admin' && documentView==='manage';
    const actions=documentSource==='remote' ? `<button type="button" class="document-open" data-document-path="${escapeHtml(doc.storage_path)}" aria-label="Abrir ${title}">↗</button>${manage?`<button type="button" class="document-remove" data-remote-path="${escapeHtml(doc.storage_path)}" data-remote-id="${escapeHtml(doc.id)}" aria-label="Quitar ${title}">×</button>`:''}` : `<button type="button" class="document-remove" data-document-index="${index}" aria-label="Quitar ${title}">×</button>`;
    const descriptionView=manage ? `<div class="document-description-edit"><input type="text" value="${description}" placeholder="Aclara para qué sirve este documento" data-description-input="${escapeHtml(doc.id)}"><button type="button" class="document-save-description" data-description-id="${escapeHtml(doc.id)}">Guardar</button></div>` : (description?`<small class="document-description">${description}</small>`:'');
    return `<div class="document-row"><span class="document-icon">▤</span><div><strong>${title}</strong><small>${category} · Documento compartido</small>${descriptionView}</div>${actions}</div>`;
  }).join('') : '<p class="documents-empty">Todavía no hay documentos añadidos.</p>';
  list.querySelectorAll('[data-document-index]').forEach(button=>button.onclick=()=>{storedDocuments.splice(Number(button.dataset.documentIndex),1);localStorage.setItem('comunidad-documents',JSON.stringify(storedDocuments));renderDocuments();showToast('Documento quitado.');});
  list.querySelectorAll('[data-document-path]').forEach(button=>button.onclick=()=>openRemoteDocument(button.dataset.documentPath));
  list.querySelectorAll('[data-remote-path]').forEach(button=>button.onclick=()=>deleteRemoteDocument(button.dataset.remotePath,button.dataset.remoteId));
  list.querySelectorAll('[data-description-id]').forEach(button=>button.onclick=()=>saveDocumentDescription(button.dataset.descriptionId));
}
async function saveDocumentDescription(id){ const input=document.querySelector(`[data-description-input="${CSS.escape(id)}"]`); if(!input||!supabaseClient||!supabaseSession) return; const description=input.value.trim(); const {error}=await supabaseClient.from('documents').update({description}).eq('id',id); if(error){showToast(`No se pudo guardar la descripción: ${error.message}`);return;} const doc=remoteDocuments.find(item=>item.id===id); if(doc) doc.description=description; renderDocuments(); showToast('Descripción guardada.'); }
async function deleteRemoteDocument(path,id){ if(!supabaseClient || !supabaseSession || currentRole!=='admin') return; const name=remoteDocuments.find(doc=>doc.id===id)?.title||'este documento'; if(!window.confirm(`¿Quieres quitar «${name}» de la comunidad?`)) return; const {error:storageError}=await supabaseClient.storage.from('community-documents').remove([path]); if(storageError){showToast(`No se pudo quitar el archivo: ${storageError.message}`); return;} const {error:rowError}=await supabaseClient.from('documents').delete().eq('id',id); if(rowError){showToast(`No se pudo quitar el registro: ${rowError.message}`); return;} await refreshRemoteDocuments(); showToast('Documento quitado.'); }
async function refreshRemoteDocuments(){ if(!supabaseClient || !supabaseSession) return false; const {data,error}=await supabaseClient.from('documents').select('*').order('created_at',{ascending:false}); if(error){showToast(`No se pudieron consultar los documentos: ${error.message}`); return false;} remoteDocuments=data||[]; documentSource='remote'; renderDocuments(); return true; }
async function openRemoteDocument(path){ const {data,error}=await supabaseClient.storage.from('community-documents').createSignedUrl(path,600); if(error){showToast('No se pudo abrir el documento.'); return;} window.open(data.signedUrl,'_blank','noopener'); }
function updateAuthButton(){ const button=document.querySelector('#authBtn'); if(button) button.textContent=supabaseSession ? 'Salir' : 'Entrar'; }
async function initSupabase(){ if(!supabaseClient){applyAccessGate();return;} const {data}=await supabaseClient.auth.getSession(); supabaseSession=data.session; updateAuthButton(); if(supabaseSession){await refreshAccessRequests();await refreshApprovedResidents();} if(invitationCode) await checkNeighborAccess(); applyAccessGate(); supabaseClient.auth.onAuthStateChange(async(_event,session)=>{supabaseSession=session; updateAuthButton(); syncDocumentPermissions(); if(session){await refreshAccessRequests();await refreshApprovedResidents();} applyAccessGate();}); }
function openModal(id){ document.querySelector('#'+id).hidden=false; }
function closeModal(id){ document.querySelector('#'+id).hidden=true; }
function showToast(message){ toast.textContent=message; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),2600); }
document.querySelector('#newNoticeBtn').onclick=()=>openModal('noticeModal');
document.querySelector('#newIncidentBtn').onclick=()=>openModal('incidentModal');
document.querySelector('#newIncidentBtn').hidden=true;
document.querySelector('#quickIncidentBtn').onclick=()=>openModal('incidentModal');
document.querySelector('#profileBtn').onclick=()=> currentRole==='admin' ? showToast('Perfil de Eduardo Santamaría · presidente y administrador.') : openModal('registerModal');
document.querySelector('#viewAllBtn').onclick=()=>showToast('Aquí aparecerá el historial completo de avisos.');
function applyAccessGate(){ const admin=Boolean(supabaseSession) && currentRole==='admin'; const locked=!admin && !neighborApproved; document.body.classList.toggle('access-locked',locked); if(accessGate){accessGate.hidden=!locked; const title=document.querySelector('#accessGateTitle'),message=document.querySelector('#accessGateMessage'),action=document.querySelector('#accessGateAction'); if(invitationCode){title.textContent='Acceso pendiente de autorización';message.textContent='Tu solicitud está pendiente. La presidencia debe aprobarla antes de que puedas consultar la comunidad.';action.hidden=true;}else{title.textContent='Acceso privado';message.textContent='Necesitas un enlace de invitación de la presidencia para solicitar acceso a la comunidad.';action.hidden=true;}} }
async function checkNeighborAccess(){ if(!invitationCode||!supabaseClient)return false; const {data,error}=await supabaseClient.rpc('check_invitation_access',{p_invitation_code:invitationCode}); if(error){neighborApproved=false;return false;} neighborApproved=Boolean(data); return neighborApproved; }
async function refreshAccessRequests(){ if(!supabaseClient||!supabaseSession||currentRole!=='admin') return; const {data,error}=await supabaseClient.from('community_access_requests').select('*').in('status',['pending','more_info']).order('created_at',{ascending:false}); if(error){showToast(`No se pudieron consultar las solicitudes: ${error.message}`);return;} accessRequests=data||[]; renderAccessRequests(); }
async function refreshApprovedResidents(){ if(!supabaseClient||!supabaseSession||currentRole!=='admin') return; const {data,error}=await supabaseClient.from('community_access_requests').select('*').eq('status','approved').order('created_at',{ascending:false}); if(error){showToast(`No se pudieron consultar los vecinos autorizados: ${error.message}`);return;} approvedResidents=data||[]; renderApprovedResidents(); }
function renderAccessRequests(){ const list=document.querySelector('#approvalList'); if(!list)return; const count=document.querySelector('#requestCount'); if(count) count.textContent=`${accessRequests.length} pendiente${accessRequests.length===1?'':'s'}`; if(!accessRequests.length){list.innerHTML='<p class="documents-empty">No hay solicitudes pendientes.</p>';return;} list.innerHTML=accessRequests.map(request=>`<article class="approval-card" data-request-id="${escapeHtml(request.id)}"><div class="approval-avatar">${escapeHtml((request.full_name||'V').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase())}</div><div><strong>${escapeHtml(request.full_name)}</strong><p>${escapeHtml(request.floor)} · ${escapeHtml(request.phone)}</p><small class="request-notes">${request.notes?`Notas: ${escapeHtml(request.notes)}`:'Sin notas adicionales'}${request.status==='more_info'?' · Falta información':''}</small></div><div class="approval-actions"><button class="approve-btn" data-request-action="approved">Aceptar</button><button class="secondary-btn request-info-btn" data-request-action="more_info">Pedir datos</button><button class="reject-btn" data-request-action="rejected">Rechazar</button></div></article>`).join(''); list.querySelectorAll('[data-request-action]').forEach(button=>button.onclick=()=>reviewAccessRequest(button.closest('[data-request-id]').dataset.requestId,button.dataset.requestAction)); }
function renderApprovedResidents(){ const list=document.querySelector('#approvedList'); if(!list)return; const count=document.querySelector('#approvedCount'); if(count) count.textContent=approvedResidents.length; if(!approvedResidents.length){list.innerHTML='<p class="documents-empty">Todavía no hay vecinos autorizados.</p>';return;} list.innerHTML=approvedResidents.map(request=>`<article class="approval-card approved-card" data-approved-id="${escapeHtml(request.id)}"><div class="approval-avatar">${escapeHtml((request.full_name||'V').split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase())}</div><div><strong>${escapeHtml(request.full_name)}</strong><p>${escapeHtml(request.floor)} · ${escapeHtml(request.phone)}</p></div><div class="approval-actions"><button class="reject-btn" data-remove-access="${escapeHtml(request.id)}">Dar de baja</button></div></article>`).join(''); list.querySelectorAll('[data-remove-access]').forEach(button=>button.onclick=()=>removeResidentAccess(button.dataset.removeAccess)); }
async function reviewAccessRequest(id,status){ if(!supabaseClient||!supabaseSession)return; let reviewNote=null; if(status==='more_info'){reviewNote=window.prompt('Escribe qué información debe completar el vecino:','Indica el portal, el piso o cualquier dato que falte.'); if(reviewNote===null)return;} const {error}=await supabaseClient.from('community_access_requests').update({status,review_note:reviewNote,reviewed_at:new Date().toISOString(),reviewed_by:supabaseSession.user.id}).eq('id',id); if(error){showToast(`No se pudo actualizar la solicitud: ${error.message}`);return;} await refreshAccessRequests(); await refreshApprovedResidents(); showToast(status==='approved'?'Vecino aceptado.':'Se ha solicitado más información.'); }
async function removeResidentAccess(id){ if(!supabaseClient||!supabaseSession)return; const resident=approvedResidents.find(item=>item.id===id); if(!resident)return; if(!window.confirm(`¿Quieres dar de baja a ${resident.full_name}?`))return; const {error}=await supabaseClient.from('community_access_requests').update({status:'rejected',review_note:'Acceso retirado por presidencia',reviewed_at:new Date().toISOString(),reviewed_by:supabaseSession.user.id}).eq('id',id); if(error){showToast(`No se pudo dar de baja: ${error.message}`);return;} await refreshApprovedResidents(); showToast('Acceso retirado.'); }
document.querySelector('#inviteNeighborBtn').onclick=()=>{document.querySelector('#inviteResult').hidden=true;document.querySelector('#inviteCreateActions').hidden=false;openModal('inviteModal');};
function getAppBaseUrl(){const path=window.location.pathname.endsWith('/')?window.location.pathname:`${window.location.pathname}/`;return `${window.location.origin}${path}`;}
document.querySelector('#createInviteBtn').onclick=async()=>{if(!supabaseClient||!supabaseSession){showToast('Inicia sesión como presidencia para crear enlaces.');return;} const code=`CAVA-${crypto.randomUUID().slice(0,8).toUpperCase()}`; const {error}=await supabaseClient.from('community_invitations').insert({code}); if(error){showToast(`No se pudo crear el enlace: ${error.message}`);return;} const link=`${getAppBaseUrl()}?perfil=vecino&invite=${encodeURIComponent(code)}`; document.querySelector('#inviteLink').value=link; document.querySelector('#inviteWhatsapp').href=`https://wa.me/?text=${encodeURIComponent(`Hola. Para solicitar acceso a la comunidad, completa tus datos aquí: ${link}`)}`; document.querySelector('#inviteResult').hidden=false;document.querySelector('#inviteCreateActions').hidden=true;showToast('Enlace creado.');};
document.querySelector('#copyInviteLink').onclick=async()=>{await navigator.clipboard.writeText(document.querySelector('#inviteLink').value);showToast('Enlace copiado.');};
function setDocumentView(view){ documentView=view; document.querySelectorAll('[data-document-view]').forEach(button=>button.classList.toggle('active',button.dataset.documentView===view)); const admin=currentRole==='admin' && Boolean(supabaseSession); document.querySelector('#documentForm').hidden=!(admin && view==='manage'); document.querySelector('#documentsIntro').textContent=view==='manage'?'Sube, revisa y elimina documentos de la comunidad.':'Consulta los documentos publicados por presidencia.'; renderDocuments(); }
async function openDocuments(view='consult'){ setDocumentView(view); if(supabaseSession){await refreshRemoteDocuments();} else {documentSource='local';renderDocuments();} openModal('documentsModal'); }
document.querySelector('#openDocumentsBtn').onclick=()=>openDocuments('consult');
document.querySelector('#manageDocumentsBtn').onclick=()=>openDocuments('manage');
document.querySelectorAll('[data-document-view]').forEach(button=>button.onclick=()=>{if(button.dataset.documentView==='manage' && !(currentRole==='admin' && supabaseSession)) return; setDocumentView(button.dataset.documentView);});
document.querySelector('#authBtn').onclick=async()=>{if(supabaseSession){await supabaseClient.auth.signOut();showToast('Sesión cerrada.');}else openModal('authModal');};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>closeModal(button.dataset.close));
document.querySelectorAll('.modal-backdrop').forEach(backdrop=>backdrop.onclick=e=>{if(e.target===backdrop)closeModal(backdrop.id)});
document.querySelectorAll('[data-section]').forEach(button=>button.onclick=()=>{const section=button.dataset.section; document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.section===section)); const target=document.getElementById(section); if(target)target.scrollIntoView({behavior:'smooth',block:'start'});});
document.querySelector('#registerForm').onsubmit=async e=>{e.preventDefault(); const form=e.currentTarget; const data=new FormData(form); if(invitationCode && supabaseClient){const {error}=await supabaseClient.from('community_access_requests').insert({invitation_code:invitationCode,full_name:data.get('name'),phone:data.get('phone'),floor:data.get('floor'),notes:data.get('notes')||null}); if(error){showToast(`No se pudo enviar la solicitud: ${error.message}`);return;} closeModal('registerModal'); form.reset(); applyAccessGate(); showToast('Solicitud enviada. Espera la autorización de presidencia.'); return;} closeModal('registerModal'); showToast('Necesitas un enlace de invitación de presidencia.');};
document.querySelector('#noticeForm').onsubmit=e=>{e.preventDefault(); const data=new FormData(e.currentTarget); notices.unshift({date:'HOY',month:'',title:data.get('title'),message:data.get('message'),tag:'Nuevo'}); renderNotices(); closeModal('noticeModal'); e.currentTarget.reset(); showToast('Aviso publicado.');};
document.querySelector('#documentForm').onsubmit=async e=>{e.preventDefault(); const form=e.currentTarget; const data=new FormData(form); const file=data.get('file'); if(!file?.name){showToast('Selecciona primero un archivo.'); return;} if(!supabaseClient || !supabaseSession){showToast('Inicia sesión para subir documentos.'); return;} const submit=form.querySelector('button[type="submit"]'); submit.disabled=true; submit.textContent='Guardando…'; showToast('Guardando documento…'); try{const path=`${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`; const {error:uploadError}=await supabaseClient.storage.from('community-documents').upload(path,file,{upsert:false}); if(uploadError) throw new Error(`No se pudo guardar el archivo: ${uploadError.message}`); const {error:rowError}=await supabaseClient.from('documents').insert({title:file.name,description:String(data.get('description')||'').trim(),category:data.get('type'),storage_path:path}); if(rowError){await supabaseClient.storage.from('community-documents').remove([path]); throw new Error(`No se pudo registrar el documento: ${rowError.message}`);} form.reset(); await refreshRemoteDocuments(); showToast('Documento guardado en Supabase.');}catch(error){showToast(error.message||'No se pudo guardar el documento.');}finally{submit.disabled=false; submit.textContent='Añadir documento';}};
document.querySelector('#authForm').onsubmit=async e=>{e.preventDefault(); if(!supabaseClient){showToast('Supabase no está configurado.'); return;} const data=new FormData(e.currentTarget); const {error}=await supabaseClient.auth.signInWithPassword({email:data.get('email'),password:data.get('password')}); if(error){const message=String(error.message||'').toLowerCase(); if(message.includes('email not confirmed')) showToast('Confirma primero el correo que recibiste.'); else if(message.includes('invalid login credentials')) showToast('El correo o la contraseña no coinciden.'); else showToast(`No se pudo iniciar sesión: ${error.message}`); return;} closeModal('authModal');showToast('Sesión iniciada.');};
document.querySelector('[data-auth-signup]').onclick=async()=>{if(!supabaseClient)return; const data=new FormData(document.querySelector('#authForm')); const {error}=await supabaseClient.auth.signUp({email:data.get('email'),password:data.get('password')}); if(error){showToast(`No se pudo crear la cuenta: ${error.message}`); return;} showToast('Cuenta creada. Revisa tu correo para confirmarla.');};
document.querySelector('#incidentForm').onsubmit=e=>{e.preventDefault(); const data=new FormData(e.currentTarget); incidents.unshift({icon:'⌁',title:data.get('title'),text:currentRole==='admin'?'Registrada por presidencia · ahora':'Comunicada por el vecino · piso pendiente de confirmar · ahora',status:'Pendiente'}); renderIncidents(); closeModal('incidentModal'); e.currentTarget.reset(); showToast(currentRole==='admin'?'Incidencia registrada para seguimiento.':'Enviado a presidencia. Solo la presidencia decidirá si se publica.');};
document.querySelectorAll('.role-choice').forEach(button=>button.onclick=()=>{ currentRole=button.dataset.role; document.querySelectorAll('.role-choice').forEach(item=>item.classList.toggle('active',item===button)); const admin=currentRole==='admin'; document.querySelector('#roleName').textContent=admin?'Presidente y administrador':'Vecino'; document.querySelector('#roleDescription').textContent=admin?'Gestionas la información que se publica para toda la comunidad.':'Puedes consultar la información y enviar comunicaciones privadas a presidencia.'; document.querySelector('#topRole').textContent=admin?'Presidencia':'Vecino'; document.querySelector('.avatar').textContent=admin?'ES':'V'; document.querySelector('#newNoticeBtn').hidden=!admin; document.querySelector('#noticePermission').textContent=admin?'Solo la presidencia puede publicar avisos visibles para toda la comunidad.':'Aquí puedes consultar los avisos publicados por la presidencia.'; document.querySelector('#incidentHeading').textContent=admin?'Incidencias abiertas':'Incidencias y sugerencias'; document.querySelector('#incidentPermission').textContent=admin?'Gestiona las incidencias que te comunican los vecinos.':'Tus comunicaciones se envían a presidencia y no se publican directamente.'; document.querySelector('#newIncidentBtn').textContent=admin?'＋ Registrar incidencia':'＋ Enviar incidencia o sugerencia'; document.querySelector('#incidentTitle').textContent=admin?'Registrar incidencia':'Enviar a presidencia'; document.querySelector('#incidentIntro').textContent=admin?'Registra una incidencia para hacer seguimiento.':'Esta comunicación la recibirá la presidencia y decidirá si debe publicarse.'; document.querySelector('#incidentSubmit').textContent=admin?'Guardar incidencia':'Enviar a presidencia'; document.querySelector('#solicitudes').hidden=!admin; document.querySelector('#profileLabel').textContent=admin?'PRESIDENTE Y ADMINISTRADOR':'VECINO'; document.querySelector('#profileName').textContent=admin?'Eduardo Santamaría':'Nombre del vecino'; document.querySelector('#profileAddress').textContent=admin?'Portal 1 · 1.º F':'Portal y piso'; document.querySelector('#profileStatus').textContent=admin?'Cuenta administradora':'Cuenta pendiente de verificación'; });
const requestedProfile = new URLSearchParams(window.location.search).get('perfil');
if(requestedProfile === 'vecino' || requestedProfile === 'neighbor'){
  currentRole='neighbor';
  document.querySelectorAll('.role-choice').forEach(item=>item.classList.toggle('active',item.dataset.role==='neighbor'));
  document.querySelector('#roleName').textContent='Vecino';
  document.querySelector('#roleDescription').textContent='Puedes consultar la información y enviar comunicaciones privadas a presidencia.';
  document.querySelector('#topRole').textContent='Vecino';
  document.querySelector('.avatar').textContent='V';
  document.querySelector('#newNoticeBtn').hidden=true;
  document.querySelector('#noticePermission').textContent='Aquí puedes consultar los avisos publicados por la presidencia.';
  document.querySelector('#incidentHeading').textContent='Incidencias y sugerencias';
  document.querySelector('#incidentPermission').textContent='Tus comunicaciones se envían a presidencia y no se publican directamente.';
  document.querySelector('#newIncidentBtn').textContent='＋ Enviar incidencia o sugerencia';
  document.querySelector('#incidentTitle').textContent='Enviar a presidencia';
  document.querySelector('#incidentIntro').textContent='Esta comunicación la recibirá la presidencia y decidirá si debe publicarse.';
  document.querySelector('#incidentSubmit').textContent='Enviar a presidencia';
  document.querySelector('#solicitudes').hidden=true;
  document.querySelector('#profileLabel').textContent='VECINO';
  document.querySelector('#profileName').textContent='Nombre del vecino';
  document.querySelector('#profileAddress').textContent='Piso pendiente de confirmar';
  document.querySelector('#profileStatus').textContent='Cuenta pendiente de verificación';
}
function syncDocumentPermissions(){
  const admin=currentRole==='admin' && Boolean(supabaseSession);
  document.querySelector('#manageDocumentsBtn').hidden=!admin;
  document.querySelector('#manageDocumentsTab').hidden=!admin;
  if(!admin && documentView==='manage') documentView='consult';
  setDocumentView(documentView);
}
document.querySelectorAll('.role-choice').forEach(button=>button.addEventListener('click',syncDocumentPermissions));
syncDocumentPermissions();
if(invitationCode){
  currentRole='neighbor';
  document.querySelectorAll('.role-choice').forEach(item=>item.classList.remove('active'));
  document.querySelector('.role-choice[data-role="neighbor"]')?.classList.add('active');
  document.querySelector('#roleName').textContent='Vecino';
  document.querySelector('#roleDescription').textContent='Puedes consultar la información y enviar comunicaciones privadas a presidencia.';
  document.querySelector('#topRole').textContent='Vecino';
  document.querySelector('.avatar').textContent='V';
  document.querySelector('#newNoticeBtn').hidden=true;
  document.querySelector('#noticePermission').textContent='Aquí puedes consultar los avisos publicados por la presidencia.';
  document.querySelector('#incidentHeading').textContent='Incidencias y sugerencias';
  document.querySelector('#incidentPermission').textContent='Tus comunicaciones se envían a presidencia y no se publican directamente.';
  document.querySelector('#newIncidentBtn').textContent='＋ Enviar incidencia o sugerencia';
  document.querySelector('#incidentTitle').textContent='Enviar a presidencia';
  document.querySelector('#incidentIntro').textContent='Esta comunicación la recibirá la presidencia y decidirá si debe publicarse.';
  document.querySelector('#incidentSubmit').textContent='Enviar a presidencia';
  document.querySelector('#solicitudes').hidden=true;
  document.querySelector('#profileLabel').textContent='VECINO';
  document.querySelector('#profileName').textContent='Nuevo vecino';
  document.querySelector('#profileAddress').textContent='Pendiente de confirmar';
  document.querySelector('#profileStatus').textContent='Solicitud pendiente';
  const inviteInput=document.querySelector('#registerForm input[name="invite"]');
  inviteInput.value=invitationCode;
  inviteInput.readOnly=true;
  window.setTimeout(()=>openModal('registerModal'),350);
}
function removePortalReferences(){
  document.querySelector('#profileAddress').textContent=currentRole==='admin'?'1.º F':'Piso pendiente de confirmar';
  const nextCard=document.querySelector('.next-card p');
  if(nextCard) nextCard.textContent='Mañana · 09:00 · Zonas comunes';
  document.querySelector('#registerModal .modal-intro').textContent='Rellena tus datos. El presidente revisará la solicitud antes de activar tu cuenta.';
  const floorLabel=document.querySelector('#registerForm input[name="floor"]')?.closest('label');
  if(floorLabel){ floorLabel.firstChild.textContent='Piso'; floorLabel.querySelector('input').placeholder='1.º F'; }
  const incidentLocation=document.querySelector('#incidentForm input[name="location"]')?.closest('label');
  if(incidentLocation){ incidentLocation.firstChild.textContent='Zona'; incidentLocation.querySelector('input').placeholder='Por ejemplo: garaje, azotea'; }
  const incidentTitle=document.querySelector('#incidentForm input[name="title"]');
  if(incidentTitle)incidentTitle.placeholder='Por ejemplo: luz fundida en las zonas comunes';
}
renderCurrentDate(); renderNotices(); renderIncidents(); removePortalReferences(); syncDocumentPermissions(); initSupabase();
