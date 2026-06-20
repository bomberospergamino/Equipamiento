/*************** CONFIGURACION SBVP ***************/
const SPREADSHEET_ID = '1iej80w--kZK_N33UTq9FbDbA0air3qFimrDIB1QAxZ0';
const ROOT_FOLDER_ID = '12CkVpy0YE0Jais2ffn1ewbKAvLR0USsQ';
const NOVEDADES_EMAIL = 'adm.equipamiento.sbvp@gmail.com';
const INSTITUTION = 'Sociedad Bomberos Voluntarios Pergamino';
const RESPONSABLES_SPREADSHEET_ID = '1nTBEnVuyXHPMJsMrnfdfcbKUFIFLKED3Z4oalQYRH14';

/*************** CONFIGURACION PIZARRA ***************/
const PIZARRA_SHEET_NAME = 'PIZARRA';
const INTERNAL_SHEETS = ['AGENDA', 'REGISTROS', 'NOVEDADES', 'PIZARRA', 'PIZZARRA'];
const ADMIN_PASS = '1105';
const FINALIZADAS_VISIBLES_DIAS = 7;
const DIAS_PARA_LIBERAR_ASIGNADA = 5;
const PIZARRA_HEADERS = [
  'ID',
  'FECHA_ALTA',
  'ORIGEN',
  'UBICACION',
  'ELEMENTO',
  'TAREA',
  'PRIORIDAD',
  'TIEMPO_ESTIMADO_DIAS',
  'FECHA_VENCIMIENTO',
  'ESTADO',
  'ASIGNADO_A',
  'FECHA_ASIGNACION',
  'FECHA_FINALIZACION',
  'OBSERVACIONES',
  'FOTOS',
  'CREADO_POR',
  'ULTIMA_ACTUALIZACION',
  'ULTIMO_ASIGNADO'
];

