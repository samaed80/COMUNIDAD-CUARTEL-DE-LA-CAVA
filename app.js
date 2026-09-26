const notices = [
  {date:'26', month:'SEP', title:'Revisión del ascensor', message:'La empresa revisará los dos ascensores el miércoles a partir de las 09:00.', tag:'Mantenimiento'},
  {date:'24', month:'SEP', title:'Nueva norma para las zonas comunes', message:'Recordamos que las bicicletas deben permanecer en el espacio habilitado del garaje.', tag:'Convivencia'},
  {date:'18', month:'SEP', title:'Acta de la última reunión', message:'Ya puedes consultar el acta de la junta de septiembre en la sección de documentos.', tag:'Documentos'}
];
const incidents = [
  {icon:'⌁', title:'Luz fundida en el portal 2', text:'Comunicada por Marta · hace 2 días', status:'En proceso'},
  {icon:'♧', title:'Goteo en el garaje', text:'Comunicada por Luis · hace 4 días', status:'Pendiente'}
];
const noticeList = document.querySelector('#noticeList'), incidentList = document.querySelector('#incidentList'), toast = document.querySelector('#toast');
let currentRole = 'admin';
function renderNotices(){ noticeList.innerHTML = notices.map(n => `<article class="notice-card"><div class="notice-date"><b>${n.date}</b>${n.month}</div><div><h3>${n.title}</h3><p>${n.message}</p></div><span class="notice-tag">${n.tag}</span></article>`).join(''); }
function renderIncidents(){ incidentList.innerHTML = incidents.map(i => `<article class="incident-card"><span class="incident-icon">${i.icon}</span><div><h3>${i.title}</h3><p>${i.text}</p></div><span class="incident-status">${i.status}</span></article>`).join(''); }
function openModal(id){ document.querySelector('#'+id).hidden=false; }
function closeModal(id){ document.querySelector('#'+id).hidden=true; }
function showToast(message){ toast.textContent=message; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),2600); }
document.querySelector('#newNoticeBtn').onclick=()=>openModal('noticeModal');
document.querySelector('#newIncidentBtn').onclick=()=>openModal('incidentModal');
document.querySelector('#quickIncidentBtn').onclick=()=>openModal('incidentModal');
document.querySelector('#profileBtn').onclick=()=>openModal('registerModal');
document.querySelector('#viewAllBtn').onclick=()=>showToast('Aquí aparecerá el historial completo de avisos.');
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>closeModal(button.dataset.close));
document.querySelectorAll('.modal-backdrop').forEach(backdrop=>backdrop.onclick=e=>{if(e.target===backdrop)closeModal(backdrop.id)});
document.querySelectorAll('[data-section]').forEach(button=>button.onclick=()=>{const section=button.dataset.section; document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.section===section)); const target=document.getElementById(section); if(target)target.scrollIntoView({behavior:'smooth',block:'start'});});
document.querySelector('#registerForm').onsubmit=e=>{e.preventDefault(); closeModal('registerModal'); showToast('Solicitud recibida. El presidente revisará tus datos.');};
document.querySelector('#noticeForm').onsubmit=e=>{e.preventDefault(); const data=new FormData(e.currentTarget); notices.unshift({date:'HOY',month:'',title:data.get('title'),message:data.get('message'),tag:'Nuevo'}); renderNotices(); closeModal('noticeModal'); e.currentTarget.reset(); showToast('Aviso publicado.');};
document.querySelector('#incidentForm').onsubmit=e=>{e.preventDefault(); closeModal('incidentModal'); e.currentTarget.reset(); showToast(currentRole==='admin'?'Incidencia registrada para seguimiento.':'Enviado a presidencia. Solo la presidencia decidirá si se publica.');};
document.querySelectorAll('.role-choice').forEach(button=>button.onclick=()=>{ currentRole=button.dataset.role; document.querySelectorAll('.role-choice').forEach(item=>item.classList.toggle('active',item===button)); const admin=currentRole==='admin'; document.querySelector('#roleName').textContent=admin?'Presidente y administrador':'Vecino'; document.querySelector('#roleDescription').textContent=admin?'Gestionas la información que se publica para toda la comunidad.':'Puedes consultar la información y enviar comunicaciones privadas a presidencia.'; document.querySelector('#newNoticeBtn').hidden=!admin; document.querySelector('#noticePermission').textContent=admin?'Solo la presidencia puede publicar avisos visibles para toda la comunidad.':'Aquí puedes consultar los avisos publicados por la presidencia.'; document.querySelector('#incidentHeading').textContent=admin?'Incidencias abiertas':'Incidencias y sugerencias'; document.querySelector('#incidentPermission').textContent=admin?'Gestiona las incidencias que te comunican los vecinos.':'Tus comunicaciones se envían a presidencia y no se publican directamente.'; document.querySelector('#newIncidentBtn').textContent=admin?'＋ Registrar incidencia':'＋ Enviar incidencia o sugerencia'; document.querySelector('#incidentTitle').textContent=admin?'Registrar incidencia':'Enviar a presidencia'; document.querySelector('#incidentIntro').textContent=admin?'Registra una incidencia para hacer seguimiento.':'Esta comunicación la recibirá la presidencia y decidirá si debe publicarse.'; document.querySelector('#incidentSubmit').textContent=admin?'Guardar incidencia':'Enviar a presidencia'; });
renderNotices(); renderIncidents();
