// Copia de seguridad de la implementación web publicada el 3 de noviembre de 2026.
// El secreto de autenticación no se guarda en el repositorio.
const CONFIG = {
  recipients: ['cuarteldelacava@gmail.com', 'gestion@proedyo.com'],
  sender: 'cuarteldelacava@gmail.com',
  secret: 'CONFIG_SECRET_REDACTED'
};

function jsonResponse(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  try {
    const payload = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    if (payload.secret !== CONFIG.secret) return jsonResponse({ ok: false, error: 'unauthorized' });

    const type = String(payload.communication_type || payload.type || 'Incidencia').trim().toLowerCase();
    if (type === 'sugerencia') return jsonResponse({ ok: true, skipped: true, no_email: true });
    if (type !== 'incidencia') return jsonResponse({ ok: false, error: 'invalid_type' });

    const title = String(payload.title || 'Sin título').trim();
    const message = String(payload.body || payload.message || '').trim();
    const location = String(payload.location || 'No indicado').trim();
    const subject = String(payload.subject || 'Nueva incidencia · Comunidad Cuartel de la Cava').trim();
    const body = message || [
      'Se ha recibido una nueva incidencia en la Comunidad de Vecinos Cuartel de la Cava.',
      '',
      'Título: ' + title,
      'Zona o portal: ' + location,
      '',
      'Puedes revisar la incidencia desde el perfil de administrador.'
    ].join('\n');

    GmailApp.sendEmail(CONFIG.recipients.join(','), subject, body);
    return jsonResponse({ ok: true, recipients: CONFIG.recipients });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error.message || error) });
  }
}
