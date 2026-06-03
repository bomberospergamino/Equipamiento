/*************** CONFIGURACIÓN SBVP ***************/
const SPREADSHEET_ID = '1iej80w--kZK_N33UTq9FbDbA0air3qFimrDIB1QAxZ0';
const ROOT_FOLDER_ID = '12CkVpy0YE0Jais2ffn1ewbKAvLR0USsQ';
const NOVEDADES_EMAIL = 'adm.equipamiento.sbvp@gmail.com';
const INSTITUTION = 'Sociedad Bomberos Voluntarios Pergamino';
const RESPONSABLES_SPREADSHEET_ID = '1nTBEnVuyXHPMJsMrnfdfcbKUFIFLKED3Z4oalQYRH14';

/*************** WEB APP ***************/
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'config') return jsonResponse(getConfig_());
    if (action === 'responsables') return jsonResponse({ responsables: getResponsables_() });
    if (action === 'activity') return jsonResponse({ items: getActivityItems_(e.parameter.name) });
    return jsonResponse({ ok: true, message: 'Control de equipamiento activo' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action !== 'submit') throw new Error('Acción no válida');
    const result = saveSubmission_(body.payload);
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/*************** LECTURA DE MATRIZ ***************/
function getConfig_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const agendaSheet = ss.getSheetByName('AGENDA');
  if (!agendaSheet) throw new Error('No existe la hoja AGENDA');

  const values = agendaSheet.getDataRange().getDisplayValues().filter(r => r.some(c => c !== ''));
  const agenda = {};
  values.slice(1).forEach(row => {
    const day = normalizeDay_(row[0]);
    if (!day) return;
    agenda[day] = row.slice(1).map(v => String(v).trim()).filter(Boolean);
  });

  const activities = ss.getSheets()
    .map(s => s.getName())
    .filter(name => name !== 'AGENDA' && name !== 'REGISTROS' && name !== 'NOVEDADES');

  let responsables = [];
  let responsablesError = '';
  try {
    responsables = getResponsables_();
  } catch (err) {
    responsablesError = err.message;
  }

  return { agenda, activities, responsables, responsablesError, completedToday: getCompletedToday_() };
}


function getResponsables_() {
  const ss = SpreadsheetApp.openById(RESPONSABLES_SPREADSHEET_ID);
  const sheet = ss.getSheets()[0];
  if (!sheet) throw new Error('No se encontró la primera hoja del archivo de responsables');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet.getRange(2, 4, lastRow - 1, 1)
    .getDisplayValues()
    .flat()
    .map(v => String(v).trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b));
}

function getCompletedToday_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('REGISTROS');
  if (!sh || sh.getLastRow() < 2) return [];

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const activityIdx = headers.indexOf('Actividad');
  const controlDateIdx = headers.indexOf('Fecha control');
  const loadDateIdx = headers.indexOf('Fecha carga');

  if (activityIdx < 0) return [];

  const tz = Session.getScriptTimeZone();
  const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const completed = new Set();

  values.slice(1).forEach(row => {
    const activity = String(row[activityIdx] || '').trim();
    if (!activity) return;

    let key = '';
    if (controlDateIdx >= 0 && row[controlDateIdx]) {
      key = normalizeDateKey_(row[controlDateIdx]);
    } else if (loadDateIdx >= 0 && row[loadDateIdx]) {
      key = normalizeDateKey_(row[loadDateIdx]);
    }

    if (key === todayKey) completed.add(activity);
  });

  return Array.from(completed);
}

function normalizeDateKey_(value) {
  const tz = Session.getScriptTimeZone();

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }

  const text = String(value || '').trim();
  if (!text) return '';

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const ar = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ar) return `${ar[3]}-${String(ar[2]).padStart(2,'0')}-${String(ar[1]).padStart(2,'0')}`;

  const parsed = new Date(text);
  if (!isNaN(parsed)) return Utilities.formatDate(parsed, tz, 'yyyy-MM-dd');

  return text;
}

