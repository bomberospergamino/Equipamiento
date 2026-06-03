/* Control de equipamiento - SBVP
   1) Publicá el Apps Script como Web App.
   2) Pegá la URL del despliegue en WEB_APP_URL.
*/
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzYiO560Az_Eo_hPzAxeczftZG4h9M3SEPjm-ACtrKzfdtHj_CRiqCCenM3KkIy6vyx/exec";

const state = {
  agenda: {},
  activities: [],
  responsables: [],
  completedToday: [],
  selectedResponsables: [],
  photos: [],
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
  fechaControl: document.getElementById('fechaControl'),
  responsableSearch: document.getElementById('responsableSearch'),
  selectedResponsables: document.getElementById('selectedResponsables'),
  responsablesList: document.getElementById('responsablesList'),
  fotosControl: document.getElementById('fotosControl'),
  photosPreview: document.getElementById('photosPreview'),
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
  els.fechaControl.value = todayInputValue();
  bindEvents();
  await loadData();
}

function bindEvents(){
  document.getElementById('refreshBtn').addEventListener('click', loadData);
  document.getElementById('allActivitiesBtn').addEventListener('click', showAll);
  document.querySelectorAll('.backHome').forEach(btn => btn.addEventListener('click', showHome));
  els.responsableSearch.addEventListener('input', renderResponsablesList);
  els.responsableSearch.addEventListener('focus', renderResponsablesList);
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.responsables-field')) els.responsablesList.classList.remove('open');
  });
  els.fotosControl.addEventListener('change', handlePhotos);
  els.form.addEventListener('submit', submitForm);
}

