import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const idOf=project=>{if(!/^[a-zA-Z0-9_-]+$/.test(project.id||''))throw fail('Identificador de app inválido.');return project.id;};
const equal=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
export function projectLocations(project,dataDirectory){
 const id=idOf(project);
 if(project.storage?.root)return{root:project.storage.root,source:path.join(project.storage.root,'source'),native:path.join(project.storage.root,'native'),docker:path.join(project.storage.root,'docker')};
 return{root:null,source:path.join(dataDirectory,'projects',id),native:path.join(dataDirectory,'native',id),docker:path.join(dataDirectory,'docker',id)};
}
async function plainDirectory(target){
 const info=await fs.lstat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(info&&(!info.isDirectory()||info.isSymbolicLink()))throw fail('A pasta do app foi substituída por um link ou arquivo. Confira o local antes de continuar.');
 return info;
}
export async function verifyProjectStorage(project,dataDirectory,{allowMissing=false}={}){
 const locations=projectLocations(project,path.resolve(dataDirectory));
 if(locations.root){
  if(!path.isAbsolute(locations.root)||equal(path.parse(locations.root).root,path.resolve(locations.root)))throw fail('Pasta de instalação inválida.');
  if(!await plainDirectory(locations.root)){
   if(allowMissing)return locations;
   throw fail('A pasta de instalação não foi encontrada.');
  }
  const resolved=await fs.realpath(locations.root);
  if(!equal(resolved,path.resolve(locations.root)))throw fail('A pasta de instalação mudou de destino.');
  const marker=await fs.readFile(path.join(locations.root,'.orbit-installation.json'),'utf8').then(JSON.parse).catch(()=>null);
  if(!marker||marker.id!==project.id||!project.storage.token||marker.token!==project.storage.token)throw fail('O Orbit não reconhece esta pasta como pertencente ao app. Os arquivos foram preservados.');
  for(const key of ['source','native','docker'])await plainDirectory(locations[key]);
 }else{
  for(const key of ['source','native','docker']){
   const target=path.resolve(locations[key]),expected=path.resolve(dataDirectory,key==='source'?'projects':key);
   if(!equal(path.dirname(target),expected)||!equal(path.basename(target),idOf(project)))throw fail('Pasta fora da instalação do app.');
   if(await plainDirectory(target)){
    const actual=await fs.realpath(target),parent=await fs.realpath(expected);
    if(!equal(parent,expected))throw fail('A pasta de armazenamento foi redirecionada. Os arquivos foram preservados.');
    if(!equal(path.dirname(actual),parent)||!equal(path.basename(actual),project.id))throw fail('A pasta do app mudou de destino.');
   }
  }
 }
 return locations;
}
function folderName(value, fallback) {
 const clean=String(value||'').replace(/[^a-zA-Z0-9_.-]/g,'-').slice(0,70).replace(/^\.+|\.+$/g,'');
 if (!clean) return fallback;
 return /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(clean) ? '_'+clean : clean;
}
export async function allocateProjectStorage(project,parent,{reserved=[]}={}){
 if(typeof parent!=='string'||!path.isAbsolute(parent)||/[\0-\x1f]/.test(parent)||parent.length>2000)throw fail('Escolha uma pasta absoluta existente.');
 const base=await fs.realpath(parent).catch(()=>{throw fail('A pasta escolhida não existe ou não está acessível.');});
 if(!(await fs.stat(base)).isDirectory())throw fail('Escolha uma pasta.');
 for(let ancestor=base;;ancestor=path.dirname(ancestor)){if(await fs.lstat(path.join(ancestor,'.orbit-installation.json')).catch(()=>null))throw fail('Escolha uma pasta fora de outra instalação do Orbit.');if(ancestor===path.dirname(ancestor))break;}
 const id=idOf(project);
 const name=folderName(project.name,'Projeto');
 const qualified=name+'-'+folderName(project.owner,'Orbit');
 const token=randomBytes(24).toString('hex');
 const marker=JSON.stringify({schema:1,id,fullName:project.fullName,token});
 for(let index=0;index<1000;index++){
  const leaf=index===0 ? name : index===1 ? qualified : qualified+'-'+index;
  const target=path.join(base,leaf);
  if(reserved.some(folder=>equal(folder,target)))continue;
  try{await fs.mkdir(target);}catch(error){if(error.code==='EEXIST')continue;throw error;}
  try{
   await fs.writeFile(path.join(target,'.orbit-installation.json'),marker,{flag:'wx'});
   return{root:target,token,naming:'project'};
  }catch(error){
   await fs.rmdir(target).catch(()=>{});
   throw error;
  }
 }
 throw fail('Há muitas pastas com esse nome. Escolha outro local de instalação.',409);
}
export async function deleteProjectFiles(project,dataDirectory,options){
 // Resolve and verify every final target before any recursive removal.
 const locations=await verifyProjectStorage(project,dataDirectory,options);
 const targets=locations.root?[locations.root]:[locations.source,locations.native,locations.docker];
 if(locations.root){
  if(options?.allowMissing&&!await plainDirectory(locations.root))return targets;
  const markerFile=path.join(locations.root,'.orbit-installation.json');const marker=await fs.readFile(markerFile);
  for(const entry of await fs.readdir(locations.root))if(entry!=='.orbit-installation.json'){
   const target=path.resolve(locations.root,entry);if(path.dirname(target)!==path.resolve(locations.root))throw fail('Arquivo fora da pasta do app.');
   await fs.rm(target,{recursive:true,force:true});
  }
  await fs.unlink(markerFile);
  try{await fs.rmdir(locations.root);}catch(error){await fs.writeFile(markerFile,marker,{flag:'wx'}).catch(()=>{});throw error;}
 }else for(const target of targets)await fs.rm(target,{recursive:true,force:true});
 return targets;
}
export async function moveProjectFiles(project,parent,dataDirectory,save,{useProjectName=false,reserved=[]}={}){
 const old=await verifyProjectStorage(project,dataDirectory);
 const proposed=path.resolve(parent||'');
 const sources=old.root?[old.root]:[old.source,old.native,old.docker];
 const base=await fs.realpath(proposed).catch(()=>{throw fail('Escolha uma pasta existente.');});
 if(!path.isAbsolute(parent||''))throw fail('Escolha uma pasta absoluta.');
 if(old.root&&equal(path.dirname(old.root),base)&&(!useProjectName||project.storage.naming==='project'))return{locations:old,warnings:[]};
 if(sources.some(source=>{const relative=path.relative(path.resolve(source),base);return !relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}))throw fail('Escolha uma pasta fora da instalação atual.');
 const storage=await allocateProjectStorage(project,base,{reserved});const next={...project,storage};const dest=projectLocations(next,dataDirectory);
 const previous={storage:project.storage,executable:project.executable};
 try{
  for(const key of ['source','native','docker'])if(await fs.lstat(old[key]).catch(()=>null))await fs.cp(old[key],dest[key],{recursive:true,errorOnExist:true,force:false,verbatimSymlinks:true});
  if(project.executable){let moved;for(const key of ['source','native']){const relative=path.relative(old[key],project.executable);if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative))moved=path.join(dest[key],relative);}project.executable=moved||project.executable;}
  project.storage=storage;
  await save();
 }catch(error){project.storage=previous.storage;project.executable=previous.executable;await deleteProjectFiles(next,dataDirectory).catch(()=>{});throw error;}
 const warnings=[];
 try{await deleteProjectFiles({...project,storage:previous.storage},dataDirectory);}catch(error){warnings.push('A nova pasta está ativa, mas a pasta anterior não pôde ser apagada: '+error.message);}
 return{locations:dest,warnings};
}
