import {promises as fs} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {dockerCommand,ensureDockerReady} from './docker-engine.mjs';
const quote=value=>"'"+String(value).replace(/'/g,"''")+"'";
export async function windowsScript(script,{timeout=30000}={}){
 if(process.platform!=='win32')throw Error('Esta opção está disponível no Windows. Você pode informar a pasta manualmente.');
 const encoded=Buffer.from("$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;"+script,'utf16le').toString('base64');
 return new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-STA','-NonInteractive','-EncodedCommand',encoded],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',error='',settled=false;
  const finish=(failure)=>{if(settled)return;settled=true;clearTimeout(timer);failure?reject(failure):resolve(output.trim());};
  const timer=setTimeout(()=>{child.kill();finish(Error('A ação do Windows demorou demais. Tente novamente.'));},timeout);
  child.stdout.on('data',chunk=>output=(output+chunk).slice(-16000));child.stderr.on('data',chunk=>error=(error+chunk).slice(-12000));
  child.on('error',finish);child.on('close',code=>finish(code===0?null:Error(error.trim()||'Não foi possível concluir a ação no Windows.')));
 });
}
export async function chooseInstallationFolder(){
 const selected=await windowsScript(`
  if (-not [Environment]::UserInteractive) {
   throw 'O seletor precisa de uma sessão interativa do Windows. Informe o caminho no campo da pasta.'
  }
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.Application]::EnableVisualStyles()
  $owner = New-Object System.Windows.Forms.Form
  $owner.ShowInTaskbar = $false
  $owner.StartPosition = 'CenterScreen'
  $owner.Opacity = 0
  $owner.TopMost = $true
  $picker = New-Object System.Windows.Forms.FolderBrowserDialog
  $picker.Description = 'Escolha a pasta para instalar os apps do Orbit'
  $picker.ShowNewFolderButton = $true
  try {
   $owner.Show()
   $owner.Activate()
   if ($picker.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Write($picker.SelectedPath)
   }
  } finally {
   $picker.Dispose()
   $owner.Dispose()
  }
 `,{timeout:300000});
 return{path:selected,cancelled:!selected};
}
export async function desktopDirectory(){return windowsScript("[Console]::Write([Environment]::GetFolderPath('Desktop'))");}
let windowsInventory;
export async function windowsInstallations(refresh = false) {
 if(process.platform!=='win32')return [];
 if(!refresh && windowsInventory?.until > Date.now())return windowsInventory.items;
 const items=windowsScript(`
  $roots=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')
  $items=@(Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue | Where-Object { $_.DisplayVersion -and ($_.URLInfoAbout -like 'https://github.com/*/*' -or $_.URLUpdateInfo -like 'https://github.com/*/*') } | Select-Object -First 40 URLInfoAbout,URLUpdateInfo,DisplayVersion,InstallLocation,DisplayIcon)
  ConvertTo-Json -InputObject $items -Compress
 `,{timeout:7000}).then(JSON.parse).catch(()=>[]);
 windowsInventory={until:Date.now()+15000,items};
 return items;
}
export async function findWindowsInstallation(project, entries) {
 const slug=project.fullName?.toLowerCase();
 if(!slug)return null;
 const matches=entries.filter(entry=>[entry.URLInfoAbout,entry.URLUpdateInfo].some(value=>{
  try {
   const url=new URL(value);
   const repo=url.pathname.match(/^\/([\w.-]+\/[\w.-]+)(?:\/releases(?:\/.*)?|\/)?$/i)?.[1];
   return url.origin==='https://github.com' && repo?.toLowerCase()===slug;
  } catch { return false; }
 }));
 for(const entry of matches){
  const version=String(entry.DisplayVersion).trim();
  if(!version || version.length>100)continue;
  const install=String(entry.InstallLocation||'').trim().replace(/^"|"$/g,'');
  const icon=String(entry.DisplayIcon||'').trim().replace(/,\s*-?\d+$/,'').replace(/^"|"$/g,'');
  if(!path.isAbsolute(install))continue;
  const candidates=[icon,path.join(install,project.name+'.exe')];
  const root=await fs.realpath(install).catch(()=>null);
  if(!root)continue;
  for(const candidate of candidates){
   if(!path.isAbsolute(candidate) || !/\.exe$/i.test(candidate) || /(?:unins|uninstall|setup|installer)/i.test(path.basename(candidate)))continue;
   const executable=await fs.realpath(candidate).catch(()=>null);
   if(!executable)continue;
   const relative=path.relative(root,executable);
   if(!relative || relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative))continue;
   if(await fs.stat(executable).then(stat=>stat.isFile(),()=>false))return {version,executable};
  }
 }
 return null;
}
export async function openWindowsFolder(directory) {
 await windowsScript("Start-Process -FilePath 'explorer.exe' -ArgumentList " + quote('"'+directory+'"'));
}
export async function openWindowsInstaller(executable) {
 const msi=/\.msi$/i.test(executable);
 const command=msi ? "-FilePath 'msiexec.exe' -ArgumentList " + quote('/i "'+executable+'"') : '-FilePath ' + quote(executable);
 return windowsScript(`$process=Start-Process ${command} -PassThru; $process.WaitForExit(); [Console]::Write($process.ExitCode)`,{timeout:1800000});
}
const readShortcut = async file => {const bytes=await fs.readFile(file);return bytes[0]===255&&bytes[1]===254?bytes.subarray(2).toString('utf16le'):bytes.toString('utf8');};
const shortcutBytes = content => Buffer.concat([Buffer.from([255,254]),Buffer.from(content,'utf16le')]);
const validId=project=>{if(!/^[a-zA-Z0-9_-]+$/.test(project.id||''))throw Error('App inválido.');return project.id;};
const cleanName=value=>String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[ .]+$/,'');
const filename=project=>{validId(project);const owner=project.owner||project.fullName?.split('/')[0]||'';return cleanName(project.name||'App').slice(0,75)+(owner?' ('+cleanName(owner).slice(0,45)+')':'')+' - Orbit.url';};
const legacyFilename=project=>cleanName(project.name||'App').slice(0,75)+' - Orbit '+validId(project)+'.url';
async function ownedShortcutFile(project){
 const shortcut=project.shortcut;if(!shortcut)return null;
 const file=path.resolve(shortcut.path||'');
 if(![filename(project),legacyFilename(project)].includes(path.basename(file))||path.dirname(file)!==shortcut.directory)throw Error('O caminho do atalho mudou. Ele foi preservado.');
 const directory=await fs.realpath(path.dirname(file)).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(!directory)return null;if(directory!==shortcut.directory)throw Error('A pasta do atalho foi redirecionada. O arquivo foi preservado.');
 const info=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(!info)return null;
 if(!info.isFile()||info.isSymbolicLink()||await readShortcut(file)!==shortcut.content)throw Error('O atalho foi alterado fora do Orbit e foi preservado.');
 return file;
}
const shortcutContent=(url,icon)=>'[InternetShortcut]\r\nURL='+url+'\r\n'+(icon?'IconFile='+icon+'\r\nIconIndex=0\r\n':'');
export async function createDesktopShortcut(project,url,{dataDirectory,desktopPath,makeIcon=true}={}){
 if(!/^http:\/\/127\.0\.0\.1:\d+\/#app\/[a-zA-Z0-9_-]+$/.test(url))throw Error('Destino do atalho inválido.');
 const desktop=await fs.realpath(desktopPath||await desktopDirectory());
 const file=path.join(desktop,filename(project));
 const previousFile=await ownedShortcutFile(project);let icon='';
 const iconFolder=path.resolve(dataDirectory,'shortcuts');await fs.mkdir(iconFolder,{recursive:true});
 const iconFile=path.join(iconFolder,validId(project)+'.ico');
 if(makeIcon){
  try{
   const glyph=(project.name||'A').slice(0,1).toUpperCase();
   await windowsScript('Add-Type -AssemblyName System.Drawing;$bitmap=New-Object Drawing.Bitmap 64,64;$g=[Drawing.Graphics]::FromImage($bitmap);$g.Clear([Drawing.Color]::FromArgb(17,37,61));$font=New-Object Drawing.Font '+quote('Segoe UI')+',32,([Drawing.FontStyle]::Bold);$g.DrawString('+quote(glyph)+',$font,[Drawing.Brushes]::White,8,4);$icon=[Drawing.Icon]::FromHandle($bitmap.GetHicon());$stream=[IO.File]::Open('+quote(iconFile)+',[IO.FileMode]::Create);try{$icon.Save($stream)}finally{$stream.Dispose();$icon.Dispose();$font.Dispose();$g.Dispose();$bitmap.Dispose()}');
   icon=iconFile;
  }catch{icon=path.join(process.env.SystemRoot||'C:/Windows','System32','shell32.dll');}
 }
 if(project.executable&&/\.(?:exe|dll|ico)$/i.test(project.executable)&&!/[\r\n]/.test(project.executable)&&await fs.stat(project.executable).then(stat=>stat.isFile(),()=>false))icon=project.executable;
 const content=shortcutContent(url,icon);
 const existing=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(existing){
  if(existing.isSymbolicLink()||!existing.isFile()||previousFile!==file||await readShortcut(file)!==project.shortcut.content)throw Error('Já existe um arquivo com esse nome na área de trabalho. Ele foi preservado.');
  await fs.writeFile(file,shortcutBytes(content));
 }else await fs.writeFile(file,shortcutBytes(content),{flag:'wx'});
 if(previousFile&&previousFile!==file){
  try{await fs.unlink(previousFile);}catch(error){
   if(await readShortcut(file).catch(()=>null)===content)await fs.unlink(file).catch(()=>{});
   throw Error('Não foi possível atualizar o nome do atalho antigo. Feche o arquivo e tente novamente.');
  }
 }
 return{path:file,directory:desktop,content,url,createdAt:new Date().toISOString()};
}
export async function removeDesktopShortcut(project,{dataDirectory}={}){
 const shortcut=project.shortcut;if(!shortcut)return[];
 const file=await ownedShortcutFile(project);if(file)await fs.unlink(file);
 const icon=path.resolve(dataDirectory,'shortcuts',validId(project)+'.ico');await fs.unlink(icon).catch(error=>{if(error.code!=='ENOENT')throw error;});return[];
}
export async function cleanupProjectDocker(project,{run=dockerCommand,ready=ensureDockerReady,startEngine=true}={}){
 const id=validId(project),warnings=[];
 if(!(await run(['info','--format','{{.ServerVersion}}'],{timeout:5000})).ok){
  if(!startEngine)throw Error('Abra o Docker e retome a limpeza. O Orbit ainda precisa conferir o container, o volume e a imagem próprios do projeto.');
  try{await ready({run,timeout:60000,log:()=>{}});}
  catch(error){throw Error('Não foi possível iniciar o Docker para concluir a desinstalação. Tente novamente. '+error.message);}
 }
 let container;
 const inspected=await run(['container','inspect','orbit-'+id],{timeout:10000});
 if(inspected.ok){
  try{container=JSON.parse(inspected.output)[0];}catch{}
  if(container?.Config?.Labels?.['orbit.project']!==id||container?.Config?.Labels?.['orbit.managed']!=='true')throw Error('O container com esse nome não pertence a este app. A desinstalação foi interrompida.');
  const removed=await run(['container','rm','-f','orbit-'+id],{timeout:30000});if(!removed.ok)throw Error('Não foi possível remover o container do app: '+removed.output);
 }else if(!/No such|not found/i.test(inspected.output))throw Error('Não foi possível conferir o container: '+inspected.output);
 const volume='orbit-data-'+id;const volumeInfo=await run(['volume','inspect',volume],{timeout:10000});
 if(volumeInfo.ok){
  let item;try{item=JSON.parse(volumeInfo.output)[0];}catch{}
  const owned=item?.Labels?.['orbit.project']===id||container?.Mounts?.some(mount=>mount.Name===volume);
  if(owned){const removed=await run(['volume','rm',volume],{timeout:30000});if(!removed.ok)warnings.push('Os dados Docker não foram removidos: '+removed.output);}else warnings.push('Um volume antigo não tem identificação suficiente e foi preservado: '+volume);
 }else if(!/No such|not found/i.test(volumeInfo.output))warnings.push('Não foi possível conferir os dados Docker: '+volumeInfo.output);
 const image=await run(['image','inspect','orbit-project-'+id+':latest'],{timeout:10000});
 if(image.ok){const removed=await run(['image','rm','orbit-project-'+id+':latest'],{timeout:30000});if(!removed.ok)warnings.push('A imagem própria do app não foi removida: '+removed.output);}else if(!/No such|not found/i.test(image.output))warnings.push('Não foi possível conferir a imagem própria do app.');
 return warnings;
}