async function loadData(){
  try{
    setStatus('Cargando agenda...');
    const data = await fetchJson({ action:'config' });
    state.agenda = data.agenda || {};
    state.activities = data.activities || [];
    state.responsables = data.responsables || [];
    state.completedToday = data.completedToday || [];
    renderResponsablesList();
    if(!state.responsables.length){
      console.warn('No se recibieron responsables desde Apps Script. Revisar permisos del Google Sheets de personal y volver a implementar la Web App.');
    }
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
  const done = state.completedToday.includes(name);
  btn.className = `activity-btn${done ? ' done' : ''}`;
  btn.innerHTML = `
    <span class="activity-text">
      ${escapeHtml(name)}
      <small>${caption}</small>
    </span>
    ${done ? '<span class="done-badge" title="Actividad registrada hoy">✓</span>' : ''}
  `;
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
  els.fechaControl.value = todayInputValue();
  state.selectedResponsables = [];
  state.photos = [];
  els.fotosControl.value = '';
  renderPhotosPreview();
  els.responsableSearch.value = '';
  renderSelectedResponsables();
  renderResponsablesList();
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
    <td data-label="Elemento" class="element-cell">
      <strong>${escapeHtml(row.elemento)}</strong>
    </td>
    <td data-label="Un" class="unit-cell">
      <span class="unit">${escapeHtml(row.cantidadEsperada)}</span>
    </td>
    <td data-label="Cantidad" class="select-cell compact">
      <select class="cantidad-select" data-index="${row.index}">
        <option selected>Bien</option>
        <option>Hay menos</option>
        <option>Hay más</option>
      </select>
    </td>
    <td data-label="Condición" class="select-cell compact">
      <select class="condicion-select" data-index="${row.index}">
        <option selected>Bueno</option>
        <option>Regular</option>
        <option>Malo</option>
      </select>
    </td>
    <td data-label="Observación" class="obs-cell">
      <input type="text" class="obs-input" placeholder="Obs..." />
    </td>`;
  tr.querySelectorAll('select').forEach(select => select.addEventListener('change', () => updateRowState(tr)));
  return tr;
}

function updateRowState(tr){
  const cantidad = tr.querySelector('.cantidad-select').value;
  const condicion = tr.querySelector('.condicion-select').value;
  tr.classList.toggle('row-warning', cantidad !== 'Bien' || condicion === 'Regular');
  tr.classList.toggle('row-bad', condicion === 'Malo');
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
      condicionEstado: row.querySelector('.condicion-select').value,
      observacionFila: row.querySelector('.obs-input').value.trim()
    };
  });

  const responsables = [...state.selectedResponsables];

  return {
    activity: state.currentActivity,
    institution: 'Sociedad Bomberos Voluntarios Pergamino',
    fechaControl: els.fechaControl.value,
    responsable: responsables.join(', '),
    responsables,
    observaciones: els.observaciones.value.trim(),
    photos: state.photos,
    createdAt: new Date().toISOString(),
    responses
  };
}

async function submitForm(e){
  e.preventDefault();
  if(!els.fechaControl.value) return alert('Completá la fecha del control.');
  if(!state.selectedResponsables.length) return alert('Seleccioná al menos un responsable.');
  const payload = collectPayload();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = 'Enviando y generando PDF...';
  try{
    const res = await fetch(WEB_APP_URL, {
      method:'POST',
      body: JSON.stringify({ action:'submit', payload }),
      headers:{ 'Content-Type':'text/plain;charset=utf-8' }
    });
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || 'No se pudo guardar el reporte');
    generateLocalPdf(true);
    alert(`Reporte guardado en Drive y PDF descargado.\n${json.pdfUrl || ''}`);
  }catch(err){
    console.error(err);
    alert(err.message);
  }finally{
    btn.disabled = false; btn.textContent = 'Descargar + Enviar';
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
  doc.text(`Fecha: ${formatDateForDisplay(payload.fechaControl)}`, 14, 42);
  doc.text(`Responsable/s: ${payload.responsable || '-'}`, 14, 49);
  doc.text(`Generado: ${new Date(payload.createdAt).toLocaleString('es-AR')}`, 14, 56);

  const rows = payload.responses.map(r => [
    r.ubicacion,
    r.elemento,
    r.cantidadEsperada,
    r.cantidadEstado,
    r.condicionEstado,
    r.observacionFila || '-'
  ]);

  doc.autoTable({
    startY: 64,
    head: [['Ubicación','Elemento','Un','Cantidad','Condición','Obs.']],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [6,52,82] },
    didParseCell: function(data){
      if(data.section === 'body'){
        const cantidad = data.row.raw[3];
        const condicion = data.row.raw[4];
        if(cantidad !== 'Bien' || condicion === 'Regular') data.cell.styles.fillColor = [255,242,168];
        if(condicion === 'Malo') data.cell.styles.fillColor = [255,214,214];
      }
    }
  });
  let y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12); doc.text('Observaciones generales:', 14, y);
  doc.setFontSize(10);
  const obsLines = doc.splitTextToSize(payload.observaciones || '-', 180);
  doc.text(obsLines, 14, y + 7);
  y = y + 12 + (obsLines.length * 5);

  if(payload.photos && payload.photos.length){
    if(y > 245){ doc.addPage(); y = 16; }
    doc.setFontSize(12); doc.text('Fotos del control:', 14, y);
    y += 7;

    payload.photos.forEach((photo, index) => {
      try{
        if(y > 215){ doc.addPage(); y = 16; }
        const maxW = 82;
        const maxH = 62;
        const dims = fitImage(photo.width || 800, photo.height || 600, maxW, maxH);
        const x = (index % 2 === 0) ? 14 : 108;
        if(index % 2 === 0 && index > 0) y += 72;
        if(y > 215){ doc.addPage(); y = 16; }
        doc.addImage(photo.dataUrl, 'JPEG', x, y, dims.w, dims.h);
        doc.setFontSize(8);
        doc.text(photo.name || `Foto ${index + 1}`, x, y + dims.h + 4, { maxWidth: maxW });
        if(index % 2 === 1) y += 72;
      }catch(err){
        console.warn('No se pudo agregar foto al PDF local', err);
      }
    });
  }

  const filename = `Control_${payload.activity}_${new Date().toISOString().slice(0,10)}.pdf`.replaceAll(' ','_');
  if(download) doc.save(filename);
  return doc;
}



async function handlePhotos(event){
  const files = Array.from(event.target.files || []);
  const remaining = Math.max(0, 6 - state.photos.length);
  const selected = files.slice(0, remaining);

  if(files.length > remaining){
    alert('Se permiten hasta 6 fotos por control.');
  }

  for(const file of selected){
    try{
      const photo = await fileToCompressedPhoto(file);
      state.photos.push(photo);
    }catch(err){
      console.error(err);
      alert(`No se pudo cargar la foto: ${file.name}`);
    }
  }

  els.fotosControl.value = '';
  renderPhotosPreview();
}

function renderPhotosPreview(){
  els.photosPreview.innerHTML = '';
  if(!state.photos.length) return;

  state.photos.forEach((photo, index) => {
    const item = document.createElement('div');
    item.className = 'photo-item';
    item.innerHTML = `
      <img src="${photo.dataUrl}" alt="${escapeHtml(photo.name || 'Foto del control')}" />
      <button type="button" aria-label="Quitar foto">×</button>
    `;
    item.querySelector('button').addEventListener('click', () => {
      state.photos.splice(index, 1);
      renderPhotosPreview();
    });
    els.photosPreview.appendChild(item);
  });
}

function fileToCompressedPhoto(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxSide = 1100;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        resolve({
          name: file.name,
          type: 'image/jpeg',
          width: canvas.width,
          height: canvas.height,
          dataUrl
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function fitImage(width, height, maxW, maxH){
  const ratio = Math.min(maxW / width, maxH / height);
  return { w: width * ratio, h: height * ratio };
}

function renderResponsablesList(){
  const q = normalizeText(els.responsableSearch.value);
  const selected = new Set(state.selectedResponsables);
  const filtered = state.responsables
    .filter(name => !selected.has(name))
    .filter(name => !q || normalizeText(name).includes(q))
    .slice(0, 80);

  els.responsablesList.innerHTML = '';
  if(!filtered.length){
    els.responsablesList.innerHTML = '<div class="responsable-empty">Sin coincidencias</div>';
  }else{
    filtered.forEach(name => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'responsable-option';
      btn.textContent = name;
      btn.addEventListener('click', () => addResponsable(name));
      els.responsablesList.appendChild(btn);
    });
  }

  if(document.activeElement === els.responsableSearch || q) els.responsablesList.classList.add('open');
}

function addResponsable(name){
  if(!state.selectedResponsables.includes(name)) state.selectedResponsables.push(name);
  els.responsableSearch.value = '';
  renderSelectedResponsables();
  renderResponsablesList();
  els.responsableSearch.focus();
}

function removeResponsable(name){
  state.selectedResponsables = state.selectedResponsables.filter(x => x !== name);
  renderSelectedResponsables();
  renderResponsablesList();
}

function renderSelectedResponsables(){
  els.selectedResponsables.innerHTML = '';
  state.selectedResponsables.forEach(name => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escapeHtml(name)} <button type="button" aria-label="Quitar ${escapeHtml(name)}">×</button>`;
    tag.querySelector('button').addEventListener('click', () => removeResponsable(name));
    els.selectedResponsables.appendChild(tag);
  });
}

function todayInputValue(){
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0,10);
}

function formatDateForDisplay(value){
  if(!value) return '-';
  const [y,m,d] = value.split('-');
  if(!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function normalizeText(value){
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function showHome(){ els.homeView.classList.remove('hidden'); els.allView.classList.add('hidden'); els.formView.classList.add('hidden'); }
function showAll(){ els.homeView.classList.add('hidden'); els.allView.classList.remove('hidden'); els.formView.classList.add('hidden'); }
function showForm(){ els.homeView.classList.add('hidden'); els.allView.classList.add('hidden'); els.formView.classList.remove('hidden'); }
function escapeHtml(str){ return String(str ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

init();
