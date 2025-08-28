(function(){
  const LS_KEY = "ppv.projects";
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
      inlineData: p.inlineData || ""
    };
  }

  function save(){ localStorage.setItem(LS_KEY, JSON.stringify(projects)); }

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
            save(); render(projects);
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
    const blob = new Blob([JSON.stringify(projects, null, 2)], {type:'application/json'});
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
        projects = list.map(normalize); save(); render(projects);
      }catch(_){
        alert("Invalid file format.");
      }
    };
    reader.readAsText(file);
  }

  function openProjectById(id){
    const p = projects.find(x=>x.id===id); if(!p) return;
    const token = makeSessionToken(p.inlineData || getDefaultProjectPayload());
    location.href = "./viewer.html?project="+encodeURIComponent(token);
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
    const token = makeSessionToken(payload);
    location.href = "./viewer.html?project="+encodeURIComponent(token);
  }

  // Init
  const fromLs = localStorage.getItem(LS_KEY);
  projects = fromLs ? JSON.parse(fromLs) : [];
  if(!Array.isArray(projects) || projects.length === 0){
    projects = [ normalize({
      name: "Empty template",
      description: "Default empty project – click Open",
      tag: "demo",
      inlineData: getDefaultProjectPayload()
    }) ];
    save();
  }
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
    btn.textContent = open ? '📘 Hide Help' : '📘 Help';
    if (open) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  let opened = false;
  setOpen(opened);
  btn.addEventListener('click', () => { opened = !opened; setOpen(opened); });
});
