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
    el.textContent = msg || 'Changes saved ✅';
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
      const url = new URL(a.getAttribute("href") || "index.html", location.href);
      url.searchParams.delete("inline64");

      const snap = (function(){
        const title = localStorage.getItem("pageTitle")
          || (document.getElementById("titleText")?.textContent || "Project");
        const date  = localStorage.getItem("pageEdited") || new Date().toISOString();
        return { title, date, menuData };
      })();

      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(snap))));
      url.searchParams.set("inline64", b64);

      const usp = new URLSearchParams(location.search);
      const pid = usp.get("pid");
      if (pid) url.searchParams.set("pid", pid);

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
  try {
    const raw = localStorage.getItem(__LS_LIST_KEY) || "[]";
    let list; try { list = JSON.parse(raw); } catch { list = []; }
    if (!Array.isArray(list) || !list.length) return;

    const usp  = new URLSearchParams(location.search);
    const pid  = usp.get("pid");
    const slug = usp.get("slug");

    const title = localStorage.getItem("pageTitle")
               || (document.getElementById("titleText")?.textContent || "Project");
    const date  = localStorage.getItem("pageEdited") || new Date().toISOString();
    const snap  = { title, date, menuData };

    let i = -1;
    if (pid) i = list.findIndex(p => p && p.id === pid);
    if (i < 0 && slug) i = list.findIndex(p => p && p.slug === slug);
    if (i < 0) {
      const t = String(title).toLowerCase();
      i = list.findIndex(p => {
        try {
          const obj = p && p.inlineData ? JSON.parse(p.inlineData) : null;
          const t2  = (obj && (obj.title || obj.name)) || p.name || "";
          return String(t2).toLowerCase() === t;
        } catch { return false; }
      });
    }
    if (i < 0) i = 0;

    list[i] = Object.assign({}, list[i], {
      name: snap.title,
      inlineData: JSON.stringify(snap, null, 2)
    });
    localStorage.setItem(__LS_LIST_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("[PPV] Persist error:", e);
  }
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

try{
  const raw = localStorage.getItem(__LS_LIST_KEY) || "[]";
  let list; try { list = JSON.parse(raw); } catch { list = []; }
  if (Array.isArray(list)) {
    list = list.map(__applyInlineDataToProject);
    localStorage.setItem(__LS_LIST_KEY, JSON.stringify(list));
  }
}catch(e){ console.warn("[PPV] inlineData normalize error:", e); }

let __PROJECT_PARAM = null;
try { __PROJECT_PARAM = new URLSearchParams(location.search).get("project") || null; } catch(_) {}

function __persistToSession(){
  try{
    if(!__PROJECT_PARAM) return;
    if(!__PROJECT_PARAM.startsWith("ls:")) return;
    const key = __PROJECT_PARAM.slice(3);
    const snap = __snapshot();
    const payload = { title: snap.title, date: snap.date, menuData: snap.menuData };
    sessionStorage.setItem(key, JSON.stringify(payload));
  }catch(e){ console.warn("Session persist error:", e); }
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
function getProjectParam(){ const p=new URLSearchParams(location.search).get("project"); return p?decodeURIComponent(p):null; }
async function loadProjectJson(url){ const res=await fetch(url); if(!res.ok) throw new Error("Cannot load: " + url); return await res.json(); }
(async function bootstrapFromParam(){
  const url = getProjectParam();
  if (!url) return;
  try{
    const offline = tryLoadFromSession(url);
    const data = offline || await loadProjectJson(url);
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
  document.getElementById("pdfViewer").src = "default.html";
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

function loadPDF(link){ localStorage.setItem("activePdf", link); document.getElementById("pdfViewer").src = link; }

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
    h4.innerHTML = `${section.icon} ${section.title}`;
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
    const labels = document.querySelectorAll(".menu .group-label");
    labels.forEach(label => {
      const item = label.parentElement.parentElement._data;
      if (item?.link === lastPdf) label.classList.add("active");
    });
    document.getElementById("pdfViewer").src = lastPdf;
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
};

document.getElementById("reset").onclick = () => {
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

function populateTargetOptions(){
  const select = document.getElementById("targetPath");
  select.innerHTML = "";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = "Select target location...";
  placeholderOption.disabled = true; placeholderOption.selected = true;
  select.appendChild(placeholderOption);
  menuData.forEach(section => {
    select.appendChild(new Option(section.title, section.title));
    section.items.forEach(item => addGroupOptions(item, section.title));
  });

  function addGroupOptions(item, basePath){
    if (item.children){
      const fullPath = basePath + " > " + item.text;
      select.appendChild(new Option(fullPath, fullPath));
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

  errorBox.style.display = "none";
  const parts = targetPath.split(" > ");
  const section = menuData.find(sec => sec.title === parts[0]);
  if (!section) return;

  let parentArray = section.items;
  for (let i = 1; i < parts.length; i++) {
    const groupName = parts[i];
    const item = parentArray.find(it => it.text === groupName);
    if (!item) return;
    if (!item.children) item.children = [];
    parentArray = item.children;
  }

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
    if (iframe) iframe.src = 'default.html';

    try { localStorage.removeItem('activePdf'); } catch (_) {}
    document.querySelectorAll('.group-label.active')
      .forEach(el => el.classList.remove('active'));
  });
})();