/*************** WEB APP UNIFICADA ***************/
function doGet(e) {
  try {
    const params = e.parameter || {};
    const action = String(params.action || '').trim();

    if (action === 'config') return jsonResponse(getConfig_());
    if (action === 'activity') return jsonResponse({ items: getActivityItems_(params.name) });

    if (action === 'list') return jsonResponse(listTasks_());
    if (action === 'assign') return jsonResponse(assignTask_(params));
    if (action === 'finish') return jsonResponse(finishTask_(params));
    if (action === 'adminUpdate') return jsonResponse(adminUpdate_(params));
    if (action === 'createFromNovedad') return jsonResponse(createTaskFromNovedad_(params));

    return jsonResponse({ ok: true, message: 'Control de equipamiento y pizarra activos' });
  } catch (err) {
    return jsonResponse({ ok: false, message: err.message, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action !== 'submit') throw new Error('Accion no valida');
    const result = saveSubmission_(body.payload, body.pdfBase64, body.filename);
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    return jsonResponse({ ok: false, message: err.message, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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
    .filter(name => !isInternalSheet_(name));

  return { agenda, activities, responsables: getResponsables_(), completedToday: getCompletedToday_() };
}

function getResponsables_() {
  const ss = SpreadsheetApp.openById(RESPONSABLES_SPREADSHEET_ID);
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 4, lastRow - 1, 1)
    .getDisplayValues()
    .flat()
    .map(v => String(v).trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
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
  Object.entries(idx).forEach(([k, v]) => {
    if (v < 0) throw new Error('Falta columna requerida en ' + sheetName + ': ' + k);
  });

  return values.slice(1).map(r => ({
    movil: r[idx.movil],
    ordenUbicacion: Number(r[idx.ordenUbicacion]) || 9999,
    ubicacion: r[idx.ubicacion],
    elemento: r[idx.elemento],
    cantidadEsperada: r[idx.cantidad]
  })).filter(x => x.elemento).sort((a, b) => {
    return a.ordenUbicacion - b.ordenUbicacion || String(a.ubicacion).localeCompare(String(b.ubicacion));
  });
}

/*************** GUARDADO CONTROL, PDF Y NOVEDADES ***************/
function saveSubmission_(payload, pdfBase64, requestedFilename) {
  if (!payload || !payload.activity) throw new Error('Falta actividad');
  const now = new Date();
  const folder = getOrCreateFolder_(DriveApp.getFolderById(ROOT_FOLDER_ID), payload.activity);
  const pdfBlob = pdfBase64
    ? Utilities.newBlob(Utilities.base64Decode(pdfBase64), MimeType.PDF)
    : buildPdf_(payload, now);
  const filename = requestedFilename || `Control_${payload.activity}_${Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm')}.pdf`;
  const file = folder.createFile(pdfBlob.setName(filename));

  appendRegistro_(payload, now, file.getUrl());
  appendNovedades_(payload, now, file.getUrl());

  return { pdfUrl: file.getUrl(), filename };
}

function buildPdf_(payload, now) {
  const novedades = getNovedadesFromPayload_(payload);
  const locationTablesHtml = buildLocationTablesHtml_(payload.responses || []);
  const logoHtml = getLogoHtml_();

  const html = `
  <html><head><style>
    body{font-family:Arial,sans-serif;color:#162332;margin:0} .top{background:#05263a;color:white;border-bottom:5px solid #dc3338;padding:14px 16px 12px;margin-bottom:14px;position:relative;min-height:78px} h1{color:white;margin:0;font-size:24px} .institution{font-weight:bold;margin-top:4px}.logo{position:absolute;right:16px;top:9px;width:64px;height:64px;object-fit:contain;background:white;border:2px solid #dc3338;border-radius:8px;padding:4px}.logo-fallback{position:absolute;right:16px;top:14px;width:64px;height:48px;border:2px solid #dc3338;border-radius:8px;background:white;color:#07344f;font-weight:bold;text-align:center;padding-top:18px}.meta{font-size:12px;margin:0 16px 14px}.section-title{background:#07344f;color:white;padding:6px 8px;border-radius:4px;margin:12px 16px 0;font-weight:bold;font-size:12px}table{width:calc(100% - 32px);margin:0 16px 10px;border-collapse:collapse;font-size:10.5px}th,td{border:1px solid #d7e1e7;padding:6px;vertical-align:top}th{background:#05263a;color:white}.warn{background:#fffde3}.bad{background:#fff1f1}.obs{border:1px solid #d7e1e7;padding:8px;margin:6px 16px 12px;min-height:45px}.nov{margin:12px 16px;background:#fffde3;padding:8px;border:1px solid #f2ec2e}
  </style></head><body>
    <div class="top"><h1>Control de equipamiento</h1><div class="institution">${INSTITUTION}</div>${logoHtml}</div>
    <div class="meta">
      <div><b>Actividad:</b> ${esc(payload.activity)}</div>
      <div><b>Fecha:</b> ${esc(formatControlDate_(payload.fechaControl))}</div>
      <div><b>Responsable/s:</b> ${esc(payload.responsable || '-')}</div>
      <div><b>Generado:</b> ${Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')}</div>
    </div>
    ${locationTablesHtml}
    <h2>Observaciones generales</h2><div class="obs">${esc(payload.observaciones || '-')}</div>
    <div class="nov"><b>Novedades detectadas:</b> ${novedades.length}</div>
  </body></html>`;

  return HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF);
}

function buildLocationTablesHtml_(responses) {
  const groups = groupResponsesByLocation_(responses);
  return groups.map(group => {
    const rowsHtml = group.rows.map(r => {
      const isBad = isCondicionBad_(r.condicionEstado);
      const isWarn = !isCantidadOk_(r.cantidadEstado) || String(r.condicionEstado || '').trim() === 'Regular';
      const cls = isBad ? 'bad' : (isWarn ? 'warn' : '');
      return `<tr class="${cls}"><td>${esc(r.elemento)}</td><td>${esc(r.cantidadEsperada)}</td><td>${esc(r.cantidadEstado)}</td><td>${esc(r.condicionEstado)}</td><td>${esc(r.observacionFila || '-')}</td></tr>`;
    }).join('');
    return `<div class="section-title">Ubicacion ${esc(group.location)}</div><table><thead><tr><th>Elemento</th><th>Unidades</th><th>Cantidad</th><th>Condicion</th><th>Obs.</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
  }).join('');
}

function appendRegistro_(payload, now, pdfUrl) {
  const sh = getOrCreateSheet_('REGISTROS', ['Fecha carga','Fecha control','Actividad','Responsable/s','Observaciones','PDF','Total items','Total novedades']);
  sh.appendRow([now, payload.fechaControl || '', payload.activity, payload.responsable || '', payload.observaciones || '', pdfUrl, (payload.responses || []).length, getNovedadesFromPayload_(payload).length]);
}

function appendNovedades_(payload, now, pdfUrl) {
  const novedades = getNovedadesFromPayload_(payload);
  if (!novedades.length && !payload.observaciones) return;

  const sh = getOrCreateSheet_('NOVEDADES', ['Fecha carga','Enviado','Fecha control','Actividad','Responsable/s','Ubicacion','Elemento','Unidad esperada','Cantidad','Condicion','Observacion general','PDF']);

  novedades.forEach(n => {
    sh.appendRow([now, '', payload.fechaControl || '', payload.activity, payload.responsable || '', n.ubicacion, n.elemento, n.cantidadEsperada, n.cantidadEstado, n.condicionEstado, payload.observaciones || '', pdfUrl]);
    createPizarraTask_({
      origen: 'Control de equipamiento',
      ubicacion: buildPizarraLocation_(payload.activity, n.ubicacion),
      elemento: n.elemento || '',
      tarea: buildTaskText_(n),
      prioridad: '',
      observaciones: joinNotes_(payload.observaciones, n.observacionFila),
      fotos: pdfUrl,
      creadoPor: payload.responsable || ''
    });
  });

  if (!novedades.length && payload.observaciones) {
    sh.appendRow([now, '', payload.fechaControl || '', payload.activity, payload.responsable || '', '-', '-', '-', '-', '-', payload.observaciones, pdfUrl]);
  }
}

function getNovedadesFromPayload_(payload) {
  return (payload.responses || []).filter(r => !isCantidadOk_(r.cantidadEstado) || !isCondicionOk_(r.condicionEstado));
}

function buildTaskText_(n) {
  const parts = [];
  if (n.cantidadEstado && !isCantidadOk_(n.cantidadEstado)) parts.push('Cantidad: ' + n.cantidadEstado);
  if (n.condicionEstado && !isCondicionOk_(n.condicionEstado)) parts.push('Condicion: ' + n.condicionEstado);
  if (n.observacionFila) parts.push('Obs: ' + n.observacionFila);
  return parts.length ? parts.join(' / ') : 'Revisar novedad reportada';
}

function buildPizarraLocation_(activity, ubicacion) {
  return [activity, ubicacion]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(' - ');
}

function isCantidadOk_(value) {
  const text = normalizeHeader_(value);
  return text === 'bien' || text === 'correcto';
}

function isCondicionOk_(value) {
  return normalizeHeader_(value) === 'bueno';
}

function isCondicionBad_(value) {
  const text = normalizeHeader_(value);
  return text === 'malo' || text === 'mal';
}

function joinNotes_() {
  return Array.prototype.slice.call(arguments)
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join('\n');
}

function groupResponsesByLocation_(responses) {
  const sorted = (responses || []).slice().sort((a, b) => {
    const byLocation = String(a.ubicacion || '').localeCompare(String(b.ubicacion || ''), 'es', { numeric: true, sensitivity: 'base' });
    if (byLocation !== 0) return byLocation;
    const ao = Number(a.ordenUbicacion);
    const bo = Number(b.ordenUbicacion);
    if (isFinite(ao) && isFinite(bo) && ao !== bo) return ao - bo;
    return String(a.elemento || '').localeCompare(String(b.elemento || ''), 'es', { numeric: true, sensitivity: 'base' });
  });
  const groups = {};
  const order = [];
  sorted.forEach(row => {
    const location = row.ubicacion || 'Sin ubicacion';
    if (!groups[location]) {
      groups[location] = [];
      order.push(location);
    }
    groups[location].push(row);
  });
  return order.map(location => ({ location, rows: groups[location] }));
}

function getLogoHtml_() {
  try {
    const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const files = root.getFilesByName('logo-sbvp.png');
    if (!files.hasNext()) return '<div class="logo-fallback">SBVP</div>';
    const file = files.next();
    const data = Utilities.base64Encode(file.getBlob().getBytes());
    return `<img class="logo" src="data:${file.getMimeType()};base64,${data}" />`;
  } catch (err) {
    return '<div class="logo-fallback">SBVP</div>';
  }
}

/*************** PIZARRA ***************/
function getPizarraSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(PIZARRA_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PIZARRA_SHEET_NAME);
    sh.appendRow(PIZARRA_HEADERS);
  }
  if (sh.getLastRow() === 0) sh.appendRow(PIZARRA_HEADERS);
  return sh;
}

function getPizarraData_() {
  const sh = getPizarraSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 1) throw new Error('La hoja PIZARRA no tiene encabezados.');
  const headers = values[0].map(String);
  const rows = values.slice(1);
  const items = rows.map((row, idx) => {
    const obj = { _row: idx + 2 };
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  }).filter(item => item.ID !== '' && item.ID !== null && item.ID !== undefined);
  return { sh, headers, items };
}

function listTasks_() {
  const releasedExpired = releaseExpired_();
  const { items } = getPizarraData_();

  const visible = items.filter(item => {
    const estado = String(item.ESTADO || '').trim();
    if (estado === 'Finalizada') {
      return daysSince_(item.FECHA_FINALIZACION) <= FINALIZADAS_VISIBLES_DIAS;
    }
    return true;
  }).map(item => normalizeForClient_(item));

  return { ok: true, tasks: visible, releasedExpired };
}

function normalizeForClient_(item) {
  const copy = {};
  Object.keys(item).forEach(k => {
    if (k === '_row') return;
    let v = item[k];
    if (Object.prototype.toString.call(v) === '[object Date]') {
      v = String(k).includes('FECHA') ? onlyDate_(v) : formatDate_(v);
    }
    copy[k] = v === null || v === undefined ? '' : String(v);
  });
  copy.VENCIDA = shouldReleaseAssigned_(item);
  return copy;
}

function shouldReleaseAssigned_(item) {
  if (String(item.ESTADO).trim() !== 'Asignada') return false;
  return daysSince_(item.FECHA_ASIGNACION) >= DIAS_PARA_LIBERAR_ASIGNADA;
}

function releaseExpired_() {
  const { sh, headers, items } = getPizarraData_();
  const cEstado = colIndex_(headers, 'ESTADO');
  const cAsignado = colIndex_(headers, 'ASIGNADO_A');
  const cUltimo = colIndex_(headers, 'ULTIMO_ASIGNADO');
  const cObs = colIndex_(headers, 'OBSERVACIONES');
  const cUpd = colIndex_(headers, 'ULTIMA_ACTUALIZACION');
  const cFechaAsignacion = colIndex_(headers, 'FECHA_ASIGNACION');

  let count = 0;
  items.forEach(item => {
    if (shouldReleaseAssigned_(item)) {
      const anterior = item.ASIGNADO_A || '';
      const obsActual = item.OBSERVACIONES || '';
      const obsNueva = String(obsActual) + (obsActual ? '\n' : '') + 'Tarea sin finalizar por ' + DIAS_PARA_LIBERAR_ASIGNADA + ' dias desde la asignacion. Liberada automaticamente el ' + formatDate_(now_()) + '.';
      sh.getRange(item._row, cEstado).setValue('Disponible');
      sh.getRange(item._row, cUltimo).setValue(anterior);
      sh.getRange(item._row, cAsignado).setValue('');
      sh.getRange(item._row, cFechaAsignacion).setValue('');
      sh.getRange(item._row, cObs).setValue(obsNueva);
      sh.getRange(item._row, cUpd).setValue(formatDate_(now_()));
      count++;
    }
  });
  return count;
}

function findPizarraById_(id) {
  const data = getPizarraData_();
  const item = data.items.find(x => String(x.ID) === String(id));
  if (!item) throw new Error('No se encontro la tarea ID ' + id);
  return { ...data, item };
}

function assignTask_(params) {
  const user = String(params.user || '').trim();
  if (!user) throw new Error('Falta el nombre de quien toma la tarea.');
  const { sh, headers, item } = findPizarraById_(params.id);
  if (String(item.ESTADO).trim() !== 'Disponible') {
    throw new Error('La tarea no esta disponible.');
  }
  sh.getRange(item._row, colIndex_(headers, 'ESTADO')).setValue('Asignada');
  sh.getRange(item._row, colIndex_(headers, 'ASIGNADO_A')).setValue(user);
  sh.getRange(item._row, colIndex_(headers, 'FECHA_ASIGNACION')).setValue(formatDate_(now_()));
  sh.getRange(item._row, colIndex_(headers, 'ULTIMA_ACTUALIZACION')).setValue(formatDate_(now_()));
  return { ok: true, message: 'Tarea asignada.' };
}

function finishTask_(params) {
  const { sh, headers, item } = findPizarraById_(params.id);
  const obsCierre = String(params.observaciones || '').trim();
  const obsActual = item.OBSERVACIONES || '';
  const obsNueva = obsCierre ? String(obsActual) + (obsActual ? '\n' : '') + 'Cierre: ' + obsCierre : obsActual;

  sh.getRange(item._row, colIndex_(headers, 'ESTADO')).setValue('Finalizada');
  sh.getRange(item._row, colIndex_(headers, 'FECHA_FINALIZACION')).setValue(formatDate_(now_()));
  sh.getRange(item._row, colIndex_(headers, 'OBSERVACIONES')).setValue(obsNueva);
  sh.getRange(item._row, colIndex_(headers, 'ULTIMA_ACTUALIZACION')).setValue(formatDate_(now_()));
  return { ok: true, message: 'Tarea finalizada.' };
}

function adminUpdate_(params) {
  if (String(params.adminPass || '') !== ADMIN_PASS) throw new Error('Clave de administrador incorrecta.');
  const { sh, headers, item } = findPizarraById_(params.id);

  if (params.prioridad !== undefined) sh.getRange(item._row, colIndex_(headers, 'PRIORIDAD')).setValue(params.prioridad);
  if (params.tiempoEstimadoDias !== undefined) sh.getRange(item._row, colIndex_(headers, 'TIEMPO_ESTIMADO_DIAS')).setValue(params.tiempoEstimadoDias);
  if (params.fechaVencimiento) sh.getRange(item._row, colIndex_(headers, 'FECHA_VENCIMIENTO')).setValue(params.fechaVencimiento);
  if (params.observaciones !== undefined) sh.getRange(item._row, colIndex_(headers, 'OBSERVACIONES')).setValue(params.observaciones);
  sh.getRange(item._row, colIndex_(headers, 'ULTIMA_ACTUALIZACION')).setValue(formatDate_(now_()));

  return { ok: true, message: 'Tarea actualizada.' };
}

function createTaskFromNovedad_(params) {
  const id = createPizarraTask_({
    origen: params.origen || 'Novedad equipamiento',
    ubicacion: params.ubicacion || '',
    elemento: params.elemento || '',
    tarea: params.tarea || params.novedad || '',
    prioridad: params.prioridad || '',
    tiempoEstimadoDias: params.tiempoEstimadoDias || '',
    fechaVencimiento: params.fechaVencimiento || '',
    observaciones: params.observaciones || '',
    fotos: params.fotos || '',
    creadoPor: params.creadoPor || params.usuario || ''
  });
  return { ok: true, message: 'Tarea creada desde novedad.', id };
}

function createPizarraTask_(data) {
  const { sh, headers, items } = getPizarraData_();
  const id = nextId_(items);
  const row = headers.map(h => '');
  const fechaAlta = formatDate_(now_());
  const dias = data.tiempoEstimadoDias || '';
  let vencimiento = data.fechaVencimiento || '';
  if (!vencimiento && dias !== '') {
    const d = now_();
    d.setDate(d.getDate() + Number(dias));
    vencimiento = onlyDate_(d);
  }

  setRowValue_(row, headers, 'ID', id);
  setRowValue_(row, headers, 'FECHA_ALTA', fechaAlta);
  setRowValue_(row, headers, 'ORIGEN', data.origen || 'Novedad equipamiento');
  setRowValue_(row, headers, 'UBICACION', data.ubicacion || '');
  setRowValue_(row, headers, 'ELEMENTO', data.elemento || '');
  setRowValue_(row, headers, 'TAREA', data.tarea || '');
  setRowValue_(row, headers, 'PRIORIDAD', data.prioridad || '');
  setRowValue_(row, headers, 'TIEMPO_ESTIMADO_DIAS', dias);
  setRowValue_(row, headers, 'FECHA_VENCIMIENTO', vencimiento);
  setRowValue_(row, headers, 'ESTADO', 'Disponible');
  setRowValue_(row, headers, 'OBSERVACIONES', data.observaciones || '');
  setRowValue_(row, headers, 'FOTOS', data.fotos || '');
  setRowValue_(row, headers, 'CREADO_POR', data.creadoPor || '');
  setRowValue_(row, headers, 'ULTIMA_ACTUALIZACION', fechaAlta);

  sh.appendRow(row);
  return id;
}

/*************** MAIL DIARIO 23 HS ***************/
function sendDailyNews() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('NOVEDADES');
  if (!sh || sh.getLastRow() < 2) return;
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const enviadoIdx = headers.indexOf('Enviado');
  const pending = values.slice(1)
    .map((row, i) => ({ row, rowNumber: i + 2 }))
    .filter(x => !x.row[enviadoIdx]);
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

function colIndex_(headers, name) {
  const idx = headers.indexOf(name);
  if (idx === -1) throw new Error('Falta la columna: ' + name);
  return idx + 1;
}

function setRowValue_(row, headers, name, value) {
  const idx = headers.indexOf(name);
  if (idx !== -1) row[idx] = value;
}

function now_() {
  return new Date();
}

function formatDate_(date) {
  if (!date) return '';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
  return Utilities.formatDate(new Date(date), tz, 'yyyy-MM-dd HH:mm');
}

function onlyDate_(date) {
  if (!date) return '';
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
  return Utilities.formatDate(new Date(date), tz, 'yyyy-MM-dd');
}

function parseDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function daysSince_(value) {
  const d = parseDate_(value);
  if (!d) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / (1000 * 60 * 60 * 24));
}

function nextId_(items) {
  const maxId = items.reduce((max, item) => {
    const n = Number(item.ID);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  return maxId + 1;
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
  if (ar) return `${ar[3]}-${String(ar[2]).padStart(2, '0')}-${String(ar[1]).padStart(2, '0')}`;

  const parsed = new Date(text);
  if (!isNaN(parsed)) return Utilities.formatDate(parsed, tz, 'yyyy-MM-dd');

  return text;
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

function isInternalSheet_(name) {
  return INTERNAL_SHEETS.includes(String(name || '').trim().toUpperCase());
}

function normalizeDay_(s) {
  const clean = normalizeHeader_(s);
  const map = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miercoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sabado',
    domingo: 'Domingo'
  };
  return map[clean] || '';
}

function esc(v) {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

/*************** PRUEBAS MANUALES ***************/
function pruebaCrearTarea() {
  const res = createTaskFromNovedad_({
    origen: 'Prueba manual',
    ubicacion: 'Movil 1',
    elemento: 'Linterna',
    tarea: 'Revisar bateria / carga.',
    prioridad: '',
    tiempoEstimadoDias: '7',
    usuario: 'Prueba'
  });
  Logger.log(res);
}
