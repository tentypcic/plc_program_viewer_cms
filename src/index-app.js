(function(){
  
  function __slugify(str){
    const from = "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ";
    const to   = "acelnoszzACELNOSZZ";
    let s = String(str || "").trim();
    for(let i=0;i<from.length;i++){ s = s.replaceAll(from[i], to[i]); }
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch(_){}
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'project';
  }
  function __uniqueSlug(baseSlug, list, selfId){
    let s = baseSlug || 'project';
    const exists = slug => list.some(p => p && p.slug === slug && p.id !== selfId);
    if(!exists(s)) return s;
    let n = 2; while(exists(`${s}-${n}`)) n++; return `${s}-${n}`;
  }
  function __prettyBase(){
    const {origin, pathname} = location;
    const root = pathname.replace(/index\.html?$/,'').replace(/\/+$/,'') + '/';
    return origin + root;
  }
  function __projectUrl(p){
    const meta = getProjectMeta(p);
    const slug = p.slug || __slugify(p.name || (meta.title || 'project'));
    return __prettyBase() + encodeURIComponent(slug);
  }
  function __toast(msg){
    try{
      const old = document.getElementById('copy-hint'); if(old) old.remove();
      const el = document.createElement('div'); el.id='copy-hint'; el.textContent = msg;
      Object.assign(el.style,{position:'fixed',left:'50%',bottom:'24px',transform:'translateX(-50%)',background:'#1a2442',color:'#fff',padding:'8px 12px',borderRadius:'10px',fontSize:'12px',boxShadow:'0 8px 24px rgba(0,0,0,.25)',zIndex:9999});
      document.body.appendChild(el); setTimeout(()=>el.remove(), 1400);
    }catch(_){}
  }
  function __copyFallback(url){
    const ov=document.createElement('div'); Object.assign(ov.style,{position:'fixed',inset:'0',background:'rgba(0,0,0,.35)',display:'grid',placeItems:'center',zIndex:10000});
    const box=document.createElement('div'); Object.assign(box.style,{background:'#fff',border:'1px solid #bfc6da',borderRadius:'12px',padding:'14px',width:'min(520px,92vw)',boxShadow:'0 8px 28px rgba(0,0,0,.25)'});
    box.innerHTML='<h3 style="margin:0 0 8px;font:600 15px system-ui;color:#1a2442">Copy project link</h3>'+
      '<input id="__copy_url" style="width:100%;padding:10px 12px;border:1px solid #bfc6da;border-radius:10px" readonly>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">'+
      '<button id="__copy_btn" style="border:1px solid #bfc6da;background:#fff;border-radius:10px;padding:8px 12px;cursor:pointer">Copy</button>'+
      '<button id="__close_btn" style="border:0;background:#1a2442;color:#fff;border-radius:10px;padding:8px 12px;cursor:pointer">Close</button>'+
      '</div>';
    ov.appendChild(box); document.body.appendChild(ov);
    const inp=box.querySelector('#__copy_url'); inp.value=url; inp.focus(); inp.select();
    function close(){ ov.remove(); }
    box.querySelector('#__close_btn').addEventListener('click', close);
    box.querySelector('#__copy_btn').addEventListener('click', ()=>{ inp.select(); try{ document.execCommand('copy'); __toast('Link copied'); }catch(_){}});
    ov.addEventListener('click', e=>{ if(e.target===ov) close(); });
  }
  async function __copyProjectLink(pr){
    const url = __projectUrl(pr);
    let ok=false; try{ await navigator.clipboard.writeText(url); ok=true; }catch(_){}
    if(!ok) __copyFallback(url);
    __toast(ok ? 'Link copied: '+url : 'Link ready to copy');
  }

  const LS_KEY = "ppv.projects";
  
(function(){
  try{
    const sp  = new URLSearchParams(location.search);
    const b64 = sp.get("inline64");
    if(!b64) return;

    const pid = sp.get("pid");
    const snap = JSON.parse(decodeURIComponent(escape(atob(b64)))); // {title,date,menuData}

    const raw = localStorage.getItem(LS_KEY) || "[]";
    let list; try { list = JSON.parse(raw); } catch { list = []; }
    if(!Array.isArray(list)) list = [];

    let i = -1;
    if (pid) i = list.findIndex(p => p && p.id === pid);
    if (i < 0) i = 0;

    const next = Object.assign({}, list[i] || {
      id: pid || ((crypto.randomUUID && crypto.randomUUID()) || String(Date.now())),
      name: snap.title || "Project",
      description: "",
      tag: ""
    }, {
      name: snap.title || (list[i]?.name) || "Project",
      inlineData: JSON.stringify({ title: snap.title, date: snap.date, menuData: snap.menuData }, null, 2),
      date: snap.date
    });

    if (i < 0 || !list.length) list = [next]; else list[i] = next;
    localStorage.setItem(LS_KEY, JSON.stringify(list));

    // usuń param z URL, żeby nie stosować dwa razy
    try{
      sp.delete("inline64");
      const clean = location.pathname + (sp.toString() ? ("?" + sp.toString()) : "");
      history.replaceState(null, "", clean);
    }catch(_){}
  }catch(e){
    console.warn("[PPV] inline64 consume error:", e);
  }
})();

  
  
  let projects = [];
  let clampListenerInstalled = false;

  function __uuidv4(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      const r = Math.random()*16|0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Zapis danych do sessionStorage — viewer odbierze przez token "ls:<key>"
  function makeSessionToken(jsonText){
    const key = "ppv.session." + __uuidv4();
    try{ sessionStorage.setItem(key, jsonText); }catch(e){ /* ignore */ }
    return "ls:" + key;
  }

  function getDefaultProjectPayload(){
    const payload = {
      title: "Empty template",
      edited: new Date().toISOString(),
      menuData: [
        { "title":"Program blocks", "icon":"<img class=\"icon\" src=\"images/program_blocks.png\">", "items":[] },
        { "title":"PLC tags",       "icon":"<img class=\"icon\" src=\"images/plc_tags.png\">",      "items":[] },
        { "title":"PLC data types", "icon":"<img class=\"icon\" src=\"images/plc_data_types.png\">","items":[] }
      ]
    };
    return JSON.stringify(payload, null, 2);
  }

  function normalize(p){
    const genId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : __uuidv4();
    return {
      id: p.id || genId,
      name: p.name || "Project",
      description: p.description || "",
      tag: p.tag || "",
      inlineData: p.inlineData || "",
      slug: p.slug || undefined,
      date: p.date || undefined
    };
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

  async function __fetchJsonMaybe(url){
    try{
      const res = await fetch(url, { cache: 'no-store' });
      if(!res.ok) return null;
      return await res.json();
    }catch(_){ return null; }
  }

  async function __importProjectsFromUrl(url){
    const payload = await __fetchJsonMaybe(url);
    if(!payload) return [];
    const arr = Array.isArray(payload) ? payload : (payload.projects || []);
    const out = [];
    for(const p of arr){
      let inline = p.inlineData || p.project || p.payload || null;
      if(!inline && p.src){
        const nested = await __fetchJsonMaybe(p.src);
        if(nested){
          if(nested.inlineData) inline = nested.inlineData;
          else if(nested.menuData) inline = { title: nested.title || p.name || '', date: nested.date || new Date().toISOString(), menuData: nested.menuData };
          else inline = nested;
        }
      }
      if(!inline && (p.menuData || p.title || p.date)){
        inline = { title: p.title || p.name || '', date: p.date || new Date().toISOString(), menuData: p.menuData || [] };
      }
      if(!inline) continue;
      if(!inline.title) inline.title = p.title || p.name || 'Project';
      if(!inline.date) inline.date = p.date || new Date().toISOString();
      out.push(normalize({
        id: p.id,
        name: p.name || inline.title || 'Project',
        description: p.description || '',
        tag: p.tag || '',
        inlineData: typeof inline === 'string' ? inline : JSON.stringify(inline)
      }));
    }
    return out;
  }

  async function __convertImportedData(payload){
    const arr = Array.isArray(payload) ? payload : (payload.projects || [])
    const out = []
    for(const p of arr){
      let inline = p.inlineData || p.project || p.payload || null
      if(!inline && p.menuData){
        inline = { title: p.title || p.name || '', date: p.date || new Date().toISOString(), menuData: p.menuData }
      }
      if(!inline){
        continue
      }
      if(typeof inline !== 'string'){
        if(!inline.title) inline.title = p.title || p.name || 'Project'
        if(!inline.date) inline.date = p.date || new Date().toISOString()
      }
      out.push(normalize({
        id: p.id,
        name: p.name || (typeof inline === 'string' ? 'Project' : (inline.title || 'Project')),
        description: p.description || '',
        tag: p.tag || '',
        inlineData: typeof inline === 'string' ? inline : JSON.stringify(inline)
      }))
    }
    return out
  }

  async function __tryImportProjectList(){
    const params = new URLSearchParams(location.search);
    const replace = params.get('replace') === '1';
    const importParam = params.get('import'); // one or more URLs separated by comma
    const candidates = [];
    if(importParam) importParam.split(',').forEach(u=>{ const s=u.trim(); if(s) candidates.push(s); });
    candidates.push('projects.json'); // default in the same folder

    let list = [];
    for(const url of candidates){
      try{
        list = await __importProjectsFromUrl(url);
        if(list.length) break;
      }catch(_){}
    }
    return list;
  }

  function save(){ localStorage.setItem(LS_KEY, JSON.stringify(projects)); }

  // === Auto-refresh when viewer updates projects in another tab ===
  window.addEventListener('storage', (e)=>{
    try{
      if(e && e.key === LS_KEY){
        const raw = localStorage.getItem(LS_KEY) || "[]";
        let list = JSON.parse(raw);
        if(!Array.isArray(list)) list = [];
        projects = list.map(__applyInlineDataToProject);
        render(projects);
        __toast && __toast('Zaktualizowano listę projektów');
      }
    }catch(_){}
  });

  // ——— odśwież z bfcache przy powrocie z viewera ———
  window.addEventListener('pageshow', () => {
    try{
      const raw = localStorage.getItem(LS_KEY) || "[]";
      let list = JSON.parse(raw);
      if (!Array.isArray(list)) list = [];
      projects = list.map(__applyInlineDataToProject);
      render(projects);
    }catch(_){
      projects = [];
      render(projects);
    }
  });

  function getProjectMeta(p){
    try{
      const data = p.inlineData ? JSON.parse(p.inlineData) : null;
      if(!data) return { title:"", dateIso:"" };
      return {
        title: data.title || data.name || p.name || "",
        dateIso: data.edited || data.date || ""
      };
    }catch(_){ return { title:"", dateIso:"" }; }
  }

  function fmtYMDHM(iso){
    if(!iso) return "";
    const d = new Date(iso);
    if(isNaN(d)) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }

  function closeAllMenus(){
    document.querySelectorAll('.menu.open').forEach(menu=>{
      menu.classList.remove('open');
      menu.style.display = 'none';
      menu.style.left = '';
      menu.style.top = '';
      menu.style.position = '';
      menu.style.visibility = '';
    });
    document.querySelectorAll('.kebab[aria-expanded="true"]').forEach(b=>b.setAttribute('aria-expanded','false'));
  }

  function placeMenuNearButton(btn, menu){
    const r = btn.getBoundingClientRect();

    menu.style.visibility = 'hidden';
    menu.style.display = 'block';

    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;

    menu.style.position = 'fixed';
    let left = r.right - mw;
    let top  = r.bottom + 6;

    left = Math.max(8, Math.min(window.innerWidth  - mw - 8, left));
    top  = Math.max(8, Math.min(window.innerHeight - mh - 8, top));

    menu.style.left = left + 'px';
    menu.style.top  = top  + 'px';
    menu.style.visibility = 'visible';
  }

  function buildCard(p){
    const meta = getProjectMeta(p);
    const title = meta.title || p.name || "Project";
    const niceDate = fmtYMDHM(meta.dateIso);

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<div class="row">'+
        '<h3 title="'+title.replaceAll('"','&quot;')+'">'+title+'</h3>'+
        '<span class="tag">'+niceDate+'</span>'+
      '</div>'+
      '<p class="desc">'+(p.description ? String(p.description).replaceAll('<','&lt;') : "")+'</p>'+
      '<button class="more" data-more-for="'+p.id+'" style="display:none">Pokaż więcej</button>'+
      '<div class="actions">'+
        '<a class="link" data-open-id="'+p.id+'" href="#">Open</a>'+
        '<button class="kebab" aria-haspopup="true" aria-expanded="false" data-id="'+p.id+'">•••</button>'+
        '<div class="menu" role="menu" data-menu-for="'+p.id+'">'+
          '<button class="menu-item" data-act="rename"     data-id="'+p.id+'">✏<span>Rename</span></button>'+
          '<button class="menu-item" data-act="editdesc"   data-id="'+p.id+'">📝<span>Edit description</span></button>'+
          '<button class="menu-item" data-act="replace"    data-id="'+p.id+'">📂<span>Replace JSON file</span></button>'+
          '<button class="menu-item" data-act="duplicate"  data-id="'+p.id+'">⧉<span>Duplicate</span></button>'+
          '<button class="menu-item" data-act="exportOne"  data-id="'+p.id+'">💾<span>Export project</span></button>'+
          '<button class="menu-item" data-act="copylink"  data-id="'+p.id+'">🔗<span>Copy link</span></button>'+
          '<hr/>'+
          '<button class="menu-item danger" data-act="delete" data-id="'+p.id+'">🗑<span>Delete</span></button>'+
        '</div>'+
      '</div>';

    card.querySelector('a[data-open-id]').addEventListener('click', (e)=>{
      e.preventDefault(); openProjectById(p.id);
    });

    const kebab = card.querySelector('button.kebab[data-id="'+p.id+'"]');
    const menu  = card.querySelector('.menu[data-menu-for="'+p.id+'"]');

    kebab.addEventListener('click', (e)=>{
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      closeAllMenus();
      if(!isOpen){
        menu.classList.add('open');
        kebab.setAttribute('aria-expanded','true');
        placeMenuNearButton(kebab, menu);
      }
    });

    menu.addEventListener('click', (e)=> e.stopPropagation());

    menu.querySelectorAll('.menu-item').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const act = btn.dataset.act;
        const id  = btn.dataset.id;
        closeAllMenus();

        if(act==='rename'){
          const pr = projects.find(x=>x.id===id); if(!pr) return;
          const name = await uiPrompt({ title:'Edit the project name', label:'Name:', value: pr.name || 'Project', required:true });
          if(name !== null){
            pr.name = name.trim();
            pr.slug = __uniqueSlug(__slugify(pr.name), projects, pr.id);

            try{
              const raw = pr.inlineData || "";
              let obj = null;
              if(typeof raw === "string" && raw.trim().length){
                try{ obj = JSON.parse(raw); }catch(_){ obj = null; }
              }else if (raw && typeof raw === "object"){
                obj = raw;
              }
              if(!obj || typeof obj !== "object") obj = {};
              obj.title = pr.name;
              obj.name = pr.name;
              obj.date = new Date().toISOString();
              pr.inlineData = JSON.stringify(obj, null, 2);
            }catch(e){ console.warn("Rename sync failed:", e); }

            save(); 

            (function(){
              try{
                for(const p of projects){
                  if(!p.slug){
                    const meta = getProjectMeta(p);
                    p.slug = __uniqueSlug(__slugify(p.name || (meta.title || 'project')), projects, p.id);
                  }
                }
                save();
              }catch(e){}
            })();

            render(projects);
          }
        }

        if(act==='editdesc'){
          const pr = projects.find(x=>x.id===id); if(!pr) return;
          const current = pr.description || "";
          const next = await uiPrompt({ title:'Edit the project description', label:'Project description:', value: current });
          if(next !== null){
            pr.description = next.trim();
            save(); render(projects);
          }
        }

        if(act==='replace'){
          const input=document.getElementById('pickJsonFile');
          input.onchange=(e)=>{
            const f=e.target.files&&e.target.files[0]; if(!f) return;
            const reader=new FileReader();
            reader.onload=ev=>{
              const pr=projects.find(x=>x.id===id); if(!pr) return;
              pr.inlineData=String(ev.target.result||"");
              save(); render(projects);
            };
            reader.readAsText(f); e.target.value='';
          };
          input.click();
        }

        if(act==='duplicate') duplicateProject(id);
        if(act==='exportOne') exportSingleProject(id);

        if(act==='copylink'){
          const pr = projects.find(x=>x.id===id); if(pr) await __copyProjectLink(pr);
        }
        if(act==='delete'){
          const ok = await uiConfirm({ title:'Delete Projectt', message:'Are you sure?' });
          if(ok){
            projects = projects.filter(x=>x.id!==id);
            save(); render(projects);
          }
        }
      });
    });

    // Pokaż więcej / Zwiń
    const descEl = card.querySelector('.desc');
    const moreBtn = card.querySelector('.more');
    moreBtn.addEventListener('click', ()=>{
      const expanded = descEl.classList.toggle('expanded');
      moreBtn.textContent = expanded ? 'Zwiń' : 'Pokaż więcej';
      card.classList.toggle('has-more', !expanded);
    });

    return card;
  }

  function render(list){
    const q = (document.getElementById("q").value || "").toLowerCase();
    const grid = document.getElementById("grid"); grid.innerHTML = "";

    const filtered = list.filter(p=>{
      const meta = getProjectMeta(p);
      const name = (p.name || meta.title || "").toLowerCase();
      const desc = (p.description || "").toLowerCase();
      const tag  = (p.tag || "").toLowerCase();
      const date = (fmtYMDHM(meta.dateIso) || "").toLowerCase();
      return name.includes(q) || desc.includes(q) || tag.includes(q) || date.includes(q);
    });

    document.getElementById("empty").style.display = filtered.length ? "none" : "block";
    for(const p of filtered){
      grid.appendChild(buildCard(p));
    }

    applyClampControls();
    if(!clampListenerInstalled){
      window.addEventListener('resize', applyClampControls);
      clampListenerInstalled = true;
    }
  }

  function applyClampControls(){
    document.querySelectorAll('.card').forEach(card=>{
      const desc = card.querySelector('.desc');
      const more = card.querySelector('.more');
      if(!desc || !more) return;
      const isClamped = desc.scrollHeight > desc.clientHeight + 2;
      more.style.display = isClamped ? 'inline-block' : 'none';
    });
  }

  // Toolbar
  document.getElementById("addBtn").onclick = addProject;
  document.getElementById("exportBtn").onclick = exportJson;
  document.getElementById("importFile").addEventListener("change", (e)=>{
    if(e.target.files && e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("q").addEventListener("input", ()=>render(projects));
  document.getElementById("openDefaultBtn").addEventListener("click", ()=>openDefault());

  document.addEventListener('click', closeAllMenus);
  window.addEventListener('scroll', closeAllMenus, { passive:true });
  window.addEventListener('resize', closeAllMenus);

  function addProject(){
    const input = document.getElementById("pickJsonFile");
    input.onchange = (e)=>{
      const f = e.target.files && e.target.files[0]; if(!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const txt = String(ev.target.result || "");
        try{ JSON.parse(txt); }catch(_){
          alert("Plik nie jest poprawnym JSON-em."); e.target.value = ""; return;
        }
        const meta = (()=>{
          try{
            const data = JSON.parse(txt);
            return { title: data.title || data.name || "Project", desc: data.description || "", date: data.edited || data.date || "" };
          }catch(_){ return { title:"Project", desc:"", date:"" }; }
        })();
        projects.unshift(normalize({ name: meta.title, description: meta.desc, inlineData: txt }));
        save(); render(projects);
      };
      reader.readAsText(f);
      e.target.value = "";
    };
    input.click();
  }

  function exportJson(){
    const filtered = projects.map(p => {
      const copy = Object.assign({}, p);
      delete copy.tag;
      return copy;
    });
    const blob = new Blob([JSON.stringify(filtered, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'projects.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file){
    const reader = new FileReader();
    reader.onload = (ev)=>{
      try{
        const list = JSON.parse(String(ev.target.result||""));
        if(!Array.isArray(list)) throw 0;
        projects = list.map(normalize); 
        save(); 
        render(projects);
      }catch(_){
        alert("Invalid file format.");
      }
    };
    reader.readAsText(file);
  }

  function openProjectById(id){
    const p = projects.find(x=>x.id===id); if(!p) return;
    const token = makeSessionToken(p.inlineData || getDefaultProjectPayload());
    // pass pid so viewer can sync card back
    location.href = "./viewer.html?project=" + encodeURIComponent(token) + "&pid=" + encodeURIComponent(p.id);
  }

  function exportSingleProject(id){
    const p = projects.find(x=>x.id===id); if(!p) return;
    const raw = p.inlineData || "";
    if(!raw){ alert("No project data to export."); return; }
    const name = (p.name || 'project').replace(/[^\w\-]+/g,'_');
    const blob = new Blob([raw], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name + '.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function duplicateProject(id){
    const p = projects.find(x=>x.id===id); if(!p) return;
    const copy = JSON.parse(JSON.stringify(p));
    copy.id = __uuidv4();
    copy.name = (p.name || 'Project') + ' (coppy)';
    projects.unshift(copy); save(); render(projects);
  }

  function openDefault(){
    const payload = getDefaultProjectPayload();
    const initial = JSON.parse(payload);
    const title   = initial.title || "New project";
    const proj = normalize({
      name: title,
      description: "Empty template",
      tag: "",
      inlineData: payload
    });
    projects.unshift(proj);
    save();
    const token = makeSessionToken(proj.inlineData);
    location.href = "./viewer.html?project=" + encodeURIComponent(token) + "&pid=" + encodeURIComponent(proj.id);
  }

  // Init (with optional auto-import from projects.json or ?import=URL)
  (function(){
    const btn = document.getElementById("btnImportJson");
    const input = document.getElementById("fileImport");
    if(btn && input){
      btn.addEventListener("click", ()=> input.click());
      input.addEventListener("change", async (e)=>{
        const f = e.target.files && e.target.files[0];
        if(!f) return;
        try{
          const txt = await f.text();
          const json = JSON.parse(txt);
          const imported = await __convertImportedData(json);
          if(!imported.length){ alert("Brak rozpoznanych projektów w pliku."); input.value=""; return; }
          const replace = confirm("Zastąpić obecną listę projektów?\nOK = Zastąp, Anuluj = Dodaj do listy");
          if(replace) projects = [];
          const existingIds = new Set(projects.map(x=>x.id));
          for(const p of imported){
            if(!p.id || existingIds.has(p.id)) p.id = __uuidv4(); // <-- poprawka
            projects.push(p);
          }
          save();
          render(projects);
        }catch(err){
          alert("Błąd podczas importu: " + (err?.message || err));
        }finally{
          input.value="";
        }
      });
    }
  })();

  (async function(){
    const fromLs = localStorage.getItem(LS_KEY);
    projects = fromLs ? JSON.parse(fromLs) : [];
    const params = new URLSearchParams(location.search);
    const shouldReplace = params.get('replace') === '1';

    if(!Array.isArray(projects)) projects = [];
    if(shouldReplace){ projects = []; }

    if(projects.length === 0){
      const imported = await __tryImportProjectList();
      if(imported && imported.length){
        projects = imported;
        save();
        render(projects);
        return;
      }

      projects = [ normalize({
        name: "Empty template",
        description: "Default empty project – click Open",
        tag: "demo",
        inlineData: getDefaultProjectPayload()
      }) ];
      save();
    }

    projects = projects.map(__applyInlineDataToProject);
    render(projects);
  })();

  window.uiPrompt = function ({ title="Enter value", label="Value:", value="", placeholder="", okText="OK", cancelText="Cancel", required=false } = {}) {
    return new Promise((resolve)=>{
      const ov = document.getElementById('idxOverlay');
      const ttl = document.getElementById('idxTitle');
      const lab = document.getElementById('idxLabel');
      const inp = document.getElementById('idxInput');
      const err = document.getElementById('idxErr');
      const ok = document.getElementById('idxOk');
      const cancel = document.getElementById('idxCancel');

      ttl.textContent = title; lab.textContent = label;
      inp.value = value || ""; inp.placeholder = placeholder || "";
      err.style.display = "none"; err.textContent = "";
      ok.textContent = okText; cancel.textContent = cancelText;

      function close(v){ ov.style.display="none"; cleanup(); resolve(v); }
      function cleanup(){
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        ov.removeEventListener('click', onOv);
      }
      function onOk(){
        const v = inp.value.trim();
        if(required && !v){ err.textContent="This field is required."; err.style.display="block"; inp.focus(); return; }
        close(v);
      }
      function onCancel(){ close(null); }
      function onKey(e){
        if(e.key === 'Escape'){ e.preventDefault(); close(null); }
        if(e.key === 'Enter'){ e.preventDefault(); onOk(); }
      }
      function onOv(e){ if(e.target === ov) onCancel(); }

      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
      ov.addEventListener('click', onOv);

      ov.style.display = "flex";
      setTimeout(()=>inp.focus(), 0);
    });
  };

  window.uiConfirm = function ({ title="Confirm", message="Are you sure?", okText="OK", cancelText="Cancel" } = {}) {
    return new Promise((resolve)=>{
      const ov = document.getElementById('idxConfirmOverlay');
      const ttl = document.getElementById('idxConfirmTitle');
      const msg = document.getElementById('idxMsg');
      const yes = document.getElementById('idxYes');
      const no = document.getElementById('idxNo');

      ttl.textContent = title; msg.textContent = message;
      yes.textContent = okText; no.textContent = cancelText;

      function close(v){ ov.style.display="none"; cleanup(); resolve(v); }
      function cleanup(){
        yes.removeEventListener('click', onYes);
        no.removeEventListener('click', onNo);
        document.removeEventListener('keydown', onKey);
        ov.removeEventListener('click', onOv);
      }
      function onYes(){ close(true); }
      function onNo(){ close(false); }
      function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); onNo(); } if(e.key==='Enter'){ e.preventDefault(); onYes(); } }
      function onOv(e){ if(e.target===ov) onNo(); }

      yes.addEventListener('click', onYes);
      no.addEventListener('click', onNo);
      document.addEventListener('keydown', onKey);
      ov.addEventListener('click', onOv);

      ov.style.display = "flex";
    });
  };

  // --- Toggle instruction panel on index page ---
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('helpBtn');
    const panel = document.getElementById('helpPanel');
    if (!btn || !panel) return;

    const setOpen = (open) => {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? '📘 Hide instruction' : '📘 Instruction';
      if (open) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    let opened = false;
    setOpen(opened);
    btn.addEventListener('click', () => { opened = !opened; setOpen(opened); });
  });

})();

  (function(){
    function applyLang(lang){
      localStorage.setItem('idx_lang', lang);
      document.querySelectorAll('#helpPanel .lang').forEach(el => el.classList.remove('active'));
      const active = document.querySelector('#helpPanel .lang-' + lang);
      if (active) active.classList.add('active');
      document.getElementById('btnPL').classList.toggle('is-active', lang === 'pl');
      document.getElementById('btnEN').classList.toggle('is-active', lang === 'en');
    }

    window.setLang = applyLang;
    window.addEventListener('DOMContentLoaded', function(){
      const saved = localStorage.getItem('idx_lang') || 'en'; // domyślnie EN
      document.getElementById('btnPL').addEventListener('click', () => applyLang('pl'));
      document.getElementById('btnEN').addEventListener('click', () => applyLang('en'));
      applyLang(saved);
    });
  })();
