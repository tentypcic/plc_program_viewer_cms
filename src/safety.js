/* Shared legacy-format boundary. No schema migration in stabilization. */
(function(root){
  'use strict';
  const MAX_BYTES = 8 * 1024 * 1024;
  function object(v){ return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function text(v, optional=false){ if(optional && v === undefined) return; if(typeof v !== 'string' || v.length > 100000) throw Error('Nieprawidłowe pole tekstowe.'); }
  function safeUrl(value, base='https://localhost/'){
    if(typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\\]/.test(value)) throw Error('Nieprawidłowy adres dokumentu.');
    const url = new URL(value, base);
    if(!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('Dozwolone są adresy HTTP(S) i ścieżki względne.');
    return value;
  }
  function project(value){
    if(typeof value === 'string') { if(new TextEncoder().encode(value).length > MAX_BYTES) throw Error('Plik przekracza 8 MiB.'); value=JSON.parse(value); }
    const sections=Array.isArray(value) ? value : value?.menuData;
    if(!Array.isArray(sections) || sections.length > 100) throw Error('Brak poprawnej tablicy menuData.');
    if(!Array.isArray(value)){ if(!object(value)) throw Error('Nieprawidłowy projekt.'); for(const k of ['title','name','date','edited','description']) text(value[k],true); }
    let count=0;
    function items(nodes,depth){
      if(!Array.isArray(nodes) || depth > 32) throw Error('Zbyt głęboka lub nieprawidłowa struktura.');
      for(const n of nodes){
        if(++count>20000 || !object(n)) throw Error('Nieprawidłowy lub zbyt duży projekt.');
        text(n.text);
        if(n.children !== undefined) items(n.children,depth+1);
        else safeUrl(n.link);
        if(n.fblock !== undefined && typeof n.fblock !== 'boolean') throw Error('Nieprawidłowy typ fblock.');
      }
    }
    for(const s of sections){ if(!object(s)) throw Error('Nieprawidłowa sekcja.'); text(s.title); items(s.items,0); }
    return Array.isArray(value) ? {menuData:value} : value;
  }
  function list(value){
    if(!Array.isArray(value) || value.length>2000) throw Error('Nieprawidłowa lista projektów.');
    const ids=new Set(), slugs=new Set();
    for(const p of value){
      if(!object(p)) throw Error('Nieprawidłowy projekt na liście.');
      for(const k of ['id','name','description','tag','slug','date']) text(p[k],true);
      if(p.id && (!/^[a-zA-Z0-9_-]{1,128}$/.test(p.id) || ids.has(p.id))) throw Error('Nieprawidłowe lub powtórzone ID.');
      if(p.slug && (!/^[a-z0-9-]{1,200}$/.test(p.slug) || slugs.has(p.slug))) throw Error('Nieprawidłowy lub powtórzony slug.');
      ids.add(p.id); if(p.slug) slugs.add(p.slug);
      if(p.inlineData) project(p.inlineData);
    }
    return value;
  }
  function updateProject(catalog,id,expected,snapshot){
    list(catalog);
    const i=catalog.findIndex(p=>p.id===id);
    if(i<0 || JSON.stringify(catalog[i])!==expected) throw Error('Projekt usunięto lub zmieniono w innej karcie.');
    project(snapshot);
    const next=catalog.slice();
    next[i]={...catalog[i],name:snapshot.title,date:snapshot.date,inlineData:JSON.stringify(snapshot,null,2)};
    return {list:next,expected:JSON.stringify(next[i])};
  }
  function file(f){ if(!f || !f.size || f.size>MAX_BYTES) throw Error('Wybierz niepusty plik JSON do 8 MiB.'); }
  function escapeHtml(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function storage(native, notify=()=>{}){
    let baseline=native.getItem('ppv.projects');
    let failed=false;
    return {
      get failed(){return failed;},
      getItem(k){const v=native.getItem(k); if(k==='ppv.projects') baseline=v; return v;},
      removeItem(k){ native.removeItem(k); },
      setItem(k,v){
        try{
          if(k==='ppv.projects'){
            list(JSON.parse(v));
            if(native.getItem(k)!==baseline) throw Error('Dane zmieniły się w innej karcie. Odśwież listę przed kolejną zmianą.');
          }
          native.setItem(k,v);
          if(k==='ppv.projects') baseline=v;
          failed=false;
        }catch(e){failed=true; notify(e); throw e;}
      }
    };
  }
  root.PPVSafety={MAX_BYTES, project,list,updateProject,file,safeUrl,escapeHtml,storage};
  if(typeof module!=='undefined') module.exports=root.PPVSafety;
})(typeof window==='undefined'?globalThis:window);
