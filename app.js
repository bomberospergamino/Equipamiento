/* Control de equipamiento - SBVP
   1) Publicá el Apps Script como Web App.
   2) Pegá la URL del despliegue en WEB_APP_URL.
*/
const WEB_APP_URL = 'PEGAR_URL_WEB_APP_DE_APPS_SCRIPT';

const state = {
  agenda: {},
  activities: [],
  currentActivity: null,
  currentItems: []
};

const els = {
  homeView: document.getElementById('homeView'),
  allView: document.getElementById('allView'),
  formView: document.getElementById('formView'),
  statusBox: document.getElementById('statusBox'),
  todayActivities: document.getElementById('todayActivities'),
  allActivities: document.getElementById('allActivities'),
  todayLabel: document.getElementById('todayLabel'),
  activityTitle: document.getElementById('activityTitle'),
  itemsContainer: document.getElementById('itemsContainer'),
  form: document.getElementById('controlForm'),
  responsable: document.getElementById('responsable'),
  turno: document.getElementById('turno'),
  observaciones: document.getElementById('observaciones')
};

const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const todayName = dayNames[new Date().getDay()];

function apiUrl(params){
  const url = new URL(WEB_APP_URL);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function fetchJson(params){
  if(!WEB_APP_URL || WEB_APP_URL.includes('PEGAR_URL')) throw new Error('Falta configurar WEB_APP_URL en app.js');
  const res = await fetch(apiUrl(params));
  if(!res.ok) throw new Error('No se pudo conectar con la fuente de datos');
  return await res.json();
}

async function init(){
  els.todayLabel.textContent = `Agenda diaria · ${todayName}`;
  bindEvents();
  await loadData();
}

function bindEvents(){
  document.getElementById('refreshBtn').addEventListener('click', loadData);
  document.getElementById('allActivitiesBtn').addEventListener('click', showAll);
  document.querySelectorAll('.backHome').forEach(btn => btn.addEventListener('click', showHome));
  document.getElementById('downloadPdfBtn').addEventListener('click', () => generateLocalPdf(true));
  els.form.addEventListener('submit', submitForm);
}

async function loadData(){
  try{
    setStatus('Cargando agenda...');
    const data = await fetchJson({ action:'config' });
    state.agenda = data.agenda || {};
    state.activities = data.activities || [];
    renderHome();
    renderAll();
    setStatus('Agenda actualizada correctamente.');
  }catch(err){
    console.error(err);
    setStatus(err.message, true);
  }
}

function setStatus(msg, isError=false){
  els.statusBox.textContent = msg;
  els.statusBox.classList.toggle('error', isError);
}

function renderHome(){
  const list = state.agenda[todayName] || [];
  els.todayActivities.innerHTML = '';
  if(!list.length){
    els.todayActivities.innerHTML = '<p>No hay actividades programadas para hoy.</p>';
    return;
  }
  list.forEach(name => els.todayActivities.appendChild(activityButton(name, 'Actividad de hoy')));
}

function renderAll(){
  els.allActivities.innerHTML = '';
  state.activities.forEach(name => els.allActivities.appendChild(activityButton(name, 'Ver formulario')));
}

function activityButton(name, caption){
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'activity-btn';
  btn.innerHTML = `${escapeHtml(name)}<span>${caption}</span>`;
  btn.addEventListener('click', () => openActivity(name));
  return btn;
}

async function openActivity(name){
  try{
    state.currentActivity = name;
    els.activityTitle.textContent = name;
    els.itemsContainer.innerHTML = '<section class="card">Cargando formulario...</section>';
    showForm();
    const data = await fetchJson({ action:'activity', name });
    state.currentItems = data.items || [];
    renderFormItems(state.currentItems);
  }catch(err){
    console.error(err);
    els.itemsContainer.innerHTML = `<section class="card status error">${escapeHtml(err.message)}</section>`;
  }
}

function renderFormItems(items){
  els.form.reset();
  els.itemsContainer.innerHTML = '';
  const grouped = new Map();
  items.forEach((item, index) => {
    const key = item.ubicacion || 'Sin ubicación';
    if(!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({...item, index});
  });

  grouped.forEach((rows, location) => {
    const tpl = document.getElementById('locationTemplate').content.cloneNode(true);
    tpl.querySelector('h3').textContent = location;
    const tbody = tpl.querySelector('tbody');
    rows.forEach(row => tbody.appendChild(itemRow(row)));
    els.itemsContainer.appendChild(tpl);
  });
}

function itemRow(row){
  const tr = document.createElement('tr');
  tr.dataset.index = row.index;
  tr.innerHTML = `
    <td data-label="Elemento - Unidad"><strong>${escapeHtml(row.elemento)}</strong> <span class="unit">Unidad: ${escapeHtml(row.cantidadEsperada)}</span></td>
    <td data-label="Cantidad">
      <select class="cantidad-select" data-index="${row.index}">
        <option selected>Correcto</option>
        <option>Hay más</option>
        <option>Hay menos</option>
      </select>
    </td>
    <td data-label="Condición">
      <select class="condicion-select" data-index="${row.index}">
        <option selected>Bueno</option>
        <option>Regular</option>
        <option>Mal</option>
      </select>
    </td>`;
  tr.querySelectorAll('select').forEach(sel => sel.addEventListener('change', () => updateRowState(tr)));
  return tr;
}

function updateRowState(tr){
  const cantidad = tr.querySelector('.cantidad-select').value;
  const condicion = tr.querySelector('.condicion-select').value;
  tr.classList.toggle('row-warning', cantidad !== 'Correcto' || condicion === 'Regular');
  tr.classList.toggle('row-bad', condicion === 'Mal');
}

function collectPayload(){
  const responses = state.currentItems.map((item, index) => {
    const row = document.querySelector(`tr[data-index="${index}"]`);
    return {
      movil: item.movil,
      ordenUbicacion: item.ordenUbicacion,
      ubicacion: item.ubicacion,
      elemento: item.elemento,
      cantidadEsperada: item.cantidadEsperada,
      cantidadEstado: row.querySelector('.cantidad-select').value,
      condicionEstado: row.querySelector('.condicion-select').value
    };
  });
  return {
    activity: state.currentActivity,
    institution: 'Sociedad Bomberos Voluntarios Pergamino',
    responsable: els.responsable.value.trim(),
    turno: els.turno.value.trim(),
    observaciones: els.observaciones.value.trim(),
    createdAt: new Date().toISOString(),
    responses
  };
}

async function submitForm(e){
  e.preventDefault();
  if(!els.responsable.value.trim()) return alert('Completá el responsable del control.');
  const payload = collectPayload();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try{
    const res = await fetch(WEB_APP_URL, {
      method:'POST',
      body: JSON.stringify({ action:'submit', payload }),
      headers:{ 'Content-Type':'text/plain;charset=utf-8' }
    });
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || 'No se pudo guardar el reporte');
    alert(`Reporte guardado en Drive.\n${json.pdfUrl || ''}`);
  }catch(err){
    console.error(err);
    alert(err.message);
  }finally{
    btn.disabled = false; btn.textContent = 'Guardar en Drive';
  }
}

function generateLocalPdf(download=false){
  const { jsPDF } = window.jspdf;
  const payload = collectPayload();
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  doc.setFontSize(14); doc.text('Sociedad Bomberos Voluntarios Pergamino', 14, 16);
  doc.setFontSize(18); doc.text('Control de equipamiento', 14, 25);
  doc.setFontSize(11);
  doc.text(`Actividad: ${payload.activity}`, 14, 35);
  doc.text(`Responsable: ${payload.responsable || '-'}`, 14, 42);
  doc.text(`Turno/Guardia: ${payload.turno || '-'}`, 14, 49);
  doc.text(`Fecha: ${new Date(payload.createdAt).toLocaleString('es-AR')}`, 14, 56);

  const rows = payload.responses.map(r => [
    r.ubicacion,
    `${r.elemento} - Unidad: ${r.cantidadEsperada}`,
    r.cantidadEstado,
    r.condicionEstado
  ]);

  doc.autoTable({
    startY: 64,
    head: [['Ubicación','Elemento - Unidad','Cantidad','Condición']],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [6,52,82] },
    didParseCell: function(data){
      if(data.section === 'body'){
        const cantidad = data.row.raw[2];
        const condicion = data.row.raw[3];
        if(cantidad !== 'Correcto' || condicion === 'Regular') data.cell.styles.fillColor = [255,242,168];
        if(condicion === 'Mal') data.cell.styles.fillColor = [255,214,214];
      }
    }
  });
  const y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12); doc.text('Observaciones generales:', 14, y);
  doc.setFontSize(10); doc.text(doc.splitTextToSize(payload.observaciones || '-', 180), 14, y + 7);
  const filename = `Control_${payload.activity}_${new Date().toISOString().slice(0,10)}.pdf`.replaceAll(' ','_');
  if(download) doc.save(filename);
  return doc;
}

function showHome(){ els.homeView.classList.remove('hidden'); els.allView.classList.add('hidden'); els.formView.classList.add('hidden'); }
function showAll(){ els.homeView.classList.add('hidden'); els.allView.classList.remove('hidden'); els.formView.classList.add('hidden'); }
function showForm(){ els.homeView.classList.add('hidden'); els.allView.classList.add('hidden'); els.formView.classList.remove('hidden'); }
function escapeHtml(str){ return String(str ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

init();
