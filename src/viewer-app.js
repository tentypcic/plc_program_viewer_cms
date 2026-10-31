const __nativeStorage = window.localStorage;
const __safeStorage = PPVSafety.storage(__nativeStorage, e => alert('Nie zapisano projektu: ' + e.message + '\nWyeksportuj JSON przed zamknięciem karty.'));
let __unsaved = false;
const __params = new URLSearchParams(location.search);
let __initialList = [];
try { __initialList = PPVSafety.list(JSON.parse(__safeStorage.getItem('ppv.projects') || '[]')); }
catch(e) { alert('Nie można odczytać listy projektów: ' + e.message); throw e; }
const __initialProject = __params.has('pid') ? __initialList.find(p=>p.id===__params.get('pid')) : __initialList.find(p=>p.slug===__params.get('slug'));
if((__params.has('pid') || __params.has('slug')) && !__initialProject) { alert('Projekt nie istnieje.'); throw Error('Unknown project'); }
let __expectedProject = __initialProject ? JSON.stringify(__initialProject) : null;
let __initialPayload = __initialProject?.inlineData ? PPVSafety.project(__initialProject.inlineData) : null;
// Legacy standalone state is read only when no explicit project was requested.
const __draft = new Map();
const __standaloneDraft = !__initialProject && !__params.has("project") ? sessionStorage.getItem("ppv.standalone") : null;
const __standalonePayload = __standaloneDraft ? PPVSafety.project(__standaloneDraft) : null;
if(__standalonePayload) __initialPayload=__standalonePayload;
for(const key of ['menuData','pageTitle','pageEdited','pageDate','activePdf']) {
  const value = __initialPayload ? ({menuData:JSON.stringify(__initialPayload.menuData),pageTitle:__initialPayload.title || __initialProject?.name || "Project",pageEdited:__initialPayload.date})[key] : (!__initialProject && !__params.has('project') ? __nativeStorage.getItem(key) : null);
  if(value != null) __draft.set(key,value);
}
const __viewKey = 'ppv.view.' + (__initialProject?.id || 'standalone');
const __lastPdf = sessionStorage.getItem(__viewKey);
if(__lastPdf) { try { PPVSafety.safeUrl(__lastPdf,location.href); __draft.set('activePdf',__lastPdf); } catch {} }
const localStorage = {getItem:k=>k==='ppv.projects'?__safeStorage.getItem(k):(__draft.get(k) ?? null), setItem(k,v){if(k==='ppv.projects') __safeStorage.setItem(k,v);else { __draft.set(k,String(v)); if(k==='activePdf') sessionStorage.setItem(__viewKey,String(v)); }}, removeItem:k=>{__draft.delete(k);if(k==='activePdf')sessionStorage.removeItem(__viewKey);}};
window.addEventListener('beforeunload',e=>{if(__unsaved){e.preventDefault();e.returnValue='';}});
let editMode = false;
let editTarget = null;

let menuData = [
  { title: "Program blocks", icon: '<img class="icon" src="images/program_blocks.png">', items: [] },
  { title: "PLC tags",       icon: '<img class="icon" src="images/plc_tags.png">',       items: [] },
  { title: "PLC data types", icon: '<img class="icon" src="images/plc_data_types.png">', items: [] }
];
const defaultMenuData = JSON.parse(JSON.stringify(menuData));

const __LS_LIST_KEY = "ppv.projects";
let __PID = new URLSearchParams(location.search).get("pid") || null;
const __slugParam = new URLSearchParams(location.search).get("slug") || null;
if (!__PID && __slugParam) {
  try {
    const list = JSON.parse(localStorage.getItem(__LS_LIST_KEY) || "[]");
    const found = list.find(p => p && p.slug === __slugParam);
    if (found) __PID = found.id;
  } catch (_){}
}

function __snapshot() {
  const title = localStorage.getItem("pageTitle")
           || (typeof document !== "undefined" && document.getElementById("titleText")
               ? document.getElementById("titleText").textContent
               : "Project");
  const date  = localStorage.getItem("pageEdited") || new Date().toISOString();
  return { title, date, menuData };
}