function getActivityItems_(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No existe la hoja de actividad: ' + sheetName);

  const values = sheet.getDataRange().getDisplayValues().filter(r => r.some(c => c !== ''));
  if (values.length < 2) return [];

  const headers = values[0].map(h => normalizeHeader_(h));
  const idx = {
    movil: headers.indexOf('movil'),
    ordenUbicacion: headers.indexOf('orden de ubicacion'),
    ubicacion: headers.indexOf('ubicacion'),
    elemento: headers.indexOf('elemento'),
    cantidad: headers.indexOf('cantidad')
  };
  Object.entries(idx).forEach(([k, v]) => { if (v < 0) throw new Error('Falta columna requerida en ' + sheetName + ': ' + k); });

  return values.slice(1).map(r => ({
    movil: r[idx.movil],
    ordenUbicacion: Number(r[idx.ordenUbicacion]) || 9999,
    ubicacion: r[idx.ubicacion],
    elemento: r[idx.elemento],
    cantidadEsperada: r[idx.cantidad]
  })).filter(x => x.elemento).sort((a,b) => a.ordenUbicacion - b.ordenUbicacion || String(a.ubicacion).localeCompare(String(b.ubicacion)));
}

/*************** GUARDADO Y PDF ***************/
function saveSubmission_(payload) {
  if (!payload || !payload.activity) throw new Error('Falta actividad');
  const now = new Date();
  const folder = getOrCreateFolder_(DriveApp.getFolderById(ROOT_FOLDER_ID), payload.activity);
  const pdfBlob = buildPdf_(payload, now);
  const filename = `Control_${payload.activity}_${Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm')}.pdf`;
  const file = folder.createFile(pdfBlob.setName(filename));

  appendRegistro_(payload, now, file.getUrl());
  appendNovedades_(payload, now, file.getUrl());

  return { pdfUrl: file.getUrl(), filename };
}

function buildPdf_(payload, now) {
  const novedades = getNovedadesFromPayload_(payload);
  const rowsHtml = payload.responses.map(r => {
    const isBad = r.condicionEstado === 'Malo';
    const isWarn = r.cantidadEstado !== 'Bien' || r.condicionEstado === 'Regular';
    const cls = isBad ? 'bad' : (isWarn ? 'warn' : '');
    return `<tr class="${cls}"><td>${esc(r.ubicacion)}</td><td>${esc(r.elemento)}</td><td>${esc(r.cantidadEsperada)}</td><td>${esc(r.cantidadEstado)}</td><td>${esc(r.condicionEstado)}</td><td>${esc(r.observacionFila || '-')}</td></tr>`;
  }).join('');

  const photosHtml = buildPhotosHtml_(payload.photos || []);

  const html = `
  <html><head><style>
    body{font-family:Arial,sans-serif;color:#17212b} h1{color:#063452;margin:0} h2{color:#063452;margin-bottom:4px}.top{border-bottom:4px solid #df3438;padding-bottom:10px;margin-bottom:12px}.meta{font-size:12px;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #b8c5d0;padding:6px;vertical-align:top}th{background:#063452;color:white}.warn{background:#fff2a8}.bad{background:#ffd6d6}.obs{border:1px solid #b8c5d0;padding:8px;margin-top:12px;min-height:45px}.nov{margin-top:12px;background:#fff7d4;padding:8px;border:1px solid #e4cf62}.photos{margin-top:14px}.photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.photo{border:1px solid #b8c5d0;padding:6px;page-break-inside:avoid}.photo img{width:100%;max-height:240px;object-fit:contain}.caption{font-size:10px;color:#647587;margin-top:4px}
  </style></head><body>
    <div class="top"><h1>Control de equipamiento</h1><strong>${INSTITUTION}</strong></div>
    <div class="meta">
      <div><b>Actividad:</b> ${esc(payload.activity)}</div>
      <div><b>Fecha:</b> ${esc(formatControlDate_(payload.fechaControl))}</div>
      <div><b>Responsable/s:</b> ${esc(payload.responsable || '-')}</div>
      <div><b>Generado:</b> ${Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')}</div>
    </div>
    <table><thead><tr><th>Ubicación</th><th>Elemento</th><th>Un</th><th>Cantidad</th><th>Condición</th><th>Obs.</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    <h2>Observaciones generales</h2><div class="obs">${esc(payload.observaciones || '-')}</div>
    ${photosHtml}
    <div class="nov"><b>Novedades detectadas:</b> ${novedades.length}</div>
  </body></html>`;

  return HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF);
}

