import {newProject,newNode,uuid,safeUrl,validateBundle,validateProject,type Project,type BlockType} from './model';
function object(v:any){return v&&typeof v==='object'&&!Array.isArray(v);}
export function importData(input:unknown):Project[]{
 if(object(input)&&(input as any).schemaVersion!==undefined){validateBundle(input);return structuredClone(input.projects);}
 const v=input as any;let entries:any[];
 if(Array.isArray(v)){entries=v.length&&object(v[0])&&'items'in v[0]?[{menuData:v}]:v;}
 else if(object(v)&&Array.isArray(v.projects))entries=v.projects;
 else entries=[v];
 if(entries.length>2000)throw Error('Too many projects');
 return entries.map(entry=>{
  if(!object(entry))throw Error('Invalid legacy project');
  let raw=entry.inlineData??entry.project??entry.payload??entry;
  if(typeof raw==='string')raw=JSON.parse(raw);
  if(Array.isArray(raw))raw={menuData:raw};
  if(!object(raw)||!Array.isArray(raw.menuData)||raw.menuData.length>100)throw Error('Missing legacy menuData');
  const p=newProject(raw.title||raw.name||entry.name||'Project');p.nodes=[];
  p.description=entry.description??raw.description??'';if(typeof entry.id==='string')p.legacyId=entry.id;
  if(typeof entry.slug==='string')p.slug=entry.slug;
  const date=raw.date||raw.edited||entry.date;if(typeof date==='string'&&Number.isFinite(Date.parse(date)))p.updatedAt=date;
  p.pinned=entry.pinned===true;
  function walk(items:any[],parent:string,section:string,depth:number){
   if(!Array.isArray(items)||depth>32)throw Error('Invalid/deep legacy tree');
   for(const item of items){if(!object(item)||typeof item.text!=='string'||p.nodes.length>=20000)throw Error('Invalid legacy node');
    const group=item.children!==undefined;
    const kind:BlockType=section==='PLC tags'?'TAGS':section==='PLC data types'?'UDT':(/\[(OB|FB|FC|DB)\d*\]/i.exec(item.text)?.[1].toUpperCase() as BlockType)||'OTHER';
    const n=newNode(item.text,parent,group?'group':'block',kind);n.safety=item.fblock===true;p.nodes.push(n);
    if(group)walk(item.children,n.id,section,depth+1);
    else {safeUrl(item.link);p.documents.push({id:uuid(),nodeId:n.id,name:item.text+'.pdf',mime:'application/pdf',size:0,url:item.link});}
   }
  }
  for(const section of raw.menuData){if(!object(section)||typeof section.title!=='string')throw Error('Invalid legacy section');const n=newNode(section.title,null,'group');p.nodes.push(n);walk(section.items,n.id,section.title,0);}
  validateProject(p);return p;
 });
}
export function exportLegacy(p:Project){
 const children=(parent:string):any[]=>p.nodes.filter(n=>n.parentId===parent).map(n=>n.kind==='group'?{text:n.name,children:children(n.id)}:{text:n.name,link:p.documents.find(d=>d.nodeId===n.id&&d.url)?.url||'',fblock:n.safety});
 return {title:p.name,date:p.updatedAt,menuData:p.nodes.filter(n=>n.parentId===null).map(n=>({title:n.name,icon:'',items:children(n.id)}))};
}