(function(){
  if (typeof document === "undefined") return;

  // Tworzymy tylko element, bez stylu inline
  const el = document.createElement('div');
  el.className = 'ppv-toast';
  el.id = 'ppvToast';
  el.setAttribute('role','status');
  el.setAttribute('aria-live','polite');
  document.body && document.body.appendChild(el);
})();


function flashSaved(msg){
  try{
    const el = document.getElementById('ppvToast');
    if(!el) return;
    el.textContent = __unsaved || __safeStorage.failed ? 'Nie zapisano zmian — wyeksportuj JSON' : (msg || 'Changes saved ✅');
    el.classList.add('show');
    clearTimeout(flashSaved.__t);
    flashSaved.__t = setTimeout(()=>{ el.classList.remove('show'); }, 1400);
  }catch(_){ /* no-op */ }
}

(function(){
  if (typeof document === "undefined") return;

  function ensureBackLink(){
    let a = document.querySelector("a.back-link");
    if(!a){
      const hdr = document.querySelector("header") || document.body;
      a = document.createElement("a");
      a.className = "back-link";
      a.textContent = "← Projects";
      a.href = "index.html";
      a.style.cssText = "position:fixed;left:16px;top:12px;text-decoration:none;font:600 14px system-ui;z-index:999;";
      hdr.insertBefore(a, hdr.firstChild);
    }
    return a;
  }

  function updateBackHref(){
    try{
      const a = ensureBackLink();
      const url = new URL("index.html", location.href);
      url.searchParams.delete("inline64");

      a.href = url.pathname + url.search;
    }catch(_){}
  }

  document.addEventListener("DOMContentLoaded", updateBackHref);

  const __oldSetEditedNow = window.setEditedNow;
  window.setEditedNow = function(){
    try{ __oldSetEditedNow && __oldSetEditedNow(); }catch(_){}
    updateBackHref();
  };
})();


function __persistToIndex() {
  if(!__PID) return;
  try {
    const list=PPVSafety.list(JSON.parse(localStorage.getItem(__LS_LIST_KEY) || '[]'));
    const result=PPVSafety.updateProject(list,__PID,__expectedProject,__snapshot());
    localStorage.setItem(__LS_LIST_KEY,JSON.stringify(result.list));
    __expectedProject=result.expected;
    __unsaved=false;
  } catch(e) { __unsaved=true; alert('Nie zapisano projektu: '+e.message+' Wyeksportuj bieżący JSON.'); }
}

function __applyInlineDataToProject(p){
  if (!p) return p;
  try{
    if (p.inlineData) {
      const s = JSON.parse(p.inlineData);
      if (s && typeof s === "object") {
        if (s.title) p.name = s.title;
        if (s.date)  p.date = s.date;
      }
    }
  }catch(_){}
  return p;
}

let __PROJECT_PARAM = null;
try { __PROJECT_PARAM = new URLSearchParams(location.search).get("project") || null; } catch(_) {}

function __persistToSession(){
  try{
    if(!__PROJECT_PARAM) { sessionStorage.setItem("ppv.standalone",JSON.stringify(__snapshot())); return; }
    if(!__PROJECT_PARAM.startsWith("ls:")) return;
    const key = __PROJECT_PARAM.slice(3);
    const snap = __snapshot();
    const payload = { title: snap.title, date: snap.date, menuData: snap.menuData };
    sessionStorage.setItem(key, JSON.stringify(payload));
  }catch(e){ __unsaved=true; alert("Nie zapisano kopii roboczej: "+e.message); }
}