function buildPhotosHtml_(photos) {
  if (!photos || !photos.length) return '';
  const items = photos.map((photo, index) => {
    const src = String(photo.dataUrl || '');
    if (!src) return '';
    return `<div class="photo"><img src="${src}"><div class="caption">${esc(photo.name || ('Foto ' + (index + 1)))}</div></div>`;
  }).join('');
  return `<div class="photos"><h2>Fotos del control</h2><div class="photo-grid">${items}</div></div>`;
}

function appendRegistro_(payload, now, pdfUrl) {
  const sh = getOrCreateSheet_('REGISTROS', ['Fecha carga','Fecha control','Actividad','Responsable/s','Observaciones','PDF','Total items','Total novedades']);
  sh.appendRow([now, payload.fechaControl || '', payload.activity, payload.responsable || '', payload.observaciones || '', pdfUrl, payload.responses.length, getNovedadesFromPayload_(payload).length]);
}

function appendNovedades_(payload, now, pdfUrl) {
  const novedades = getNovedadesFromPayload_(payload);
  if (!novedades.length && !payload.observaciones) return;
  const sh = getOrCreateSheet_('NOVEDADES', ['Fecha carga','Enviado','Fecha control','Actividad','Responsable/s','Ubicación','Elemento','Unidad esperada','Cantidad','Condición','Observación general','PDF']);
  novedades.forEach(n => sh.appendRow([now, '', payload.fechaControl || '', payload.activity, payload.responsable || '', n.ubicacion, n.elemento, n.cantidadEsperada, n.cantidadEstado, n.condicionEstado, payload.observaciones || '', pdfUrl]));
  if (!novedades.length && payload.observaciones) sh.appendRow([now, '', payload.fechaControl || '', payload.activity, payload.responsable || '', '-', '-', '-', '-', '-', payload.observaciones, pdfUrl]);
}

function getNovedadesFromPayload_(payload) {
  return (payload.responses || []).filter(r => r.cantidadEstado !== 'Bien' || r.condicionEstado !== 'Bueno');
}

/*************** MAIL DIARIO 23 HS ***************/
function sendDailyNews() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('NOVEDADES');
  if (!sh || sh.getLastRow() < 2) return;
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const enviadoIdx = headers.indexOf('Enviado');
  const pending = values.slice(1).map((row, i) => ({ row, rowNumber: i + 2 })).filter(x => !x.row[enviadoIdx]);
  if (!pending.length) return;

  const htmlRows = pending.map(x => `<tr>${x.row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  const html = `<p>Resumen diario acumulado de novedades de Control de equipamiento.</p><table border="1" cellpadding="5" cellspacing="0"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${htmlRows}</tbody></table>`;
  MailApp.sendEmail({ to: NOVEDADES_EMAIL, subject: 'Resumen diario de novedades - Control de equipamiento', htmlBody: html });
  pending.forEach(x => sh.getRange(x.rowNumber, enviadoIdx + 1).setValue(new Date()));
}

function createDailyTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendDailyNews').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendDailyNews').timeBased().everyDays(1).atHour(23).create();
}

/*************** HELPERS ***************/
function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

function formatControlDate_(value) {
  if (!value) return '-';
  const parts = String(value).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(value);
}

function normalizeHeader_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
function normalizeDay_(s) {
  const clean = normalizeHeader_(s);
  const map = { lunes:'Lunes', martes:'Martes', miercoles:'Miércoles', jueves:'Jueves', viernes:'Viernes', sabado:'Sábado', domingo:'Domingo' };
  return map[clean] || '';
}
function esc(v) {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