function __fmtYMDHM(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  const hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
function updateDateBadge(){
  const el = document.getElementById("dateText");
  if (!el) return;
  const iso = localStorage.getItem("pageEdited") || localStorage.getItem("pageDate") || "";
  let txt = "";
  if (iso){
    const d = new Date(iso);
    if (!isNaN(d)) txt = "· " + __fmtYMDHM(d);
  }
  el.textContent = txt;
}
function setEditedNow(){
  const iso = new Date().toISOString();
  try { localStorage.setItem("pageEdited", iso); } catch(_){}
  try { updateDateBadge(); } catch(_){}
  try { __persistToIndex(); } catch(_){}
  try { __persistToSession(); } catch(_){}
  try { flashSaved(); } catch(_){}
}

function setDateChip(iso){
  if (iso) localStorage.setItem("pageEdited", iso);
  updateDateBadge();
}


const savedData = localStorage.getItem("menuData");
if (savedData) {
  try {
    const savedMenu = JSON.parse(savedData);
    PPVSafety.project({menuData:savedMenu});
    if (Array.isArray(savedMenu)) { menuData.length = 0; menuData.push(...savedMenu); }
  } catch {}
}
const savedTitle = localStorage.getItem("pageTitle");
if (savedTitle) {
  const t = document.getElementById("titleText"); if (t) t.textContent = savedTitle;
}
updateDateBadge();


function tryLoadFromSession(param){
  if(param && param.startsWith("ls:")){
    const key = param.slice(3);
    const txt = sessionStorage.getItem(key);
    if(!txt) return null;
    try{ return JSON.parse(txt); }catch(e){ console.error(e); return null; }
  }
  if(param && param.startsWith("b64:")){
    try{ return JSON.parse(atob(param.slice(4))); }catch(e){ console.error(e); return null; }
  }
  if(param && param.startsWith("data:application/json;base64,")){
    try{ return JSON.parse(atob(param.split(',')[1])); }catch(e){ console.error(e); return null; }
  }
  return null;
}
function getProjectParam(){ const p=new URLSearchParams(location.search).get("project"); return p || null; }
async function loadProjectJson(url){ PPVSafety.safeUrl(url,location.href); const res=await fetch(url); if(!res.ok) throw new Error("Cannot load: " + url); return await res.json(); }
(async function bootstrapFromParam(){
  const url = getProjectParam();
  if (!url || __initialProject) return;
  try{
    const offline = tryLoadFromSession(url);
    const data = PPVSafety.project(offline || await loadProjectJson(url));
    let newMenu = null;
    if (Array.isArray(data)) newMenu = data;
    else if (data && Array.isArray(data.menuData)) newMenu = data.menuData;
    if (newMenu) {
      menuData.length = 0; for (const it of newMenu) menuData.push(it);
      localStorage.setItem("menuData", JSON.stringify(menuData));

      if (data.title || data.name) {
        const titleEl = document.getElementById("titleText");
        const newTitle = data.title || data.name;
        if (titleEl) titleEl.textContent = newTitle;
        localStorage.setItem("pageTitle", newTitle);
      }
      if (data.date) { localStorage.setItem("pageEdited", data.date); }
      updateDateBadge();

      __persistToIndex();
      __persistToSession();
      flashSaved();

      if (typeof renderMenu === "function") renderMenu();
    }
  }catch(e){ console.error(e); alert("Błąd wczytywania projektu: " + e.message); }
})();

// ===== UI actions =====
const titleBar = document.querySelector(".title") || document.querySelector("header p");
if (titleBar) titleBar.addEventListener("click", (e) => {
  if (e.target.id === "editTitleBtn") return;
  openDocument("default.html");
  localStorage.removeItem("activePdf");
  document.querySelectorAll(".group-label.active").forEach(el => el.classList.remove("active"));
});

const editTitleBtn = document.getElementById("editTitleBtn");
if (editTitleBtn) editTitleBtn.onclick = () => {
  editTarget = { isTitle: true, text: document.getElementById("titleText").textContent };
  document.getElementById("editText").value = editTarget.text;
  document.getElementById("editLinkGroup").style.display = "none";
  document.getElementById("editOverlay").style.display = "flex";
};

function getIconSrc(text, sectionTitle = "", item = null) {
  if (sectionTitle === "PLC tags") return 'images/tag_table.png';
  if (item?.fblock && sectionTitle === "PLC data types") return 'images/f_udt.png';
  if (sectionTitle === "PLC data types") return 'images/udt.png';
  if (item?.fblock && text.includes('[OB')) return 'images/f_ob.png';
  if (item?.fblock && text.includes('[FB')) return 'images/f_fb.png';
  if (item?.fblock && text.includes('[FC')) return 'images/f_fc.png';
  if (item?.fblock && text.includes('[DB')) return 'images/f_db.png';
  if (text.includes('[OB')) return 'images/ob.png';
  if (text.includes('[FB')) return 'images/fb.png';
  if (text.includes('[FC')) return 'images/fc.png';
  if (text.includes('[DB')) return 'images/db.png';
  return 'images/unknown.png';
}

function openDocument(link){
  PPVSafety.safeUrl(link,location.href);
  const iframe=document.getElementById('pdfViewer');
  const trusted=new URL(link,location.href).href===new URL('default.html',location.href).href;
  iframe.setAttribute('sandbox',trusted?'allow-scripts allow-same-origin':'allow-same-origin allow-downloads');
  iframe.src=link;
}
function loadPDF(link){ openDocument(link); localStorage.setItem('activePdf',link); }

function buildItem(item, parentList, sectionTitle = ""){
  const li = document.createElement("li");
  li._data = item; li._parent = parentList;
  const row = document.createElement("div"); row.className = "menu-row";
  const icon = document.createElement("img"); icon.className="icon"; icon.src = getIconSrc(item.text, sectionTitle, item);
  const label = document.createElement("span"); label.className="group-label"; label.textContent = item.text;

  let arrow;
  if (item.children){
    li.classList.add("group");
    arrow = document.createElement("span"); arrow.className="arrow"; arrow.textContent = "▶";
    row.appendChild(arrow); row.appendChild(icon); row.appendChild(label);
  } else {
    row.appendChild(icon); row.appendChild(label);
  }

  if (editMode){
    const controls = document.createElement("span"); controls.className="edit-controls";
    const editBtn = document.createElement("button"); editBtn.textContent="✏️";
    editBtn.onclick = (ev) => { ev.stopPropagation();
      editTarget = item;
      document.getElementById("editText").value = item.text;
      document.getElementById("editLinkGroup").style.display = item.link !== undefined ? "block" : "none";
      document.getElementById("editLink").value = item.link || "";
      document.getElementById("editOverlay").style.display = "flex";
    };
    const delBtn = document.createElement("button"); delBtn.textContent="🗑";
    delBtn.onclick = (ev) => { ev.stopPropagation();
      if(!confirm("Usunąć element wraz z podgrupami?")) return;
      const idx = parentList.indexOf(item);
      if (idx > -1) parentList.splice(idx, 1);
      setEditedNow();
      localStorage.setItem("menuData", JSON.stringify(menuData));
      __persistToIndex();
      __persistToSession();
      flashSaved();
      renderMenu();
    };
    controls.appendChild(editBtn); controls.appendChild(delBtn); row.appendChild(controls);
  }

  li.appendChild(row);

  if (item.children){
    const submenu = document.createElement("ul"); submenu.classList.add("submenu");
    // ⬇️ ważne: przekazujemy sectionTitle, żeby ikony się zgadzały
    item.children.forEach(child => submenu.appendChild(buildItem(child, item.children, sectionTitle)));
    li.appendChild(submenu);
    li.addEventListener("click", e => {
      if (e.target === li || e.target === row || e.target === label || e.target === arrow) {
        const isOpen = submenu.style.display === "block";
        submenu.style.display = isOpen ? "none" : "block";
        arrow.textContent = isOpen ? "▶" : "▼";
      }
    });
    icon.src = "images/group.png";
  } else {
    label.style.cursor = "pointer";
    label.addEventListener("click", e => {
      e.preventDefault();
      document.querySelectorAll(".group-label").forEach(el => el.classList.remove("active"));
      label.classList.add("active");
      loadPDF(item.link);
    });
  }

  return li;
}

function renderMenu(){
  const container = document.getElementById("menuContainer");
  container.innerHTML = "";
  menuData.forEach(section => {
    const h4 = document.createElement("h4");
    const icon=document.createElement('img'); icon.className='icon';
    icon.src=section.title==='PLC tags'?'images/plc_tags.png':section.title==='PLC data types'?'images/plc_data_types.png':'images/program_blocks.png';
    h4.append(icon, document.createTextNode(' '+section.title));
    container.appendChild(h4);
    const ul = document.createElement("ul");
    section.items.forEach(item => ul.appendChild(buildItem(item, section.items, section.title)));
    container.appendChild(ul);
  });
}

function setupDialogs(){
  document.getElementById("confirmEdit").onclick = () => {
    const newText = document.getElementById("editText").value.trim();
    const newLink = document.getElementById("editLink").value.trim();
    const errorBox = document.getElementById("editError");

    if (!newText || (editTarget?.link !== undefined && !newLink)) {
      errorBox.textContent = "Please fill in all fields.";
      errorBox.style.display = "block";
      setTimeout(() => errorBox.style.display = "none", 3000);
      return;
    }

    if(editTarget?.link !== undefined) { try { PPVSafety.safeUrl(newLink,location.href); } catch(e) { errorBox.textContent=e.message; errorBox.style.display="block"; return; } }
    if (editTarget && editTarget.isTitle) {
      document.getElementById("titleText").textContent = newText;
      localStorage.setItem("pageTitle", newText);
      setEditedNow();
    } else {
      editTarget.text = newText;
      if (editTarget.link !== undefined) editTarget.link = newLink;
      setEditedNow();
      localStorage.setItem("menuData", JSON.stringify(menuData));
      __persistToIndex();
      __persistToSession();
      flashSaved();
      renderMenu();
      highlightLastActive();
    }
    document.getElementById("editOverlay").style.display = "none";
  };

  document.getElementById("cancelEdit").onclick = () => {
    document.getElementById("editOverlay").style.display = "none";
  };
}

function highlightLastActive(){
  const lastPdf = localStorage.getItem("activePdf");
  if (lastPdf){
    try { PPVSafety.safeUrl(lastPdf,location.href); } catch { return; }
    const labels = document.querySelectorAll(".menu .group-label");
    labels.forEach(label => {
      const item = label.parentElement.parentElement._data;
      if (item?.link === lastPdf) label.classList.add("active");
    });
    openDocument(lastPdf);
  }
}

const toggleBtn = document.getElementById("toggleEdit");
if (toggleBtn) toggleBtn.onclick = () => {
  editMode = !editMode;
  const ids = ["addBlock","addGroup","reset","exportStatic","editTitleBtn"];
  ids.forEach(id=>{ const el = document.getElementById(id); if(el){ el.style.display = editMode ? "inline" : "none"; } });
  renderMenu();
};

// ===== Export / Import =====
document.getElementById("saveJson").onclick = () => {
  const title = localStorage.getItem("pageTitle") || document.getElementById("titleText")?.textContent || "";
  const date  = localStorage.getItem("pageEdited") || new Date().toISOString();
  const exportObj = { title, date, menuData };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "project.json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),0);
};

document.getElementById("reset").onclick = () => {
  if(!confirm("Wyczyścić strukturę tego projektu? Najpierw wyeksportuj JSON.")) return;
  menuData.length = 0;
  menuData.push(...JSON.parse(JSON.stringify(defaultMenuData)));
  localStorage.removeItem("menuData");
  __persistToIndex();
  __persistToSession();
  flashSaved();
  renderMenu();
};

setupDialogs();
renderMenu();
highlightLastActive();

let __targetArrays = [];
function populateTargetOptions(){
  __targetArrays = [];
  const select = document.getElementById("targetPath");
  select.innerHTML = "";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = "Select target location...";
  placeholderOption.disabled = true; placeholderOption.selected = true;
  select.appendChild(placeholderOption);
  menuData.forEach(section => {
    select.appendChild(new Option(section.title, String(__targetArrays.push(section.items)-1)));
    section.items.forEach(item => addGroupOptions(item, section.title));
  });

  function addGroupOptions(item, basePath){
    if (item.children){
      const fullPath = basePath + " > " + item.text;
      select.appendChild(new Option(fullPath, String(__targetArrays.push(item.children)-1)));
      item.children.forEach(child => addGroupOptions(child, fullPath));
    }
  }
}

function openAddDialog(type){
  document.getElementById("dialogTitle").textContent = (type === "group") ? "Add Group" : "Add Block";
  document.getElementById("nameLabel").textContent = (type === "group") ? "Group Name:" : "Block Name:";
  document.getElementById("newName").value = "";
  document.getElementById("newLink").value = "";
  document.getElementById("linkField").style.display = (type === "group") ? "none" : "";
  document.getElementById("fbOptions").style.display = (type === "block") ? "block" : "none";
  document.getElementById("createFBlock").checked = false;
  document.getElementById("overlay").dataset.type = type;
  populateTargetOptions();
  document.getElementById("overlay").style.display = "flex";
}

document.getElementById("addBlock").onclick = () => openAddDialog("block");
document.getElementById("addGroup").onclick = () => openAddDialog("group");

document.getElementById("confirmAdd").onclick = () => {
  const overlay = document.getElementById("overlay");
  const type = overlay.dataset.type;
  const targetPath = document.getElementById("targetPath").value;
  const newName = document.getElementById("newName").value.trim();
  const newLink = document.getElementById("newLink").value.trim();
  const errorBox = document.getElementById("formError");

  if (!targetPath || !newName || (type === "block" && !newLink)) {
    errorBox.textContent = "Please fill in all fields.";
    errorBox.style.display = "block";
    setTimeout(() => errorBox.style.display = "none", 3000);
    return;
  }

  if(type === "block") { try { PPVSafety.safeUrl(newLink,location.href); } catch(e) { errorBox.textContent=e.message; errorBox.style.display="block"; return; } }
  errorBox.style.display = "none";
  const parentArray = __targetArrays[Number(targetPath)];
  if(!parentArray) return;

  if (type === "block") {
    const isFBlock = document.getElementById("createFBlock").checked;
    parentArray.push({ text: newName, link: newLink, fblock: isFBlock });
  } else {
    parentArray.push({ text: newName, children: [] });
  }

  parentArray.sort((a, b) => {
    const isGroupA = !!a.children, isGroupB = !!b.children;
    if (isGroupA && !isGroupB) return 1;
    if (!isGroupA && isGroupB) return -1;
    function getPriority(text){
      if (text.includes('[OB')) return 1;
      if (text.includes('[FC')) return 2;
      if (text.includes('[FB')) return 3;
      if (text.includes('[DB')) return 4;
      return 5;
    }
    return getPriority(a.text) - getPriority(b.text) || a.text.localeCompare(b.text);
  });

  document.getElementById("overlay").style.display = "none";
  setEditedNow();
  localStorage.setItem("menuData", JSON.stringify(menuData));
  __persistToIndex();
  __persistToSession();
  flashSaved();
  renderMenu();
};

document.getElementById("cancelAdd").onclick = () => {
  document.getElementById("overlay").style.display = "none";
};

// --- Help button -> show default help page instead of current PDF
(function(){
  const help = document.getElementById('helpBtn');
  if (!help) return;
  help.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const iframe = document.getElementById('pdfViewer');
    if (iframe) openDocument('default.html');

    try { localStorage.removeItem('activePdf'); } catch (_) {}
    document.querySelectorAll('.group-label.active')
      .forEach(el => el.classList.remove('active'));
  });
})();
