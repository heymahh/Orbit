'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const e = escapeHTML;
const iconPaths = {
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  layers:'<path d="m12 3 10 6-10 6L2 9Z"/><path d="m2 14 10 6 10-6M2 18l10 6 10-6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  folder:'<path d="M3 7V5h6l2 3h10v12H3Z"/>',
  terminal:'<path d="m5 7 5 5-5 5M13 17h6"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  settings:'<path d="m9 3-.6 2.5-2.3 1L3.8 6 2 9l1.8 1.8v2.4L2 15l1.8 3 2.3-.5 2.3 1L9 21h4l.6-2.5 2.3-1 2.3.5 1.8-3-1.8-1.8v-2.4L20 9l-1.8-3-2.3.5-2.3-1L13 3Z"/><circle cx="11" cy="12" r="3"/>',
  github:'<path d="M8 20c-5 1-5-3-7-3m14 6v-4c0-1 .3-2 1-2.5 4-.5 6-2 6-6a5 5 0 0 0-1.5-3.5A5 5 0 0 0 20 3s-1.5-.5-4 1.5a12 12 0 0 0-6 0C7.5 2.5 6 3 6 3a5 5 0 0 0-.5 4A5 5 0 0 0 4 10.5c0 4 2 5.5 6 6-.7.5-1 1.5-1 2.5v4"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
  external:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16"/>',
  cpu:'<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
  activity:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  play:'<path d="m7 3 14 9-14 9Z"/>',
  stop:'<rect x="5" y="5" width="14" height="14" rx="1"/>',
  star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  'thumbs-up':'<path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 2 2.4l-1.4 7a2 2 0 0 1-2 1.6H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.7-1l4.5-7A3.1 3.1 0 0 1 15 5.9Z"/>',
  // Pix and Bitcoin marks from Simple Icons.
  pix:'<path fill="currentColor" stroke="none" d="M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156"/>',
  bitcoin:'<circle cx="12" cy="12" r="9" fill="#fff" stroke="none"/><path fill="currentColor" stroke="none" d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z"/>',
  ether:'<g stroke="none"><path fill="#a9b8ff" d="M12 0 4.6 12.3 12 9zM4.6 13.7 12 24v-6z"/><path fill="#7189f3" d="M12 0v9l7.4 3.3zM12 18v6l7.4-10.3z"/><path fill="#8096fb" d="m12 9-7.4 3.3 7.4 4.4z"/><path fill="#5066ca" d="M12 9v7.7l7.4-4.4z"/></g>',
  follow:'<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2m4-13v6m-3-3h6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  file:'<path d="M14 2H4v20h16V8Zm0 0v6h6M8 13h8m-8 4h5"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
  refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  expand:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  window:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/>',
};
function icon(name, className = '') { return '<svg class="' + className + '" viewBox="0 0 24 24" aria-hidden="true">' + (iconPaths[name] || iconPaths.code) + '</svg>'; }
function hydrate(root = document) { $$('[data-icon]', root).forEach(node => { node.innerHTML = icon(node.dataset.icon); }); }
hydrate();
const model = { explore:{key:'',data:null,loading:false,error:'',requestId:0}, featured:null, appRequest:0, appPort:0, appStatus:'', appOperation:'run', tipIndex:0, tipAt:0, token:'', capabilities:{}, state:{projects:[],events:[]}, runtimes:[], route:'explore', projectId:null, remote:null, tab:'overview', query:'', language:'Todos', results:[], searchError:'', searching:false, requestId:0, filePath:'', logSignature:'', stateSignature:'', connected:true, activityHints:{}, activityPolling:false, remoteOrigin:'explore', ranking:{language:'Todos',period:'all',updated:'any',topic:'all',stars:'any',license:'any',sort:'stars',lists:'show',data:null,error:'',loading:false,requestId:0} };
const library = { selecting:false, selected:new Set(), pending:false, warnings:[], filter:'all' };
const libraryFilters = [
  ['all','Todos',() => true],
  ['updates','Com atualização',project => Boolean(project.availableRelease)],
  ['running','Em execução',project => project.status === 'running'],
  ['attention','Precisam de atenção',project => ['error','interrupted'].includes(project.status) || project.sourceMissing || project.uninstallProgress || project.uninstallDockerPending]
];
const visibleLibraryProjects = () => model.state.projects.filter(libraryFilters.find(([key]) => key === library.filter)[2]);
const seeded = [
  {fullName:'vitejs/vite',owner:'vitejs',name:'vite',language:'TypeScript',description:'Ferramentas para desenvolver aplicações web, com servidor de desenvolvimento e build.',topics:['frontend','build-tool']},
  {fullName:'fastapi/fastapi',owner:'fastapi',name:'fastapi',language:'Python',description:'Um framework para criar APIs em Python com validação e documentação automática.',topics:['api','python']},
  {fullName:'ollama/ollama',owner:'ollama',name:'ollama',language:'Go',description:'Ferramentas para executar e integrar modelos de linguagem no seu computador.',topics:['llm','local-ai']},
  {fullName:'rust-lang/mdBook',owner:'rust-lang',name:'mdBook',language:'Rust',description:'Transforme arquivos Markdown em livros e documentações navegáveis.',topics:['documentation','markdown']},
  {fullName:'excalidraw/excalidraw',owner:'excalidraw',name:'excalidraw',language:'TypeScript',description:'Um quadro colaborativo para desenhar diagramas com aparência de desenho à mão.',topics:['whiteboard','collaboration']},
  {fullName:'jqlang/jq',owner:'jqlang',name:'jq',language:'C',description:'Um processador de JSON leve e flexível para a linha de comando.',topics:['json','cli']}
].map(repo => ({...repo, url:'https://github.com/' + repo.fullName}));
const statusNames = {cloning:'Baixando',ready:'Pronto',running:'Em execução',installing:'Instalando',stopped:'Parado',stopping:'Parando',error:'Erro',interrupted:'Interrompido'};
const busy = project => ['cloning','running','installing','stopping'].includes(project?.status);
const stoppingProjects = new Map();
function stopLabel(project) {
  const running = (stoppingProjects.get(project.id) || project.status) === 'running';
  const stopping = project.status === 'stopping' || stoppingProjects.has(project.id);
  if (stopping) return running ? 'Parando…' : 'Cancelando…';
  return running ? 'Parar' : 'Cancelar';
}
function stopButton(project, classes = '') {
  return '<button class="button ' + classes + '" data-stop-project="' + e(project.id) + '" aria-disabled="' + (project.status === 'stopping' || stoppingProjects.has(project.id)) + '" aria-label="' + e(stopLabel(project) + ' ' + project.name) + '">' + icon('stop') + '<span>' + stopLabel(project) + '</span></button>';
}
function syncStopButton(button, project) {
  const label = stopLabel(project);
  if ($('span',button).textContent !== label) $('span',button).textContent = label;
  button.setAttribute('aria-label', label + ' ' + project.name);
  button.setAttribute('aria-disabled', String(project.status === 'stopping' || stoppingProjects.has(project.id)));
}
// Tipos de projeto que não abrem como app no navegador. O texto explicativo vem do servidor (project.note).
const kindTitles = {docs:'Este projeto é para ler', mcp:'Este projeto é um servidor MCP', cli:'Este projeto é uma ferramenta de terminal', library:'Este projeto é uma biblioteca', native:'Este projeto é um programa nativo', android:'Este projeto é um app Android', unknown:'O Orbit não reconheceu como executar'};
const kindIcons = {docs:'file', mcp:'cpu', cli:'terminal', library:'code', native:'window', android:'layers', unknown:'info'};
const notRunnable = project => Boolean(project && (project.kind === 'docs' || project.language === 'Documentação') && !(project.userConfigured && project.command));
// Tipos que rodam direto no Windows, fora do Docker (programa nativo, terminal, MCP, Android).
const nativeKind = project => Boolean(project && project.executionPreference !== 'docker' && ['native','cli','library','mcp','android'].includes(project.kind) && !(project.userConfigured && project.command));
let nativeRequest;
const nativeCopy = {
  native: {icon:'window', title:'Executar no Windows', text:'O Orbit procura uma versão pronta para Windows na página de Releases e abre o programa numa janela própria. Se não houver, tenta compilar com as ferramentas instaladas no seu computador.', button:'Executar no Windows'},
  cli: {icon:'terminal', title:'Executar ferramenta', text:'O Orbit prepara e executa a ferramenta. A saída aparece no terminal do Orbit, com acompanhamento do processo e correções automáticas quando reconhecidas.', button:'Executar ferramenta'},
  library: {icon:'code', title:'Executar biblioteca', text:'O Orbit instala as dependências e tenta iniciar a entrada declarada ou importar a biblioteca. O resultado e as tentativas de correção aparecem no terminal do Orbit.', button:'Executar biblioteca'},
  mcp: {icon:'cpu', title:'Servidor MCP', text:'Ele funciona dentro de um agente de IA. Conecte ao Claude Code ou ao Codex com um clique, ou inicie e acompanhe o servidor pelo Orbit.', button:'Iniciar servidor'},
  android: {icon:'layers', title:'Instalar no Android', text:'O Orbit baixa o APK das Releases e instala no aparelho conectado por ADB. Sem aparelho conectado, abre a pasta com o APK. Sem APK, roda o script de instalação do projeto.', button:'Instalar no Android'}
};
const surfaceResult = project => ({terminal:'Último resultado: terminal aberto.', process:'Última execução concluída: ' + (project.surfaceDetail || project.name) + '. Veja a saída no terminal do Orbit.', folder:'Último resultado: arquivo baixado e pasta aberta (' + (project.surfaceDetail || '') + ').', device:'Último resultado: instalado no aparelho Android.', window:'Última execução: ' + (project.surfaceDetail || 'programa') + '.'})[project.surface] || '';
const projectById = id => model.state.projects.find(project => project.id === id);
function statusLabel(project) {
  if (project.status === 'stopped') return '';
  return '<span class="status-label" data-status="' + e(project.status) + '"><span class="status-dot ' + (project.status === 'running' ? 'green' : '') + '"></span>' + e(statusNames[project.status] || project.status) + '</span>';
}
const number = value => new Intl.NumberFormat('pt-BR', { notation:'compact', maximumFractionDigits:1 }).format(value);
async function api(endpoint, options = {}) {
  const response = await fetch('/api' + endpoint, { ...options, headers:{'Content-Type':'application/json', 'X-Orbit-Token':model.token, ...options.headers} });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error || 'Não foi possível concluir a ação.'), {status:response.status});
  return payload;
}
const post = (endpoint, payload = {}) => api(endpoint, { method:'POST', body:JSON.stringify(payload) });
let toastTimer;
function toast(message, feedback = '') { const el = $('#toast'); el.classList.toggle('pin-feedback',feedback === 'pins'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 5500); }
let releaseNotifications;
function notice(message, error = false) { return '<div class="notice ' + (error ? 'error' : '') + '">' + icon('info') + '<span>' + e(message) + '</span></div>'; }
function empty(title, description, glyph = 'folder') { return '<div class="empty-state">' + icon(glyph) + '<h2>' + e(title) + '</h2><p>' + e(description) + '</p></div>'; }
function heading(title, description, action = true, eyebrow = '', extraAction = '') {
  const add = action ? '<button class="button primary" data-action="import" data-spatial>' + icon('plus') + ' Adicionar projeto</button>' : '';
  return '<div class="welcome-heading"><div>' + (eyebrow ? '<span class="eyebrow">' + e(eyebrow) + '</span>' : '') + '<h1>' + e(title) + '</h1><p>' + e(description) + '</p></div>' + (extraAction ? '<div class="library-heading-actions">' + extraAction + add + '</div>' : add) + '</div>';
}


const projectLogos = new Map();
const projectLogoRequests = new Set();
const projectReadmes = new Map();
const projectImages = new Map();
function projectFilePath(value, from = 'README.md') {
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return null;
  try {
    const folder = from.split('/').slice(0,-1).join('/');
    const url = new URL(value,'https://orbit.invalid/' + (folder ? folder + '/' : ''));
    if (url.hostname !== 'orbit.invalid') return null;
    return decodeURIComponent(url.pathname.slice(1));
  } catch { return null; }
}
function svgData(source) {
  if (source.length > 350000 || !/<svg[\s>]/i.test(source)) return null;
  const clean = DOMPurify.sanitize(source,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['script','style','foreignObject','image','a'],FORBID_ATTR:['style']});
  const doc = new DOMParser().parseFromString(clean,'image/svg+xml');
  if (doc.documentElement.localName !== 'svg' || doc.querySelector('parsererror')) return null;
  for (const node of doc.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) {
      if ((attr.localName === 'href' && !attr.value.startsWith('#')) || [...attr.value.matchAll(/url\(\s*['"]?([^'")\s]+)/gi)].some(match=>!match[1].startsWith('#'))) node.removeAttributeNode(attr);
    }
  }
  const bytes = new TextEncoder().encode(new XMLSerializer().serializeToString(doc.documentElement));
  let binary = ''; for (let offset=0;offset<bytes.length;offset+=8192) binary+=String.fromCharCode(...bytes.slice(offset,offset+8192));
  return 'data:image/svg+xml;base64,' + btoa(binary);
}
const imageSource = image => image.kind === 'svg' ? svgData(image.content) : /^data:image\/(?:png|jpeg|gif|webp);base64,/.test(image.src || '') ? image.src : null;
async function getProjectImage(project, path) {
  if (!path) return null;
  const key = (project.remote ? 'github:' + project.fullName.toLowerCase() : project.id) + ':' + path;
  if (!projectImages.has(key)) projectImages.set(key,(async()=>{
    try {
      if (project.remote) return imageSource(await api('/remote/image?repo=' + encodeURIComponent(project.fullName) + '&path=' + encodeURIComponent(path)));
      if (model.capabilities.projectImages) return imageSource(await api('/projects/' + project.id + '/image?path=' + encodeURIComponent(path)));
      const file = /\.svg$/i.test(path) ? path : /\.(?:png|jpe?g|webp)$/i.test(path) ? path.replace(/\.[^.]+$/,'.svg') : null;
      if (!file) return null;
      const {content} = await api('/projects/' + project.id + '/file?path=' + encodeURIComponent(file));
      return svgData(content);
    } catch { return null; }
  })());
  return projectImages.get(key);
}
async function getProjectReadme(project) {
  if (!projectReadmes.has(project.id)) projectReadmes.set(project.id,(async()=>{
    try {
      const files = await api('/projects/' + project.id + '/files');
      const name = files.find(file=>/^readme(?:\.(?:md|rst|txt|markdown))?$/i.test(file.name))?.name;
      if (!name) throw new Error('Este projeto não tem um README na raiz. Consulte os arquivos ou abra o repositório no GitHub.');
      const {content} = await api('/projects/' + project.id + '/file?path=' + encodeURIComponent(name));
      return {name,content};
    } catch (error) { projectReadmes.delete(project.id); throw error; }
  })());
  return projectReadmes.get(project.id);
}
// README de um repositório que ainda não foi baixado, lido do GitHub pelo servidor do Orbit.
const remoteReadmes = new Map();
function getRemoteReadme(fullName) {
  const key = fullName.toLowerCase();
  if (!remoteReadmes.has(key)) remoteReadmes.set(key,api('/remote/readme?repo=' + encodeURIComponent(fullName)).catch(error=>{ remoteReadmes.delete(key); throw error; }));
  return remoteReadmes.get(key);
}
function applyProjectLogo(project, src) {
  projectLogos.set(project.fullName.toLowerCase(),src);
  for (const avatar of document.querySelectorAll('.project-avatar')) {
    if (avatar.dataset.repository?.toLowerCase() !== project.fullName.toLowerCase()) continue;
    let img = $('img',avatar);
    if (!img) { img = document.createElement('img'); img.className='avatar-image'; img.alt=''; img.width=96; img.height=96; img.referrerPolicy='no-referrer'; avatar.append(img); }
    img.src=src;
  }
}
async function loadProjectLogo(project) {
  if (project.status === 'cloning' || projectLogoRequests.has(project.id)) return;
  projectLogoRequests.add(project.id);
  try {
    const {name,content} = await getProjectReadme(project);
    const paths = [...content.slice(0,8000).matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']|!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gi)].map(match=>projectFilePath(match[1] || match[2],name)).filter(path=>path && /(?:logo|icon|brand)/i.test(path));
    const candidates = [...new Set([...paths,'logo.svg','docs/logo.svg','assets/logo.svg','.github/logo.svg','public/logo.svg','frontend/public/logo.svg'])].slice(0,8);
    for (const file of candidates) { const src = await getProjectImage(project,file); if (src) { applyProjectLogo(project,src); return; } }
  } catch {}
}
const readmeImageSources = new WeakMap();
DOMPurify.addHook('uponSanitizeElement', node=>{
  if (node.nodeName === 'IMG' && node.hasAttribute('src')) readmeImageSources.set(node,node.getAttribute('src'));
});
function readmeLink(project, path, from) {
  if (/^https?:\/\//i.test(path)) return path;
  const file = projectFilePath(path,from);
  return file ? 'https://github.com/' + project.fullName + '/blob/HEAD/' + file.split('/').map(encodeURIComponent).join('/') : null;
}
function renderReadme(project, {name,content}, container) {
  const html = marked.parse(content,{gfm:true,breaks:false});
  const fragment = DOMPurify.sanitize(html,{USE_PROFILES:{html:true},RETURN_DOM_FRAGMENT:true,ALLOW_DATA_ATTR:false,FORBID_TAGS:['script','style','iframe','object','embed','form','input','button','textarea','select','audio','video','source'],FORBID_ATTR:['src','srcset','style','id','name']});
  const ids = new Map();
  for (const heading of fragment.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const base = heading.textContent.trim().toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s+/g,'-') || 'section';
    const duplicate = ids.get(base) || 0; ids.set(base,duplicate+1);
    heading.id = 'readme-' + base + (duplicate ? '-' + duplicate : '');
  }
  for (const node of fragment.querySelectorAll('[align]')) { if (node.getAttribute('align') === 'center') node.classList.add('readme-center'); node.removeAttribute('align'); }
  for (const anchor of fragment.querySelectorAll('a')) {
    const original = anchor.getAttribute('href') || '';
    if (original.startsWith('#')) {
      anchor.href = '#readme-' + original.slice(1); anchor.dataset.readmeAnchor = 'readme-' + original.slice(1);
    } else {
      const href = readmeLink(project,original,name);
      if (href) { anchor.href=href; anchor.target='_blank'; anchor.rel='noopener noreferrer'; } else anchor.removeAttribute('href');
    }
  }
  const images = [...fragment.querySelectorAll('img')].map(img=>({img,path:readmeImageSources.get(img)}));
  for (const {img} of images) { img.loading='lazy'; img.decoding='async'; img.classList.add('readme-image-pending'); }
  container.replaceChildren(fragment); container.classList.add('rendered-readme');
  for (const {img,path} of images) {
    const file = projectFilePath(path,name);
    if (!file) {
      const href = readmeLink(project,path || '',name);
      if (href && img.alt) { const link=document.createElement('a');link.href=href;link.textContent=img.alt;link.target='_blank';link.rel='noopener noreferrer';link.className='readme-image-link';img.replaceWith(link); }
      else img.remove();
      continue;
    }
    getProjectImage(project,file).then(src=>{
      if (!img.isConnected) return;
      if (src) { img.src=src;img.classList.remove('readme-image-pending'); }
      else { const link=document.createElement('a');link.href=readmeLink(project,file,'README.md');link.textContent=img.alt || 'Ver imagem';link.target='_blank';link.rel='noopener noreferrer';link.className='readme-image-link';img.replaceWith(link); }
    });
  }
}

const failedAvatars = new Map();
function avatarSource(repo) {
  try {
    const url = new URL(repo.avatarUrl || '');
    if (url.protocol === 'https:' && url.hostname === 'avatars.githubusercontent.com' && !url.port && !url.username && !url.password) {
      url.searchParams.set('s','96'); return url.href;
    }
  } catch {}
  const owner = repo.owner || repo.fullName?.split('/')[0] || '';
  return /^[a-z\d][a-z\d-]{0,38}$/i.test(owner) ? 'https://github.com/' + encodeURIComponent(owner) + '.png?size=96' : '';
}
function projectAvatar(repo, className = 'repo-logo', loading = 'lazy') {
  const src = projectLogos.get(repo.fullName?.toLowerCase()) || avatarSource(repo);
  const fallback = (repo.name || repo.fullName?.split('/')[1] || '?').slice(0,1).toUpperCase();
  const available = src && Date.now() - (failedAvatars.get(src) || 0) > 60000;
  return '<span class="project-avatar ' + className + '" data-language="' + e(repo.language) + '" data-repository="' + e(repo.fullName) + '" aria-hidden="true"><span class="avatar-fallback">' + e(fallback) + '</span>' + (available ? '<img class="avatar-image" src="' + e(src) + '" alt="" width="96" height="96" loading="' + loading + '" decoding="async" referrerpolicy="no-referrer">' : '') + '</span>';
}
document.addEventListener('load', event => {
  if (event.target.matches?.('img.avatar-image')) event.target.classList.add('is-loaded');
},true);
document.addEventListener('error', event => {
  if (event.target.matches?.('img.avatar-image')) { failedAvatars.set(event.target.src,Date.now()); event.target.remove(); }
},true);

const localProject = repo => model.state.projects.find(project => project.fullName.toLowerCase() === repo.fullName.toLowerCase());
const exploreFavorite = fullName => (model.state.explorePins || []).find(repo => repo.fullName.toLowerCase() === fullName.toLowerCase());
const isFavorite = fullName => Boolean(localProject({fullName})?.homePinned || exploreFavorite(fullName));
const favoriteLabel = (fullName, saved) => saved ? 'Remover ' + fullName + ' dos favoritos' : 'Favoritar ' + fullName;
let pinPending = false;
let homeEditing = false;
const hiddenHomeWidgets = new Set();
const homeOrder = {sections:[],pins:[]};
let homeDrag;
let homePress;
let homeCategories = [];
try {
  const saved = JSON.parse(localStorage.getItem('orbit-home-categories') || '[]');
  if (Array.isArray(saved)) homeCategories = saved.filter(category =>
    /^category-[\da-f-]+$/.test(category?.id) && typeof category.name === 'string' &&
    Array.isArray(category.apps) && category.apps.every(key => typeof key === 'string'));
} catch {}
const homeCategory = id => homeCategories.find(category => category.id === id);
function saveHomeCategories(categories) {
  try { localStorage.setItem('orbit-home-categories',JSON.stringify(categories)); }
  catch {
    toast('Não foi possível salvar as categorias neste navegador.');
    return false;
  }
  homeCategories = categories;
  return true;
}
function moveHomeFavorite(key, group) {
  const destination = homeCategory(group);
  const categories = homeCategories.map(category => {
    const apps = category.apps.filter(app => app !== key);
    if (category === destination) apps.push(key);
    return {...category,apps};
  });
  return saveHomeCategories(categories);
}
try {
  const saved = JSON.parse(localStorage.getItem('orbit-home-order') || '{}');
  for (const scope of Object.keys(homeOrder)) {
    if (Array.isArray(saved?.[scope])) homeOrder[scope] = saved[scope].filter(key => typeof key === 'string');
  }
} catch {}
function homeOrderKeys(scope, keys) {
  const available = new Set(keys);
  const order = homeOrder[scope] || homeCategory(scope)?.apps || [];
  return [...new Set([...order.filter(key => available.has(key)),...available])];
}
const homeOrderItems = list => [...list.children].filter(item => item.hasAttribute('data-home-order-item'));
function enableHomeSectionKeyboard() {
  if (!homeEditing) return;
  for (const title of $$('[data-home-order-list="sections"] .shelf-head h2')) {
    title.tabIndex = 0;
    title.setAttribute('aria-keyshortcuts','Alt+ArrowUp Alt+ArrowDown');
  }
}
function saveHomeOrder(list) {
  const scope = list.dataset.homeOrderList;
  const keys = homeOrderItems(list).map(node => node.dataset.homeOrderItem);
  const category = homeCategory(scope);
  if (category) {
    if (!saveHomeCategories(homeCategories.map(item => item === category ? {...item,apps:keys} : item))) queueMicrotask(renderExplore);
    return;
  }
  homeOrder[scope] = keys;
  try { localStorage.setItem('orbit-home-order',JSON.stringify(homeOrder)); } catch {}
}
function moveHomeItem(item,target,after,focus) {
  if (!homeEditing || !item || !target || item === target || item.parentElement !== target.parentElement) return;
  const list = item.parentElement;
  list.insertBefore(item,after ? target.nextSibling : target);
  saveHomeOrder(list);
  focus?.focus({preventScroll:true});
  item.scrollIntoView({block:'nearest',inline:'nearest'});
}
function moveHomeItemByStep(focus, direction) {
  const item = focus.closest('[data-home-order-item]');
  if (!item) return;
  const items = homeOrderItems(item.parentElement);
  moveHomeItem(item,items[items.indexOf(item)+direction],direction > 0,focus);
}
try {
  const saved = JSON.parse(localStorage.getItem('orbit-hidden-home-widgets') || '[]');
  if (Array.isArray(saved)) {
    for (const id of saved) if (['home-continue','explore-recommendations','home-weekly','explore-editorial'].includes(id)) hiddenHomeWidgets.add(id);
  }
} catch {}
function favoriteButton(repo) {
  if (!model.capabilities.explorePins) return '';
  const saved = isFavorite(repo.fullName);
  const label = favoriteLabel(repo.fullName,saved);
  return '<button type="button" class="favorite-button" data-pin-repo="' + e(repo.fullName) + '" aria-pressed="' + saved + '" aria-label="' + e(label) + '" title="' + e(label) + '"' + (pinPending || library.pending ? ' disabled' : '') + ' data-spatial>' + icon('star') + '</button>';
}
function syncPinButtons() {
  $$('[data-pin-repo]').forEach(button => {
    const saved = isFavorite(button.dataset.pinRepo);
    const label = favoriteLabel(button.dataset.pinRepo,saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', label); button.title = label; button.disabled = pinPending || library.pending;
  });
  $$('[data-unpin-home]').forEach(button => { button.disabled = pinPending; });
}
async function saveExploreFavorite(repo, pinned) {
  const {items} = await post('/explore/pins', {repo,pinned});
  model.state.explorePins = items;
}
async function saveFavorite(repo, pinned) {
  const project = localProject(repo);
  if (project && Boolean(project.homePinned) !== pinned) {
    await post('/library/home-pins', {ids:[project.id],pinned});
    const current = projectById(project.id);
    if (current) current.homePinned = pinned;
  }
  const saved = exploreFavorite(repo.fullName);
  if (!pinned && saved) await saveExploreFavorite(saved,false);
  if (pinned && !project) await saveExploreFavorite(repo,true);
}
async function toggleFavorite(fullName, button) {
  if (pinPending || library.pending) return;
  const repo = localProject({fullName}) || knownRepo(fullName);
  if (!repo) return;
  const pinned = !isFavorite(fullName);
  const hadFocus = document.activeElement === button;
  const route = model.route;
  const shelfId = button.closest('.shelf[id]')?.id;
  pinPending = true; syncPinButtons();
  try {
    await saveFavorite(repo,pinned);
    pinPending = false;
    if (model.route === 'explore') renderExplore();
    else if (model.route === 'library' && library.selecting) renderLibrary();
    toast(pinned ? repo.name + ' foi adicionado aos favoritos.' : repo.name + ' foi removido dos favoritos.', 'pins');
  } catch (error) { toast('Não foi possível atualizar os favoritos. Tente novamente. ' + error.message, 'pins'); }
  finally {
    pinPending = false; syncPinButtons();
    if (hadFocus && model.route === route && document.activeElement === document.body) {
      const section = document.getElementById(shelfId || 'main') || $('#main');
      const next = $('[data-pin-repo="' + CSS.escape(fullName) + '"]',section);
      (next || $('#home-pins h2') || $('.shelf h2'))?.focus({preventScroll:true});
    }
  }
}
function shelfTile(repo) {
  const local = localProject(repo);
  return '<div class="repo-tile">' + favoriteButton(repo) + '<button class="tile" data-repo="' + e(repo.fullName) + '" data-language="' + e(repo.language) + '" data-spatial><span class="tile-glow" aria-hidden="true"></span>' + projectAvatar(repo,'tile-avatar') + '<span class="tile-body"><span class="tile-owner">' + e(repo.owner) + '</span><strong class="tile-name">' + e(repo.name) + '</strong>' + (repo.recommendationReason ? '<span class="recommendation-summary">' + e(repo.description || 'Abra o projeto para conhecer os recursos.') + '</span><span class="recommendation-reason">' + e(repo.recommendationReason) + '</span>' : '') + '</span><span class="tile-foot"><span class="tile-chip">' + e(repo.language || 'Sem linguagem') + '</span>' + (local ? '<span class="tile-badge">' + icon('check') + 'Na biblioteca</span>' : repo.stars != null ? '<span class="tile-stars">' + icon('star') + number(repo.stars) + '</span>' : '') + '</span></button></div>';
}
function homeEditButton() {
  return '<button class="button small home-edit" type="button" data-action="edit-home" aria-pressed="' + homeEditing + '" data-spatial>' +
    (homeEditing ? 'Concluir' : 'Editar início') + '</button>';
}
function setHomeEditing(active) {
  finishHomeDrag();
  homeEditing = active;
  renderExplore();
  $('[data-action="edit-home"]')?.focus({preventScroll:true});
}
function homeWidget(id, title, render) {
  const hidden = hiddenHomeWidgets.has(id);
  const label = hidden ? 'Mostrar' : 'Ocultar';
  const control = homeEditing ? '<button class="home-edit-marker" type="button" data-home-widget="' + id +
    '" aria-label="' + e(label + ' ' + title) + '" title="' + e(label + ' ' + title) + '" data-spatial>' + icon(hidden ? 'plus' : 'minus') + '</button>' : '';
  if (hidden && !homeEditing) return '';
  const content = hidden ? '<section class="shelf hidden-home-widget" id="' + id + '"><div class="shelf-head"><h2>' + e(title) +
    '</h2>' + control + '</div></section>' : render(control);
  return '<div class="home-widget" data-home-order-item="' + id + '">' + content + '</div>';
}
function toggleHomeWidget(id) {
  if (!homeEditing) return;
  if (hiddenHomeWidgets.has(id)) hiddenHomeWidgets.delete(id);
  else hiddenHomeWidgets.add(id);
  try { localStorage.setItem('orbit-hidden-home-widgets', JSON.stringify([...hiddenHomeWidgets])); } catch {}
  renderExplore();
}
function pinnedShortcut(repo) {
  const destination = repo.homePinned ? 'data-project="' + e(repo.id) + '"' : 'data-repo="' + e(repo.fullName) + '"';
  const label = 'Remover ' + repo.name + ' dos favoritos';
  const update = (repo.homePinned ? repo : localProject(repo))?.availableRelease?.tag;
  const badge = update ? '<span class="pinned-shortcut-update" title="' + e('Atualização disponível · ' + update) + '">Atualização disponível</span>' : '';
  const shortcut = homeEditing ? ' aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"' : '';
  const remove = homeEditing ? '<button type="button" class="home-edit-marker" data-unpin-home="' + e(repo.fullName) + '" aria-label="' + e(label) + '" title="' + e(label) + '"' +
    (pinPending ? ' disabled' : '') + ' data-spatial>' + icon('minus') + '</button>' : '';
  return '<div class="pinned-shortcut" data-home-order-item="' + e(repo.fullName.toLowerCase()) + '"><button class="pinned-shortcut-open" ' + destination + shortcut + ' data-spatial>' +
    projectAvatar(repo,'repo-logo pinned-shortcut-icon') + '<span class="eyebrow pinned-shortcut-name">' + e(repo.name) + '</span>' + badge + '</button>' +
    remove + '</div>';
}
async function unpinFromHome(button) {
  if (pinPending) return;
  const fullName = button.dataset.unpinHome;
  const repo = localProject({fullName}) || exploreFavorite(fullName);
  if (!repo) return;
  pinPending = true;
  syncPinButtons();
  try {
    await saveFavorite(repo,false);
    toast(repo.name + ' foi removido dos favoritos.', 'pins');
  } catch (error) { toast(error.message, 'pins'); }
  finally {
    pinPending = false;
    if (model.route === 'explore' && !model.query) {
      const restoreFocus = document.activeElement === button || document.activeElement === document.body;
      renderExplore();
      if (restoreFocus) ($('#home-pins [data-unpin-home]') || $('[data-action="edit-home"]'))?.focus({preventScroll:true});
    } else syncPinButtons();
  }
}
function projectVersionHTML(project) {
  const installed = project.installedRelease?.tag;
  const windows = project.systemInstall?.version;
  const cached = project.releaseTracking?.cached?.tag;
  const local = installed
    ? (project.kind === 'android' && !project.androidInstalled && project.surface !== 'device' ? 'APK ' : windows || project.windowsPackage === 'portable' ? 'Portátil ' : 'Instalado ') + installed
    : windows ? '' : cached ? 'Baixado ' + cached : project.sourceVersion ? 'Código ' + project.sourceVersion : 'Versão não registrada';
  const update = project.availableRelease?.tag;
  return (windows ? '<span class="project-version-label">Windows ' + e(windows) + '</span>' : '') +
    (local ? '<span class="project-version-label" title="' + e(local) + '">' + e(local) + '</span>' : '') +
    (update ? '<span class="project-update-label" title="' + e('Atualização disponível: ' + update) + '">' + icon('download') + '<span>Atualização ' + e(update) + '</span></span>' : '');
}
function projectTile(project, {selectable = false} = {}) {
  const selection = selectable ? 'data-select-project="' + e(project.id) + '" aria-pressed="' + library.selected.has(project.id) + '"' + (library.pending ? ' disabled' : '') : 'data-project="' + e(project.id) + '"';
  const mark = selectable ? '<span class="project-selection" aria-hidden="true">' + icon('check') + '</span>' : '';
  return '<div class="repo-tile' + (selectable ? ' selecting-project' : '') + '">' + favoriteButton(project) + '<button class="tile project-tile" ' + selection + ' data-language="' + e(project.language) + '" data-spatial><span class="tile-glow" aria-hidden="true"></span>' + projectAvatar(project,'tile-avatar','eager') + mark + '<span class="tile-body"><span class="tile-owner">' + e(project.fullName.split('/')[0]) + '</span><strong class="tile-name">' + e(project.name) + '</strong><span class="project-version" data-version-project="' + e(project.id) + '">' + projectVersionHTML(project) + '</span></span><span class="tile-foot"><span class="tile-chip">' + e(project.language || 'Sem linguagem') + '</span>' + statusLabel(project) + '</span></button></div>';
}
function shelf(title, caption, tiles, extra = '', wrap = false, id = '') {
  return '<section class="shelf"' + (id ? ' id="' + e(id) + '"' : '') + '><div class="shelf-head"><h2 tabindex="-1">' + e(title) + '</h2>' + (caption ? '<span class="shelf-caption">' + e(caption) + '</span>' : '') + extra + '</div><div class="shelf-row' + (wrap ? ' wrap' : '') + '">' + tiles + '</div></section>';
}
function heroMeta(repo) {
  const local = localProject(repo);
  return [repo.language ? '<span>' + e(repo.language) + '</span>' : '', repo.stars != null ? '<span>' + icon('star') + number(repo.stars) + ' estrelas</span>' : '', local ? '<span class="hero-saved">' + icon('check') + 'Na sua biblioteca</span>' : ''].filter(Boolean).join('<span class="dot-sep" aria-hidden="true">·</span>');
}
function heroHTML(repo) {
  return '<section class="hero" id="hero"><div class="hero-copy"><span class="eyebrow" id="hero-eyebrow">' + e(repo.owner) + '</span><h1 id="hero-title">' + e(repo.name) + '</h1><p id="hero-description">' + e(repo.description || 'Este repositório não tem uma descrição.') + '</p><div class="hero-meta" id="hero-meta">' + heroMeta(repo) + '</div><div class="hero-actions"><button class="button primary" id="hero-open" data-repo="' + e(repo.fullName) + '" data-spatial>' + icon('arrow') + ' Ver projeto</button><button class="button glass" data-action="import" data-spatial>' + icon('plus') + ' Adicionar por URL</button></div></div><div class="hero-art" id="hero-art" data-language="' + e(repo.language) + '">' + projectAvatar(repo,'hero-avatar','eager') + '</div></section>';
}
function updateHero(repo) {
  if (!repo || !$('#hero') || model.featured === repo.fullName) return;
  model.featured = repo.fullName;
  $('#hero-eyebrow').textContent = repo.owner;
  $('#hero-title').textContent = repo.name;
  $('#hero-description').textContent = repo.description || 'Este repositório não tem uma descrição.';
  $('#hero-meta').innerHTML = heroMeta(repo);
  $('#hero-open').dataset.repo = repo.fullName;
  const art = $('#hero-art'); art.dataset.language = repo.language || ''; art.innerHTML = projectAvatar(repo,'hero-avatar','eager');
  const hero = $('#hero'); hero.classList.remove('swap'); void hero.offsetWidth; hero.classList.add('swap');
}
const knownRepo = fullName => [...seeded,...model.results,...(model.ranking.data?.items || []),...(weeklyRanking.data?.items || []),...(model.state.explorePins || []),...(model.explore.data?.items || []),...(model.remote ? [model.remote] : [])].find(repo => repo.fullName.toLowerCase() === fullName.toLowerCase());
function featureFrom(event) {
  if (model.route !== 'explore') return;
  const tile = event.target instanceof Element && event.target.closest('#main .tile[data-repo]');
  if (tile) updateHero(knownRepo(tile.dataset.repo));
}
document.addEventListener('focusin', featureFrom);
document.addEventListener('mouseover', featureFrom);

const rankingLanguages = ['Todos','Python','JavaScript','TypeScript','Go','Rust','C','C++','C#','Java','Kotlin','Swift','Dart','PHP','Ruby','Lua','Zig','Elixir','Haskell','Scala','Shell','HTML','Vue','Svelte','Jupyter Notebook'];
const rankingDefaults = {language:'Todos',period:'all',updated:'any',topic:'all',stars:'any',license:'any',sort:'stars',lists:'show'};
const weeklyRankingFilters = {...rankingDefaults,period:'week'};
const weeklyRanking = {data:null,loading:false,error:'',checkedAt:0};
const rankingChoices = {
  period:[['all','Sempre'],['year','Neste ano'],['month','30 dias'],['week','Semana'],['day','Hoje']],
  topic:[['all','Todos'],['ai','IA e LLM'],['machine-learning','Machine learning'],['game','Jogos'],['game-engine','Motores de jogo'],['emulator','Emuladores'],['self-hosted','Self-hosted'],['cli','Linha de comando'],['web','Apps web'],['mobile','Android'],['desktop','Desktop'],['security','Segurança'],['automation','Automação'],['docker','Docker']],
  updated:[['any','Qualquer data'],['week','Na última semana'],['month','No último mês'],['year','No último ano']],
  stars:[['any','Qualquer'],['100','100 ou mais'],['1000','1 mil ou mais'],['10000','10 mil ou mais'],['50000','50 mil ou mais']],
  license:[['any','Qualquer'],['mit','MIT'],['apache','Apache 2.0'],['gpl','GPL 3.0'],['bsd','BSD 3'],['mpl','MPL 2.0']],
  sort:[['stars','Mais estrelas'],['forks','Mais forks'],['updated','Atualizados por último']]
};
const rankingSortCaption = {stars:'mais estrelas primeiro', forks:'mais forks primeiro', updated:'atualizados por último primeiro'};
const rankingFilters = () => Object.fromEntries(Object.keys(rankingDefaults).map(key => [key, model.ranking[key]]));
const activeRankingFilters = () => Object.keys(rankingDefaults).filter(key => key !== 'sort' && model.ranking[key] !== rankingDefaults[key]).length;
try {
  const saved = JSON.parse(localStorage.getItem('orbit-ranking-filters') || '{}');
  for (const key of Object.keys(rankingDefaults)) {
    const valid = key === 'language' ? rankingLanguages.includes(saved[key]) : key === 'lists' ? ['show','hide'].includes(saved[key]) : rankingChoices[key].some(([value]) => value === saved[key]);
    if (valid) model.ranking[key] = saved[key];
  }
} catch {}
function saveRankingFilters() { try { localStorage.setItem('orbit-ranking-filters', JSON.stringify(rankingFilters())); } catch {} }
function rankingTitle(rank) {
  const topicLabel = {ai:'de IA e LLM','machine-learning':'de machine learning',game:'de jogos','game-engine':'de motores de jogo',emulator:'de emuladores','self-hosted':'self-hosted',cli:'de linha de comando',web:'de apps web',mobile:'para Android',desktop:'para desktop',security:'de segurança',automation:'de automação',docker:'de Docker'}[rank.topic];
  const subject = 'repositórios' + (topicLabel ? ' ' + topicLabel : '') + (rank.language !== 'Todos' ? ' em ' + rank.language : '');
  const sort = rank.sort === 'forks' ? 'com mais forks' : rank.sort === 'updated' ? 'atualizados por último' : 'mais estrelados';
  if (rank.period === 'week') return ['Novos da semana', 'Os ' + subject + ' criados nos últimos 7 dias, ' + sort + '.'];
  if (rank.period === 'day') return ['Novos de hoje', 'Os ' + subject + ' criados nas últimas 24 horas, ' + sort + '.'];
  if (rank.period === 'month') return ['Novos do mês', 'Os ' + subject + ' criados nos últimos 30 dias, ' + sort + '.'];
  if (rank.period === 'year') return ['Novos do ano', 'Os ' + subject + ' criados neste ano, ' + sort + '.'];
  return ['Top repositórios', 'Os ' + subject + ' ' + sort + ' do GitHub.'];
}
function rankingSelect(key, label, options) {
  return '<div class="field"><label for="ranking-' + key + '">' + label + '</label><select id="ranking-' + key + '" data-ranking-filter="' + key + '">' + options.map(([value,text]) => '<option value="' + e(value) + '"' + (value === model.ranking[key] ? ' selected' : '') + '>' + e(text) + '</option>').join('') + '</select></div>';
}
function rankingPills(key, label, extraClass = '') {
  return '<div class="filters ' + extraClass + '" role="group" aria-label="' + e(label) + '">' + rankingChoices[key].map(([value,text]) => '<button class="filter ' + (model.ranking[key] === value ? 'active' : '') + '" data-ranking-set="' + key + ':' + e(value) + '" aria-pressed="' + (model.ranking[key] === value) + '" data-spatial>' + (key === 'period' && value === 'week' ? icon('star') : '') + e(text) + '</button>').join('') + '</div>';
}
function rankingRow(repo, index) {
  const local = model.state.projects.some(project => project.fullName.toLowerCase() === repo.fullName.toLowerCase());
  const stars = new Intl.NumberFormat('pt-BR').format(repo.stars);
  return '<li class="ranking-entry"><button class="ranking-row" data-repo="' + e(repo.fullName) + '"><span class="ranking-position ' + (index < 3 ? 'ranking-podium' : '') + '" aria-hidden="true">' + (index + 1) + '</span><span class="ranking-info"><span class="ranking-identity">' + projectAvatar(repo,'ranking-avatar') + '<span class="ranking-names"><span class="ranking-owner">' + e(repo.owner) + '</span><strong>' + e(repo.name) + '</strong></span></span><span class="ranking-description">' + e(repo.description || 'Este repositório não tem uma descrição.') + '</span></span><span class="ranking-meta"><span class="ranking-stars" aria-label="' + stars + ' estrelas">' + icon('star') + stars + '</span><span class="language" data-language="' + e(repo.language) + '">' + e(repo.language || 'Sem linguagem') + '</span>' + (local ? '<span class="ranking-saved">Na biblioteca</span>' : '') + '</span>' + icon('arrow','repo-arrow') + '</button>' + favoriteButton(repo) + '</li>';
}
function renderRanking() {
  const rank = model.ranking;
  const active = document.activeElement;
  const focus = active?.dataset?.rankingSet ? '[data-ranking-set="' + active.dataset.rankingSet + '"]' : active?.id?.startsWith('ranking-') ? '#' + active.id : active?.dataset?.action === 'clear-ranking' ? '.ranking-period .filter.active' : null;
  const [title, description] = rankingTitle(rank);
  const count = activeRankingFilters();
  let html = '<button class="back-link" data-nav="explore" data-spatial>' + icon('back') + ' Voltar para Explorar</button>' +
    heading(title, description, false, rank.period === 'all' ? 'Mais estrelados' : 'Novidades no GitHub');
  html += '<section class="ranking-panel" aria-label="Filtros do ranking"><div class="ranking-line"><span class="ranking-line-label">Criados</span>' + rankingPills('period','Período de criação','ranking-period') + '</div>';
  html += '<div class="ranking-line"><span class="ranking-line-label">Tema</span>' + rankingPills('topic','Tema do repositório','topic-chips') + '</div>';
  html += '<div class="ranking-filters">' + rankingSelect('language','Linguagem',rankingLanguages.map(language => [language, language])) + rankingSelect('updated','Atualizados',rankingChoices.updated) + rankingSelect('stars','Estrelas',rankingChoices.stars) + rankingSelect('license','Licença',rankingChoices.license) + rankingSelect('sort','Ordenar por',rankingChoices.sort) + '</div>';
  html += '<div class="ranking-footer"><label class="switch-row" for="ranking-lists"><input type="checkbox" id="ranking-lists" role="switch"' + (rank.lists === 'hide' ? ' checked' : '') + '><span class="switch" aria-hidden="true"></span>Esconder listas e guias (awesome)</label>' + (count ? '<button class="button small" data-action="clear-ranking" data-spatial>' + icon('close') + ' Limpar ' + count + (count === 1 ? ' filtro' : ' filtros') + '</button>' : '') + '</div></section>';
  html += '<p class="ranking-explanation">' + (rank.period === 'all' ? 'O GitHub não publica a lista de “em alta”. Para ver o que estourou agora, use Semana ou Hoje: eles mostram os repositórios novos com mais estrelas.' : 'Repositórios criados no período escolhido.') + ' Arquivados e forks ficam de fora.</p>';
  if (rank.loading) html += '<div class="loading-screen" role="status"><span class="spinner"></span> Consultando o ranking no GitHub…</div>';
  else if (rank.error) html += '<div role="alert">' + notice(rank.error, true) + '</div><button class="button small" data-action="retry-ranking">' + icon('refresh') + ' Tentar novamente</button>';
  else if (rank.data) {
    if (rank.data.stale) html += notice(rank.data.warning, true) + '<button class="button small" data-action="retry-ranking">' + icon('refresh') + ' Tentar atualizar</button>';
    if (rank.data.partial) html += notice('O GitHub retornou uma busca parcial. A lista pode mudar quando a consulta for concluída.') + '<button class="button small" data-action="retry-ranking">' + icon('refresh') + ' Consultar novamente</button>';
    const date = new Date(rank.data.updatedAt);
    const total = Number.isFinite(rank.data.total) && rank.data.total > rank.data.items.length ? ' de ' + new Intl.NumberFormat('pt-BR').format(rank.data.total) + ' encontrados' : '';
    html += '<div class="ranking-caption"><span>' + rank.data.items.length + ' repositórios' + total + ' · ' + rankingSortCaption[rank.sort] + '</span><span>Consultado em ' + e(date.toLocaleDateString('pt-BR')) + ' às ' + e(date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})) + '</span></div>';
    html += rank.data.items.length ? '<ol class="ranking-list" aria-label="Repositórios do ranking">' + rank.data.items.map(rankingRow).join('') + '</ol>' : empty('Nenhum repositório com esses filtros.', 'Tire um filtro ou escolha um período maior.', 'search') + (count ? '<div class="ranking-empty-actions"><button class="button" data-action="clear-ranking">' + icon('close') + ' Limpar filtros</button></div>' : '');
  }
  $('#main').innerHTML = html;
  if (focus) $(focus)?.focus({preventScroll:true});
}

const rankingCache = new Map();
try {
  const saved = JSON.parse(localStorage.getItem('orbit-ranking-v2') || '[]');
  for (const [key,value] of saved.slice(0,42)) {
    if (Array.isArray(value?.data?.items) && Number.isFinite(value.timestamp)) rankingCache.set(key,value);
  }
} catch {}
function rememberRanking(key, data) {
  if (!data.stale && !data.partial) {
    rankingCache.set(key,{timestamp:Date.parse(data.updatedAt),data});
    while (rankingCache.size > 42) rankingCache.delete(rankingCache.keys().next().value);
    try { localStorage.setItem('orbit-ranking-v2',JSON.stringify([...rankingCache])); } catch {}
  }
  return data;
}
// Usada só se o servidor for de uma versão anterior, sem /api/ranking com filtros.
function rankingTermsLocal(filters) {
  const ago = days => { const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - days); return cutoff.toISOString().slice(0,10); };
  const stars = {any:0,'100':100,'1000':1000,'10000':10000,'50000':50000}[filters.stars];
  const terms = [stars ? 'stars:>=' + stars : 'stars:>0','archived:false','fork:false'];
  if (filters.language !== 'Todos') terms.push('language:"' + filters.language + '"');
  if (filters.period === 'year') { const cutoff = new Date(); cutoff.setUTCMonth(0,1); terms.push('created:>=' + cutoff.toISOString().slice(0,10)); }
  else if (filters.period !== 'all') terms.push('created:>=' + ago({month:30,week:7,day:1}[filters.period]));
  if (filters.updated !== 'any') terms.push('pushed:>=' + ago({week:7,month:30,year:365}[filters.updated]));
  const topic = {ai:'llm','machine-learning':'machine-learning',game:'game','game-engine':'game-engine',emulator:'emulator','self-hosted':'self-hosted',cli:'cli',web:'webapp',mobile:'android',desktop:'desktop-app',security:'security',automation:'automation',docker:'docker'}[filters.topic];
  if (topic) terms.push('topic:' + topic);
  const license = {mit:'mit',apache:'apache-2.0',gpl:'gpl-3.0',bsd:'bsd-3-clause',mpl:'mpl-2.0'}[filters.license];
  if (license) terms.push('license:' + license);
  if (filters.lists === 'hide') terms.push('-topic:awesome-list','-topic:awesome','-topic:resources');
  return terms.join(' ');
}
async function fetchRanking(filters) {
  const key = JSON.stringify(filters);
  const cached = rankingCache.get(key);
  if (cached && Date.now() - cached.timestamp < 600000) return cached.data;
  try {
    if (model.capabilities.ranking) {
      try {
        return rememberRanking(key, await api('/ranking?' + new URLSearchParams(filters)));
      } catch (error) {
        if (error.status !== 404) throw error;
        // A sessão pode pertencer a uma versão diferente durante uma atualização.
        model.capabilities.ranking = false;
      }
    }
    const query = rankingTermsLocal(filters);
    const narrow = filters.period === 'all' && query.startsWith('stars:>0 ');
    let result = await api('/search?q=' + encodeURIComponent(narrow ? query.replace('stars:>0','stars:>=1000') : query));
    if (narrow && result.items.length < 24) result = await api('/search?q=' + encodeURIComponent(query));
    return rememberRanking(key,{items:result.items,total:result.total,updatedAt:new Date().toISOString(),...filters,stale:false,partial:Boolean(result.incomplete)});
  } catch (error) {
    if (cached) return {...cached.data,stale:true,warning:'Não foi possível atualizar o GitHub. Exibindo a última consulta. ' + error.message};
    throw error;
  }
}

async function loadRanking() {
  const rank = model.ranking;
  const requestId = ++rank.requestId;
  rank.loading = true; rank.error = ''; rank.data = null;
  saveRankingFilters();
  if (model.route === 'ranking') renderRanking();
  try {
    const data = await fetchRanking(rankingFilters());
    if (requestId === rank.requestId) rank.data = data;
  } catch (error) { if (requestId === rank.requestId) rank.error = error.message; }
  finally { if (requestId === rank.requestId) { rank.loading = false; if (model.route === 'ranking') renderRanking(); } }
}
function weeklyRankingContent() {
  const {loading, data, error} = weeklyRanking;
  if (loading || (!data && !error)) return '<p class="shelf-empty" role="status">Consultando o ranking no GitHub…</p>';
  const retry = '<button class="button small" data-action="retry-weekly-ranking">Tentar novamente</button>';
  if (error) return notice(error,true) + retry;
  const warning = data.stale || data.partial
    ? notice(data.warning || 'O GitHub retornou apenas parte do ranking.') + retry : '';
  const list = data.items.length
    ? '<ol class="ranking-list" aria-label="Ranking semanal">' + data.items.slice(0,5).map(rankingRow).join('') + '</ol>'
    : '<p class="shelf-empty">Nenhum projeto encontrado nesta semana.</p>';
  return warning + list;
}
async function loadWeeklyRanking(force = false) {
  const container = () => $('#home-weekly-content');
  if (!container() || weeklyRanking.loading || (!force && Date.now() - weeklyRanking.checkedAt < 600000)) return;
  weeklyRanking.loading = true;
  const retryFocused = document.activeElement?.dataset.action === 'retry-weekly-ranking';
  if (retryFocused) $('[data-action="open-weekly-ranking"]')?.focus({preventScroll:true});
  container().innerHTML = weeklyRankingContent();
  try {
    weeklyRanking.data = await fetchRanking(weeklyRankingFilters);
    weeklyRanking.error = '';
  } catch (error) {
    weeklyRanking.error = error.message;
  } finally {
    weeklyRanking.checkedAt = Date.now();
    weeklyRanking.loading = false;
    const current = container();
    if (current) current.innerHTML = weeklyRankingContent();
  }
}

function recommendationKey() {
  return JSON.stringify([model.state.explorePreferences || {},(model.state.explorePins || []).map(repo=>[repo.fullName,repo.description,repo.topics]),model.state.projects.map(repo=>[repo.fullName,repo.description]),model.language]);
}
async function loadRecommendations(force = false) {
  if (!model.capabilities.exploreRecommendations || model.query || model.route !== 'explore' || hiddenHomeWidgets.has('explore-recommendations')) return;
  const explore = model.explore, key = recommendationKey();
  if (explore.key === key && (explore.loading || !force)) return;
  const requestId = ++explore.requestId;
  if (explore.key !== key) explore.data = null;
  Object.assign(explore,{key,loading:true,error:''});
  renderExplore();
  try {
    const data = await api('/explore/recommendations?language=' + encodeURIComponent(model.language));
    if (requestId === explore.requestId && key === recommendationKey()) explore.data = data;
  } catch (error) { if (requestId === explore.requestId) explore.error = error.message; }
  finally {
    if (requestId === explore.requestId) { explore.loading = false; if (model.route === 'explore' && !model.query) renderExplore(); }
  }
}
function renderExplore() {
  const isSearch = Boolean(model.query);
  if (homeDrag && !isSearch) { homeDrag.renderPending = true; return; }
  const focused = document.activeElement?.dataset;
  const focusedOrder = document.activeElement?.hasAttribute('aria-keyshortcuts') &&
    document.activeElement.closest('[data-home-order-item]')?.dataset.homeOrderItem;
  const filters = '<div class="filters" role="group" aria-label="Filtrar por linguagem">' + ['Todos','Python','JavaScript','TypeScript','Go','Rust'].map(language => '<button class="filter ' + (model.language === language ? 'active' : '') + '" data-language-filter="' + language + '" aria-pressed="' + (model.language === language) + '" data-spatial>' + language + '</button>').join('') + '</div>';
  let html = '';
  if (isSearch) {
    const repos = model.results.filter(repo=>model.language === 'Todos' || repo.language === model.language);
    const featured = repos.find(repo=>repo.fullName === model.featured) || repos[0];
    model.featured = featured?.fullName || null;
    if (model.searching) html += heading('Buscando “' + model.query + '”','Projetos públicos do GitHub.',false) + '<p role="status">Buscando no GitHub…</p>';
    else {
      html += featured ? heroHTML(featured) : heading('Nada encontrado','Tente outro termo ou escolha uma linguagem diferente.',false);
      if (model.searchError) html += notice(model.searchError,true) + '<button class="button small" data-action="retry-search">Tentar de novo</button>';
      html += shelf('Resultados para “' + model.query + '”',repos.length + ' projetos · busca ao vivo',repos.length ? repos.map(shelfTile).join('') : '<p class="shelf-empty">Nenhum projeto nesta linguagem.</p>',filters,repos.length > 8);
    }
  } else {
    const rankingAction = '<button class="button small weekly-ranking-open" data-action="open-weekly-ranking" data-spatial>Ver ranking completo</button>';
    const headingActions = (hiddenHomeWidgets.has('home-weekly') ? rankingAction : '') + homeEditButton();
    html += heading('Apps para você','Encontre projetos que combinam com o que você quer fazer.',false,'',headingActions);
    if (homeEditing) html += '<p class="home-order-hint">Arraste para reorganizar ou mover favoritos entre categorias. Para reordenar pelo teclado, use Alt + setas.</p>';
    const sections = new Map([['home-pins',homePinsShelf()]]);
    if (model.state.projects.length) {
      const title = 'Continue de onde parou';
      sections.set('home-continue',homeWidget('home-continue',title,control => shelf(title,model.state.projects.length + ' projetos na biblioteca',
        model.state.projects.map(project => projectTile(project)).join(''),control,false,'home-continue')));
    }
    if (model.capabilities.exploreRecommendations) sections.set('explore-recommendations',homeWidget('explore-recommendations','Recomendados para você',control => {
      const explore=model.explore, data=explore.key === recommendationKey() ? explore.data : null;
      let content='';
      if (explore.loading || explore.key !== recommendationKey()) content='<p class="shelf-empty" role="status">Buscando apps semelhantes aos seus interesses…</p>';
      else if (data?.needsInterests) content='<p class="shelf-empty">Busque no GitHub ou favorite projetos para receber sugestões.</p>';
      else if (!data?.items.length && !explore.error) content='<p class="shelf-empty">Nenhuma sugestão com esses interesses e linguagem. Faça outra busca ou escolha Todos.</p>';
      else if (data?.items.length) content=data.items.map(shelfTile).join('');
      if (explore.error) content='<div class="recommendation-feedback">' + notice('Não foi possível consultar as sugestões. ' + explore.error,true) + '<button class="button small" data-action="retry-recommendations">Tentar novamente</button></div>' + content;
      const caption = data?.needsInterests ? '' : data?.basis || 'Por finalidade e temas em comum';
      const warning = data?.stale || data?.partial ? notice(data.warning || 'A consulta retornou apenas parte das sugestões. Você pode tentar novamente.') +
        '<button class="button small" data-action="retry-recommendations">Atualizar sugestões</button>' : '';
      return shelf('Recomendados para você',caption,content,control + filters,false,'explore-recommendations') + warning;
    }));
    sections.set('home-weekly',homeWidget('home-weekly','Ranking semanal',control =>
      '<section class="shelf" id="home-weekly"><div class="shelf-head"><h2>Ranking semanal</h2>' +
      '<span class="shelf-caption">Projetos criados nos últimos 7 dias, por estrelas</span>' + control +
      rankingAction + '</div>' +
      '<div id="home-weekly-content">' + weeklyRankingContent() + '</div></section>'));
    sections.set('explore-editorial',homeWidget('explore-editorial','Seleção editorial',control => {
      const editorial = seeded.filter(repo=>model.language === 'Todos' || repo.language === model.language);
      return shelf('Seleção editorial','Escolhas gerais do Orbit',editorial.length ? editorial.map(shelfTile).join('') :
        '<p class="shelf-empty">Nenhum projeto editorial nesta linguagem.</p>',control,false,'explore-editorial') +
        '<p class="editorial-note">' + icon('info') + ' Cada projeto tem seus próprios requisitos de execução.</p>';
    }));
    html += '<div data-home-order-list="sections">' + homeOrderKeys('sections',sections.keys()).map(key => sections.get(key)).join('') + '</div>';
  }
  const main = $('#main');
  main.toggleAttribute('data-editing-home',homeEditing && !isSearch);
  main.innerHTML = html;
  enableHomeSectionKeyboard();
  if (focused?.languageFilter) $('[data-language-filter="' + CSS.escape(focused.languageFilter) + '"]')?.focus({preventScroll:true});
  if (focused?.action === 'edit-home' || focused?.action === 'open-weekly-ranking') {
    $('[data-action="' + focused.action + '"]')?.focus({preventScroll:true});
  }
  if (focused?.homeCategory) $('[data-home-category="' + CSS.escape(focused.homeCategory) + '"]')?.focus({preventScroll:true});
  if (focused?.homeWidget) $('[data-home-widget="' + CSS.escape(focused.homeWidget) + '"]')?.focus({preventScroll:true});
  if (focusedOrder) {
    const item = $('[data-home-order-item="' + CSS.escape(focusedOrder) + '"]');
    if (item) $('[aria-keyshortcuts]',item)?.focus({preventScroll:true});
  }
  if (!isSearch) queueMicrotask(() => {
    loadRecommendations();
    loadWeeklyRanking();
  });
}
function homeFavorites() {
  const pins = new Map();
  for (const repo of [...model.state.projects.filter(project => project.homePinned), ...(model.state.explorePins || [])]) {
    const key = repo.fullName.toLowerCase();
    if (!pins.has(key)) pins.set(key, repo);
  }
  return pins;
}
function homePinsShelf() {
  const pins = homeFavorites();
  if (!pins.size && !homeCategories.length && !homeEditing) return '<div id="home-pins"></div>';
  const grouped = new Set(homeCategories.flatMap(category => category.apps));
  const ungrouped = [...pins.keys()].filter(key => !grouped.has(key));
  const shortcuts = (scope, keys) => '<div class="pinned-shortcuts" data-home-order-list="' + e(scope) + '">' +
    homeOrderKeys(scope,keys).map(key => pinnedShortcut(pins.get(key))).join('') +
    (keys.length ? '' : '<p class="home-category-empty">' + (homeEditing ? 'Arraste apps para cá.' : 'Nenhum app') + '</p>') + '</div>';
  const add = homeEditing ? '<button class="button small" type="button" data-home-category="new">' + icon('plus') + ' Nova categoria</button>' : '';
  const loose = ungrouped.length || homeEditing ? '<div class="home-category-loose" data-home-favorite-group="pins">' +
    (homeEditing && homeCategories.length ? '<h3>Sem categoria</h3>' : '') + shortcuts('pins',ungrouped) + '</div>' : '';
  const categories = homeCategories.map(category => {
    const edit = homeEditing ? '<button class="button small" type="button" data-home-category="' + e(category.id) + '" aria-label="' +
      e('Editar categoria ' + category.name) + '">Editar</button>' : '';
    return '<section class="home-category" data-home-favorite-group="' + e(category.id) + '"><div class="home-category-heading"><h3>' +
      e(category.name) + '</h3>' + edit + '</div>' +
      shortcuts(category.id,category.apps.filter(key => pins.has(key))) + '</section>';
  }).join('');
  return '<div id="home-pins" data-home-order-item="home-pins"><section class="shelf"><div class="shelf-head"><h2 tabindex="-1">Favoritos</h2>' +
    add + '</div>' + loose + categories + '</section></div>';
}

function openHomeCategory(id) {
  if (!homeEditing) return;
  const category = homeCategory(id);
  const dialog = $('#home-category-dialog');
  const form = $('#home-category-form');
  form.dataset.categoryId = category?.id || '';
  $('#home-category-title').textContent = category ? 'Editar categoria' : 'Nova categoria';
  $('#home-category-name').value = category?.name || '';
  $('#home-category-error').textContent = '';
  $('[data-action="delete-home-category"]',form).hidden = !category;
  const favorites = [...homeFavorites()];
  $('#home-category-apps').innerHTML = favorites.length ? favorites.map(([key,repo]) => {
    const group = homeCategories.find(item => item.apps.includes(key));
    return '<label class="home-category-option"><input type="checkbox" name="app" value="' + e(key) + '"' +
      (group === category && category ? ' checked' : '') + '><span>' + e(repo.name) +
      (group && group !== category ? '<small>' + e(group.name) + '</small>' : '') + '</span></label>';
  }).join('') : '<p>Use a estrela de um app para adicioná-lo aos Favoritos.</p>';
  dialog.showModal();
  $('#home-category-name').focus();
}
function closeHomeCategory(id) {
  $('#home-category-dialog').close();
  renderExplore();
  $('[data-home-category="' + CSS.escape(id) + '"]')?.focus({preventScroll:true});
}
function submitHomeCategory(form) {
  const current = homeCategory(form.dataset.categoryId);
  const data = new FormData(form);
  const name = data.get('name').trim();
  const error = $('#home-category-error');
  if (!name) { error.textContent = 'Informe o nome da categoria.'; return; }
  if (homeCategories.some(category => category !== current && category.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
    error.textContent = 'Já existe uma categoria com esse nome.';
    return;
  }
  const favorites = homeFavorites();
  const selected = data.getAll('app').filter(key => favorites.has(key));
  const id = current?.id || 'category-' + crypto.randomUUID();
  const apps = [...new Set([...(current?.apps || []).filter(key => selected.includes(key)),...selected])];
  const updated = {id,name,apps};
  const categories = homeCategories.map(category => category === current ? updated :
    {...category,apps:category.apps.filter(key => !apps.includes(key))});
  if (!current) categories.push(updated);
  if (saveHomeCategories(categories)) closeHomeCategory(id);
  else error.textContent = 'Não foi possível salvar as categorias neste navegador.';
}

function renderLibrary(focusAction) {
  const focused = document.activeElement;
  const focusId = focused?.dataset.selectProject || focused?.dataset.project;
  const focusFavorite = focused?.dataset.pinRepo;
  const action = focusAction || ($('#main').contains(focused) && focused.dataset.action);
  const total = model.state.projects.length;
  const projects = visibleLibraryProjects();
  const selected = projects.filter(project => library.selected.has(project.id));
  library.selected = new Set(selected.map(project => project.id));
  if (!total) library.selecting = false;
  const disabled = library.pending ? ' disabled' : '';
  const selectionAction = total ? '<button class="button" data-action="library-select" aria-pressed="' + library.selecting + '"' + disabled + '>' + (library.selecting ? 'Sair da seleção' : 'Selecionar projetos') + '</button>' : '';
  const toolbar = library.selecting && projects.length ? '<div class="library-toolbar" role="group" aria-label="Ações dos projetos selecionados"><div class="library-selection-controls"><span>' + selected.length + (selected.length === 1 ? ' selecionado' : ' selecionados') + '</span><button class="button small" data-action="library-select-all"' + disabled + '>' + (selected.length === projects.length ? 'Limpar seleção' : 'Selecionar todos') + '</button></div><div class="library-batch-actions">' +
    '<button class="button small" data-action="library-pin"' + (selected.some(project => !isFavorite(project.fullName)) ? disabled : ' disabled') + '>' + icon('star') + ' Favoritar</button>' +
    '<button class="button small" data-action="library-unpin"' + (selected.some(project => isFavorite(project.fullName)) ? disabled : ' disabled') + '>Remover dos favoritos</button>' +
    '<button class="button small" data-action="library-remove"' + (selected.length ? disabled : ' disabled') + '>Remover da biblioteca</button>' +
    '<button class="button small danger" data-action="library-uninstall"' + (selected.length ? disabled : ' disabled') + '>' + icon('trash') + ' Desinstalar</button></div></div>' : '';
  const warnings = library.warnings.length ? '<div class="library-warnings" role="status"><strong>A limpeza deixou pendências</strong><ul>' + library.warnings.map(message => '<li>' + e(message) + '</li>').join('') + '</ul></div>' : '';
  const externalCleanup = (model.state.externalCleanup || []).map(item => '<div class="library-warnings"><strong>' + e(item.name) +
    ' · etapa no sistema</strong>' + (item.windows ? '<p>Remova o app em Apps instalados do Windows.</p>' : '') +
    (item.android ? '<p>Remova o app nas configurações do aparelho Android.</p>' : '') + '<div class="management-controls">' +
    (item.windows ? '<button class="button small" data-cleanup-open="' + e(item.id) + '">Abrir apps instalados</button>' : '') +
    '<button class="button small" data-cleanup-done="' + e(item.id) + '">Marcar como concluído</button></div></div>').join('');
  const filters = total ? '<div class="toolbar" role="group" aria-label="Filtrar biblioteca">' + libraryFilters.map(([key,label]) =>
    '<button class="button small ' + (library.filter === key ? 'primary' : '') + '" data-action="library-filter-' + key + '" aria-pressed="' + (library.filter === key) + '"' + disabled + '>' + e(label) + '</button>').join('') + '</div>' : '';
  $('#main').innerHTML = heading('Sua biblioteca', 'Todos os seus projetos. Cada um no seu espaço.', true, total ? total + (total === 1 ? ' projeto' : ' projetos') : 'Sua coleção', selectionAction) + filters + toolbar + warnings + externalCleanup +
    (projects.length ? '<div class="shelf-row wrap">' + projects.map(project => projectTile(project,{selectable:library.selecting})).join('') + '</div>' :
      total ? empty('Nenhum projeto neste filtro', 'Escolha outro filtro para ver seus projetos.') :
        empty('Uma biblioteca com a sua cara.', 'Baixe seu primeiro repositório do GitHub. O Orbit organiza os arquivos e ajuda você a configurar a execução.'));
  const nextFocus = action ? $('[data-action="' + CSS.escape(action) + '"]:not(:disabled)', $('#main')) :
    focusId && $('[data-' + (library.selecting ? 'select-project' : 'project') + '="' + CSS.escape(focusId) + '"]:not(:disabled)', $('#main'));
  if (action || focusId || focusFavorite) {
    const favorite = focusFavorite && $('[data-pin-repo="' + CSS.escape(focusFavorite) + '"]:not(:disabled)', $('#main'));
    (nextFocus || favorite || $('[data-action="library-select"]:not(:disabled)', $('#main')) || $('[data-action="import"]', $('#main')))?.focus({preventScroll:true});
  }
}

async function setHomePins(pinned, action) {
  const ids = [...library.selected];
  if (!ids.length || library.pending || pinPending) return;
  library.pending = true;
  renderLibrary();
  try {
    await post('/library/home-pins', {ids,pinned});
    if (!pinned) {
      for (const id of ids) {
        const project = projectById(id);
        const saved = project && exploreFavorite(project.fullName);
        if (saved) await saveExploreFavorite(saved,false);
      }
    }
    await pollState();
    toast(pinned ? 'Seleção adicionada aos favoritos.' : 'Seleção removida dos favoritos.', 'pins');
  } catch (error) { toast(error.message, 'pins'); }
  finally {
    library.pending = false;
    if (model.route === 'library') renderLibrary(action);
  }
}

const activityStatusLabels = {cloning:'Baixando projeto',installing:'Preparando dependências',running:'Em execução',stopping:'Parando tarefa',ready:'Concluído',stopped:'Parado',interrupted:'Interrompido',error:'Falha na tarefa · consulte o terminal',removed:'Removido da biblioteca'};
function activityItems() {
  const items = new Map();
  for (const event of model.state.events) {
    const project = model.state.projects.find(project => event.projectId === project.id || event.message?.startsWith(project.name + ':'));
    const key = project?.id || event.projectId || event.id;
    if (items.has(key)) continue;
    const status = project?.status || event.status || (event.type === 'error' ? 'error' : event.type === 'success' ? 'ready' : 'info');
    const structured = event.projectId && event.status === status;
    const hint = project && model.activityHints[project.id]?.status === status ? model.activityHints[project.id] : null;
    items.set(key,{key,projectId:project?.id,name:project?.name || event.projectName || 'Atividade',status,label:structured ? event.label : hint?.label || activityStatusLabels[status] || event.message,percent:structured ? event.percent : ['ready','running'].includes(status) ? 100 : hint?.percent ?? null,at:event.updatedAt || event.at});
  }
  for (const project of model.state.projects.filter(busy)) {
    if (!items.has(project.id)) items.set(project.id,{key:project.id,projectId:project.id,name:project.name,status:project.status,label:activityStatusLabels[project.status],percent:project.status === 'running' ? 100 : null,at:project.createdAt});
  }
  const priority = item => ['cloning','installing','stopping'].includes(item.status) ? 2 : item.status === 'running' ? 1 : 0;
  return [...items.values()].sort((a,b)=>priority(b)-priority(a) || Date.parse(b.at)-Date.parse(a.at));
}
function syncActivityList(container, items) {
  const existing = new Map([...container.children].filter(node=>node.dataset.activityKey).map(node=>[node.dataset.activityKey,node]));
  let position = 0;
  for (const item of items) {
    let node = existing.get(item.key);
    if (!node) {
      node = document.createElement('article'); node.className = 'activity-item'; node.dataset.activityKey = item.key;
      node.innerHTML = '<div class="activity-title"><button class="activity-open"></button><span class="activity-percent"></span><button class="button small activity-stop" hidden>' + icon('stop') + '<span></span></button></div><p class="activity-label"></p><div class="meter-shell"><progress class="activity-meter" max="100"></progress></div><time></time>';
    }
    const title = $('.activity-open',node);
    title.textContent = item.name; title.disabled = !item.projectId;
    if (item.projectId) title.dataset.project = item.projectId; else delete title.dataset.project;
    const control = $('.activity-stop',node);
    const project = projectById(item.projectId);
    if (busy(project)) {
      control.dataset.stopProject = project.id;
      syncStopButton(control,project);
      control.hidden = false;
    } else {
      if (document.activeElement === control) title.focus({preventScroll:true});
      control.hidden = true;
      delete control.dataset.stopProject;
    }
    $('.activity-label',node).textContent = item.label;
    const percent = Number.isFinite(item.percent) ? Math.max(0,Math.min(100,Math.round(item.percent))) : null;
    $('.activity-percent',node).textContent = percent === null ? '' : percent + '%';
    const meter = $('progress',node);
    meter.setAttribute('aria-label','Progresso de ' + item.name);
    meter.setAttribute('aria-valuetext',item.label + (percent === null ? '' : ': ' + percent + '%'));
    if (percent === null) meter.removeAttribute('value'); else if (meter.getAttribute('value') !== String(percent)) meter.setAttribute('value',percent);
    const shell = $('.meter-shell',node);
    shell.dataset.status = item.status; shell.dataset.indeterminate = percent === null;
    shell.dataset.active = ['cloning','installing','stopping'].includes(item.status);
    node.dataset.status = item.status;
    const time = $('time',node);
    time.dateTime = item.at || ''; time.textContent = item.at ? 'Atualizado às ' + new Date(item.at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
    if (container.children[position] !== node) container.insertBefore(node,container.children[position] || null);
    position++; existing.delete(item.key);
  }
  for (const node of existing.values()) {
    if (node.contains(document.activeElement)) {
      const next = items.length ? $('.activity-open',container) : $$('[data-nav][aria-current="page"]').find(button => button.getClientRects().length);
      next?.focus({preventScroll:true});
    }
    node.remove();
  }
  for (const node of [...container.children]) if (!node.dataset.activityKey) node.remove();
}
let activityCardTimer;
function activityCardExpiresAt(item) {
  if (['cloning','installing','stopping'].includes(item.status)) return Infinity;
  const duration = ['ready','running'].includes(item.status) ? 5000 : 20000;
  return Date.parse(item.at) + duration;
}
function renderActivities() {
  const items = activityItems();
  const tray = $('#task-progress');
  if (!tray) return;
  clearTimeout(activityCardTimer);
  const now = Date.now();
  const fresh = items.filter(item => activityCardExpiresAt(item) > now);
  const active = fresh.filter(item => ['cloning','installing','stopping','running'].includes(item.status));
  const visible = active.length ? active.slice(0,3) : fresh.slice(0,1);
  syncActivityList(tray,visible);
  tray.hidden = !visible.length;
  const nextExpiration = Math.min(...visible.map(activityCardExpiresAt));
  if (Number.isFinite(nextExpiration)) activityCardTimer = setTimeout(renderActivities,nextExpiration - now);
}
async function refreshActivityProgress() {
  if (model.activityPolling) return;
  // Servidores já abertos não têm metadados de progresso: acompanhe sua saída sem reiniciá-los.
  const projects = model.state.projects.filter(project=>['cloning','installing'].includes(project.status) && !model.state.events.some(event=>event.projectId === project.id));
  if (!projects.length) return;
  model.activityPolling = true;
  try {
    await Promise.allSettled(projects.map(async project=>{
      const {entries} = await api('/projects/' + project.id + '/logs');
      if (projectById(project.id)?.status !== project.status) return;
      const lines = entries.slice(-12).flatMap(entry=>entry.text.split(/[\r\n]+/)).reverse();
      let hint;
      for (const line of lines) {
        const git = line.match(/(Receiving objects|Resolving deltas|Counting objects|Compressing objects|Updating files):\s*(\d+)%/i);
        if (git) { hint={label:({'receiving objects':'Recebendo objetos','resolving deltas':'Resolvendo arquivos','counting objects':'Contando objetos','compressing objects':'Compactando objetos','updating files':'Gravando arquivos'})[git[1].toLowerCase()],percent:Number(git[2])}; break; }
        const build = line.match(/#\d+\s+\[(?:[^\]]*?\s)?(\d+)\/(\d+)\]/);
        if (build) { hint={label:'Compilando imagem · etapa ' + build[1] + ' de ' + build[2],percent:null}; break; }
        if (/Pulling fs layer|Downloading|Download complete|Baixando imagem oficial|Extracting/i.test(line)) { hint={label:'Baixando e preparando imagem Docker',percent:null}; break; }
        if (/Preparando imagem Docker|Instalando/i.test(line)) { hint={label:'Instalando dependências',percent:null}; break; }
      }
      if (hint) model.activityHints[project.id]={...hint,status:project.status};
    }));
    renderActivities();
  } finally { model.activityPolling=false; }
}

function sectionFor(route) {
  if (route === 'project' || route === 'app') return 'library';
  if (route === 'remote') route = model.remoteOrigin;
  return route === 'ranking' ? 'explore' : route;
}
function renderSidebar() {
  const projects = model.state.projects;
  $('#library-count').textContent = projects.length;
  $('#library-count').hidden = !projects.length;
  const section = sectionFor(model.route);
  $$('.console-nav [data-nav], .console-tools [data-nav], .tab-bar [data-nav]').forEach(node => {
    const current = node.dataset.nav === section;
    node.classList.toggle('active', current);
    if (current) node.setAttribute('aria-current','page'); else node.removeAttribute('aria-current');
  });
  const running = projects.filter(project => project.status === 'running').length;
  $('#running-dot').className = running ? 'status-dot green' : '';
  $('#running-dot').title = running ? running + (running === 1 ? ' projeto em execução' : ' projetos em execução') : '';
  renderActivities();
}
let desktopUpdate;
let desktopTrayPreference;
function syncDesktopAbout() {
  const about = $('#orbit-about');
  if (!about) return;
  const keepInTray = $('#orbit-keep-in-tray',about);
  keepInTray.disabled = desktopTrayPreference === undefined;
  keepInTray.checked = desktopTrayPreference === true;
  if (!desktopUpdate) return;
  const {version, status, nextVersion} = desktopUpdate;
  const labels = {
    unavailable:'Atualizações automáticas indisponíveis nesta edição.',
    managed:'Atualize o Orbit pelo gerenciador de pacotes do sistema.',
    'managed-update':'Uma nova versão está disponível. Atualize pelo gerenciador de pacotes do sistema.',
    idle:'Verifique se existe uma versão mais recente.',
    checking:'Verificando atualizações…',
    current:'O Orbit está atualizado.',
    downloading:'Baixando a atualização em segundo plano…',
    ready:'A atualização está pronta. Ela será instalada ao sair do Orbit com as tarefas concluídas.',
    error:'Não foi possível atualizar o Orbit. Tente verificar novamente.'
  };
  $('#orbit-version',about).textContent = 'Versão instalada ' + version;
  $('#orbit-update-status',about).textContent = (nextVersion ? 'Versão ' + nextVersion + ' · ' : '') + labels[status];
  const check = $('[data-action="orbit-check-update"]',about);
  check.hidden = ['unavailable','managed','ready'].includes(status);
  check.disabled = ['checking','downloading'].includes(status);
  $('[data-action="orbit-install-update"]',about).hidden = status !== 'ready';
}
function receiveDesktopUpdate(next) {
  if (next.status === 'downloading' && desktopUpdate?.status !== 'downloading') toast('Atualização do Orbit disponível. Baixando em segundo plano.');
  if (next.status === 'managed-update' && desktopUpdate?.nextVersion !== next.nextVersion) toast('Atualização do Orbit disponível no gerenciador de pacotes.');
  if (next.status === 'ready' && desktopUpdate?.status !== 'ready') toast('Atualização do Orbit pronta. Instale em Configurações → Sobre.');
  desktopUpdate = next;
  syncDesktopAbout();
}
function renderSettings() {
  $('#main').innerHTML = heading('Pronto para executar', 'Veja quais ferramentas estão disponíveis no seu computador.', false, 'Ambientes') + '<p class="settings-description">O Orbit prioriza a execução local e usa Docker quando o projeto precisa desse ambiente.</p><div class="toolbar"><button class="button small" data-action="refresh-runtimes" data-spatial>' + icon('refresh') + ' Verificar novamente</button></div><div id="runtimes-page" class="runtime-grid">' + (model.runtimes.length ? model.runtimes.map(runtime => '<div class="runtime-item">' + icon(runtime.name === 'Docker' ? 'layers' : 'terminal') + '<div><strong>' + e(runtime.name) + '</strong><small>' + e(runtime.available ? runtime.version : runtime.name === 'Docker' ? 'Abra o Docker Desktop ou inicie o serviço Docker.' : 'Não encontrado neste computador.') + '</small></div><span class="status-label" data-status="' + (runtime.available ? 'ready' : 'stopped') + '">' + (runtime.available ? 'Disponível' : 'Indisponível') + '</span></div>').join('') : '<div class="loading-screen"><span class="spinner"></span> Verificando ferramentas…</div>') + '</div><div class="settings-links"><a class="button small" href="https://git-scm.com/downloads" target="_blank" rel="noopener noreferrer">Instalar Git ' + icon('external') + '</a><a class="button small" href="https://docs.docker.com/get-started/get-docker/" target="_blank" rel="noopener noreferrer">Instalar Docker ' + icon('external') + '</a><a class="button small" href="https://nodejs.org/en/download" target="_blank" rel="noopener noreferrer">Instalar Node.js ' + icon('external') + '</a></div><h2 class="readme-header">Como o Orbit funciona</h2><p class="settings-description">O Orbit armazena os projetos neste computador. Você pode escolher a pasta ao adicionar um app e consultar ou mover a instalação em Gerenciar. Nenhum comando é executado durante o download. As configurações e a biblioteca são salvas automaticamente.</p><p class="settings-description">A busca usa a API pública do GitHub. Para aumentar o limite, inicie o Orbit com a variável GITHUB_TOKEN. Esta versão não oferece login para repositórios privados.</p>';
  const desktopOptions = window.orbitDesktop
    ? '<p id="orbit-version"></p><p id="orbit-update-status" role="status"></p>' +
      '<label class="checkbox-row"><input id="orbit-keep-in-tray" type="checkbox"> Manter o Orbit na bandeja ao fechar a janela</label>' +
      '<div class="settings-links"><button class="button small" data-action="orbit-check-update" hidden>Verificar atualizações</button>' +
      '<button class="button small primary" data-action="orbit-install-update" hidden>Reiniciar e atualizar</button></div>'
    : '';
  const support = model.supportUrl
    ? '<div class="settings-links"><button class="button small" type="button" aria-haspopup="dialog" aria-controls="support-dialog" data-action="open-support">' + icon('thumbs-up') + ' Apoiar o Orbit</button></div>' +
      '<p>O apoio é voluntário e ajuda a manter as próximas versões.</p>'
    : '';
  if (desktopOptions || support) {
    $('#main').insertAdjacentHTML('afterbegin','<section id="orbit-about"><h2>Sobre o Orbit</h2>' + desktopOptions + support + '</section>');
    if (desktopOptions) syncDesktopAbout();
  }
}
async function loadRuntimes() {
  try { model.runtimes = await api('/runtimes'); if (model.route === 'settings') renderSettings(); }
  catch (error) { toast('Não foi possível verificar as ferramentas. ' + error.message); }
}
function renderGitHubActions(repo) {
  const facts = $('#main .detail-facts');
  const [owner, name] = (repo.fullName || '').split('/');
  if (!facts || !/^[\w-]+$/.test(owner) || !name) return;
  const profileUrl = 'https://github.com/' + encodeURIComponent(owner);
  const endpoint = '/github/social?repo=' + encodeURIComponent(repo.fullName);
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar github-actions';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Ações no GitHub');
  facts.after(toolbar);

  const actions = [
    { id:'star', add:'Dar estrela', remove:'Remover estrela', added:'Estrela adicionada no GitHub.', removed:'Estrela removida no GitHub.', url:profileUrl + '/' + encodeURIComponent(name) },
    { id:'follow', add:'Seguir @' + owner, remove:'Deixar de seguir @' + owner, added:'Você está seguindo @' + owner + ' no GitHub.', removed:'Você deixou de seguir @' + owner + ' no GitHub.', url:profileUrl }
  ];
  const makeLink = action => {
    const link = document.createElement('a');
    link.className = 'button small';
    link.href = action.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.innerHTML = icon(action.id) + e(action.add + ' no GitHub') + icon('external');
    return link;
  };
  const makeButton = (action, initial) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button small';
    let active = initial;
    const paint = () => {
      button.innerHTML = icon(active ? 'check' : action.id) + e(active ? action.remove : action.add);
    };
    paint();
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        ({active} = await post(endpoint, { action:action.id, active:!active }));
        paint();
        toast(active ? action.added : action.removed);
      } catch (error) {
        if (error.status === 403 && button.isConnected) {
          const link = makeLink(action);
          button.replaceWith(link);
          link.focus();
        }
        toast(error.message);
      } finally { button.disabled = false; }
    });
    return button;
  };
  if (!model.capabilities.githubSocial) {
    toolbar.append(...actions.map(makeLink));
    return;
  }
  toolbar.textContent = 'Verificando ações no GitHub…';
  api(endpoint).catch(() => ({})).then(status => {
    if (!toolbar.isConnected) return;
    toolbar.replaceChildren(...actions.map(action => typeof status[action.id] === 'boolean' ? makeButton(action,status[action.id]) : makeLink(action)));
  });
}
function renderRemote(repo) {
  const previousReadme = $('#readme-content')?.dataset.repo === repo.fullName ? $('#readme-content') : null;
  $('#main').innerHTML = '<button class="back-link" data-nav="' + model.remoteOrigin + '">' + icon('back') + (model.remoteOrigin === 'ranking' ? ' Voltar para o ranking' : ' Voltar para explorar') + '</button><div class="detail-heading">' + projectAvatar(repo,'repo-logo','eager') + '<div><span class="eyebrow">' + e(repo.owner || repo.fullName.split('/')[0]) + '</span><h1>' + e(repo.name) + '</h1><div class="subline">' + e(repo.fullName) + '</div></div><div class="detail-actions"><button class="button primary" data-action="download-remote" data-spatial>' + icon('download') + ' Baixar projeto</button></div></div><p class="settings-description">' + e(repo.description || 'Explore este repositório no GitHub e leia suas instruções antes de executar.') + '</p><div class="detail-facts"><div><small>Linguagem principal</small><strong>' + e(repo.language || 'Não informada') + '</strong></div>' + (repo.stars != null ? '<div><small>Estrelas no GitHub</small><strong>' + number(repo.stars) + '</strong></div>' : '') + '<div><small>Origem</small><strong>GitHub público</strong></div></div>' + notice('Leia o README abaixo antes de baixar. Depois do download, o Orbit identifica os arquivos de configuração e você poderá escolher o ambiente e ajustar os comandos.') + '<a class="button" href="' + e(repo.url) + '" target="_blank" rel="noopener noreferrer">' + icon('github') + ' Ver no GitHub ' + icon('external') + '</a><h2 class="readme-header">' + icon('file') + ' README</h2><div id="readme-content" class="readme-content" data-repo="' + e(repo.fullName) + '">Carregando o README do GitHub…</div>';
  renderGitHubActions(repo);
  if (previousReadme) $('#readme-content').replaceWith(previousReadme); else loadRemoteReadme(repo);
}
async function loadRemoteReadme(repo) {
  const container = () => model.route === 'remote' && model.remote?.fullName === repo.fullName ? $('#readme-content') : null;
  try {
    const readme = await getRemoteReadme(repo.fullName);
    if (container()) renderReadme({fullName:repo.fullName,remote:true},readme,container());
  } catch (error) { if (container()) container().textContent = error.message; }
}
async function openRemote(fullName) {
  const local = model.state.projects.find(project => project.fullName.toLowerCase() === fullName.toLowerCase());
  if (local) return navigate('project', local.id);
  const repo = knownRepo(fullName);
  model.remote = repo || {fullName,owner:fullName.split('/')[0],name:fullName.split('/')[1],url:'https://github.com/' + fullName};
  model.remoteOrigin = model.route === 'ranking' ? 'ranking' : 'explore';
  navigate('remote');
  try {
    const detail = await api('/repository?url=' + encodeURIComponent(fullName));
    if (model.route === 'remote' && model.remote.fullName === fullName) { model.remote = detail; renderRemote(detail); }
  } catch (error) { if (model.route === 'remote') toast(error.message); }
}
function openInstallationButton() {
  return model.capabilities.openInstallationFolder
    ? '<button class="button small" data-action="open-installation">' + icon('folder') + ' Abrir pasta de instalação</button>' : '';
}
function managementHTML(project) {
  if(!model.capabilities.appManagement)return notice('Reinicie o Orbit para usar o gerenciamento de apps.');
  const disabled=busy(project)?' disabled':'';
  const rename = model.capabilities.namedProjectFolders && project.storage?.naming !== 'project'
    ? '<button class="button small" type="button" data-action="name-installation-folder"' + disabled + '>Usar nome do projeto na pasta</button>' : '';
  return '<div class="app-management"><section class="management-section"><div class="toolbar"><h2>Pasta de instalação</h2>' + openInstallationButton() + rename + '</div><p class="management-path">Arquivos do Orbit · ' + e(project.installationPath || 'Pasta padrão do Orbit') + '</p><form id="location-form" data-id="'+e(project.id)+'"><label for="project-parent">Mover para outra pasta</label><div class="management-controls"><input id="project-parent" name="parent" placeholder="Escolha a pasta de destino" required'+disabled+'><button class="button" type="button" data-action="choose-project-folder"'+(model.capabilities.folderPicker?disabled:' disabled')+'>'+icon('folder')+' Escolher pasta</button><button class="button" type="submit"'+disabled+'>Mover instalação</button></div><p class="field-help">O Orbit cria uma subpasta com o nome do projeto. A mudança inclui os arquivos baixados; as dependências podem precisar ser preparadas novamente.</p><p id="location-error" class="inline-error" role="alert"></p></form></section><section class="management-section"><h2>Área de trabalho</h2><p>Crie um ícone para abrir este app pelo Orbit. O serviço Orbit precisa estar em execução.</p><button class="button" data-action="create-shortcut"'+(model.capabilities.desktopShortcuts?disabled:' disabled')+'>'+icon('external')+' '+(project.shortcut?'Atualizar atalho':'Criar atalho na área de trabalho')+'</button><p class="field-help">'+(project.shortcut?'Atalho criado.':project.shortcutError?e(project.shortcutError):'O atalho é criado somente quando você solicita.')+'</p></section><section class="management-section management-removal"><h2>Remover este app</h2><p>Remover da biblioteca mantém os arquivos. Desinstalar apaga os arquivos e dados gerenciados pelo Orbit.</p>'+(busy(project)?'<p class="field-help">Pare o app e aguarde a tarefa atual terminar antes de mover ou remover.</p>':'')+'<div class="management-controls"><button class="button" data-action="remove-project"'+disabled+'>Remover da biblioteca</button><button class="button danger" data-action="uninstall-project"'+disabled+'>'+icon('trash')+' Desinstalar app</button></div>'+(project.externalInstaller?'<p class="field-help">Este app abriu um instalador próprio. Use também o desinstalador do Windows para remover a instalação externa.</p><button class="button small" data-action="system-uninstall"'+disabled+'>Abrir apps instalados do Windows</button>':project.kind==='android'?'<p class="field-help">A desinstalação aqui remove os arquivos locais. Para remover o app do aparelho, use as configurações do Android.</p>':'')+'</section></div>';
}
let removalRequest;
function openRemoval(mode, batch = false) {
  const projects = batch ? model.state.projects.filter(project => library.selected.has(project.id)) : [projectById(model.projectId)].filter(Boolean);
  if (!projects.length || library.pending || (!batch && busy(projects[0]))) return;
  removalRequest = {mode, batch, projects, completed:0, warnings:[]};
  $('#removal-error').textContent = '';
  $('#removal-progress').textContent = '';
  renderRemoval();
  $('#removal-dialog').showModal();
  $('#removal-cancel').focus();
}

function renderRemoval() {
  const {mode, batch, projects} = removalRequest;
  const uninstall = mode === 'uninstall';
  const subject = batch ? projects.length + (projects.length === 1 ? ' projeto' : ' projetos') : projects[0].name;
  $('#removal-title').textContent = uninstall ? 'Desinstalar ' + subject + '?' : 'Remover ' + subject + ' da biblioteca?';
  const description = uninstall
    ? 'O Orbit apagará os arquivos, dependências e dados que gerencia para ' + (batch ? 'a seleção.' : 'este app.') + ' Esta ação não pode ser desfeita.'
    : 'O Orbit removerá da biblioteca ' + (batch ? 'os projetos selecionados' : 'este app') + ' e apagará os atalhos que criou. Os arquivos baixados serão mantidos.';
  const busyHint = batch && projects.some(busy) ? ' Projetos em execução ou com tarefas ativas precisam ser parados antes da remoção.' : '';
  $('#removal-description').textContent = description + busyHint;
  $('#removal-path').textContent = batch ? '' : projects[0].installationPath || '';
  $('#removal-projects').hidden = !batch;
  $('#removal-projects').innerHTML = batch ? projects.map(project => '<li>' + e(project.fullName) + '</li>').join('') : '';
  $('#removal-confirm').textContent = uninstall ? (batch ? 'Desinstalar seleção' : projects[0].uninstallProgress || projects[0].uninstallDockerPending ? 'Retomar limpeza' : 'Desinstalar app') : 'Remover da biblioteca';
}

async function submitRemoval() {
  if (!removalRequest || $('#removal-confirm').disabled) return;
  const request = removalRequest;
  const {mode, batch, projects} = request;
  const uninstall = mode === 'uninstall';
  const button = $('#removal-confirm'), cancel = $('#removal-cancel');
  const progress = $('#removal-progress'), feedback = $('#removal-error');
  const failures = [];
  button.disabled = cancel.disabled = true;
  button.textContent = uninstall ? 'Desinstalando…' : 'Removendo…';
  feedback.textContent = '';
  progress.focus();
  try {
    for (const [index, project] of projects.entries()) {
      if (batch) progress.textContent = (index + 1) + ' de ' + projects.length + ' · ' + project.name;
      const endpoint = '/projects/' + project.id;
      try {
        const result = uninstall ? await post(endpoint + '/uninstall',{confirm:project.fullName}) : await api(endpoint,{method:'DELETE',body:'{}'});
        request.completed++;
        library.selected.delete(project.id);
        const warnings = [...(result.warnings || [])];
        request.warnings.push(...warnings.map(message => project.name + ' — ' + message));
      } catch (error) { failures.push({project,message:error.message}); }
    }
    if (request.completed) library.warnings = request.warnings;
    await pollState();
    if (failures.length) {
      request.projects = failures.map(({project}) => projectById(project.id) || project);
      feedback.textContent = failures.map(({project,message}) => batch ? project.name + ' — ' + message : message).join('\n');
      progress.textContent = request.completed ? request.completed + ' concluído(s). Você pode tentar novamente com os projetos restantes.' : '';
      return;
    }
    $('#removal-dialog').close();
    if (batch) renderLibrary('library-select');
    else navigate('library');
    const summary = batch ? request.completed + (request.completed === 1 ? ' projeto processado.' : ' projetos processados.') :
      uninstall ? 'App desinstalado do Orbit.' : 'App removido da biblioteca. Arquivos preservados.';
    toast(summary + (request.warnings.length || model.state.externalCleanup?.length ? ' Consulte as pendências na biblioteca.' : ''), 'pins');
  } finally {
    button.disabled = cancel.disabled = false;
    if (failures.length) renderRemoval();
    if (failures.length) cancel.focus();
  }
}
async function pickInstallationFolder(input,button) {
  const errorMessage = $('.inline-error',input.form);
  const dialog = input.closest('dialog');
  const formVisible = () => button.isConnected && (!dialog || dialog.open);
  const label = button.innerHTML;
  const wasFocused = document.activeElement === button;
  button.disabled = true;
  button.textContent = 'Escolhendo pasta…';
  errorMessage.textContent = '';
  try {
    const result = await post('/storage/choose');
    if (!result.cancelled && formVisible()) {
      input.value = result.path;
      input.focus();
    }
  } catch (error) {
    if (formVisible()) errorMessage.textContent = 'Não foi possível escolher a pasta. ' + error.message;
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.innerHTML = label;
      if (wasFocused && formVisible() && document.activeElement === document.body) button.focus({preventScroll:true});
    }
  }
}

function configHTML(project) {
  return (project.note ? notice(project.note) : '') + '<form id="config-form" data-id="' + project.id + '"><div class="form-grid"><div class="field"><label for="run-mode">Ambiente de execução</label><select id="run-mode" name="mode"><option value="auto"' + (project.executionPreference !== 'docker' ? ' selected' : '') + '>Automático · preferir local</option><option value="docker"' + (project.executionPreference === 'docker' ? ' selected' : '') + '>Docker</option></select><p class="field-help">No modo automático, o Orbit usa as ferramentas locais quando são compatíveis.</p></div><div class="field"><label for="run-port">Porta da aplicação</label><input id="run-port" name="port" type="number" min="0" max="65535" value="' + e(project.containerPort ?? 0) + '"><p class="field-help">Deixe 0 para usar a porta detectada pelo Orbit.</p></div><div class="field full"><label for="run-image">Imagem Docker</label><input id="run-image" name="image" value="' + e(project.image) + '" placeholder="node:22-bookworm"><p class="field-help">Usada somente no modo Docker. A imagem precisa conter o interpretador ou compilador e um shell sh.</p></div><div class="field full"><label for="run-install">Comando para instalar dependências</label><textarea id="run-install" name="install" rows="2" placeholder="Ex.: npm install">' + e(project.install) + '</textarea></div><div class="field full"><label for="run-command">Comando para executar</label><textarea id="run-command" name="command" rows="2" placeholder="Ex.: npm run dev -- --host 0.0.0.0">' + e(project.command) + '</textarea><p class="field-help">Os comandos são sugestões. Confira o README. No Linux/macOS, Python pode exigir python3.</p></div><div class="field full"><div class="checkbox-row"><input id="run-network" name="network" type="checkbox"' + (project.network ? ' checked' : '') + '><label for="run-network">Permitir acesso à rede no Docker, necessário para baixar dependências.</label></div></div><div class="field full"><div class="checkbox-row"><input id="run-trusted" name="trusted" type="checkbox"' + (project.trusted ? ' checked' : '') + '><label for="run-trusted">Revisei o projeto e os comandos. Confio neste código e quero permitir sua execução.</label></div></div></div><div class="save-row"><button class="button primary" type="submit"' + (busy(project) ? ' disabled' : '') + '>' + icon('check') + ' Salvar configuração</button><span class="field-help">Configurações avançadas; não é necessário editar para os perfis automáticos.</span></div></form><div class="danger-zone"><button class="button small" data-tab="manage">Gerenciar instalação e remoção</button></div>';
}
function renderProject() {
  const project = projectById(model.projectId);
  if (!project) return navigate('library');
  const tab = model.tab;
  $('#main').innerHTML = '<button class="back-link" data-nav="library">' + icon('back') + ' Voltar para biblioteca</button><div class="detail-heading">' + projectAvatar(project,'repo-logo','eager') + '<div><span class="eyebrow">' + e(project.fullName.split('/')[0]) + '</span><h1>' + e(project.name) + '</h1><div class="subline">' + e(project.fullName) + '</div><span class="project-version" data-version-project="' + e(project.id) + '">' + projectVersionHTML(project) + '</span></div><span id="project-status">' + statusLabel(project) + '</span><div class="detail-actions" id="project-actions"></div></div><div class="tabs" role="tablist">' + [['overview','Visão geral'],['files','Arquivos'],['terminal','Terminal'],['config','Configuração'],['manage','Gerenciar']].map(([key,label]) => '<button class="tab ' + (tab === key ? 'active' : '') + '" role="tab" id="project-tab-' + key + '" aria-controls="project-body" tabindex="' + (tab === key ? '0' : '-1') + '" aria-selected="' + (tab === key) + '" data-tab="' + key + '">' + label + '</button>').join('') + '</div><div id="project-error"></div><div id="project-body" role="tabpanel" aria-labelledby="project-tab-' + tab + '">' + (tab === 'manage' ? managementHTML(project) : tab === 'config' ? configHTML(project) : tab === 'terminal' ? '<div class="toolbar"><h2>Saída do projeto</h2><button class="button small" data-action="copy-logs">' + icon('copy') + ' Copiar</button></div><div id="log-window" class="log-window" role="log" aria-label="Saída do terminal">Aguardando saída…</div>' : tab === 'files' ? '<div class="toolbar"><button class="button small" data-action="files-root">' + icon('folder') + ' Raiz do projeto</button>' + openInstallationButton() + '</div><div id="files-location" class="file-location">/</div><div id="file-list" class="file-browser"></div><pre id="file-content" class="file-content" hidden></pre>' : '<div class="detail-facts"><div><small>Linguagem detectada</small><strong>' + e(project.language) + '</strong></div><div><small>Ambiente</small><strong>' + (project.executionEnvironment === 'local' ? 'Local' : project.executionEnvironment === 'docker' || project.executionPreference === 'docker' ? 'Docker' : 'Automático') + '</strong></div><div><small>Origem</small><strong><a href="' + e(project.url) + '" target="_blank" rel="noopener noreferrer">GitHub ' + icon('external') + '</a></strong></div></div>' + (project.note ? notice(project.note) : '') + (!project.trusted ? notice('Clique em Executar para o Orbit preparar o ambiente e as dependências.') : '') + '<h2 class="readme-header">' + icon('file') + ' README</h2><div id="readme-content" class="readme-content">Carregando instruções…</div>') + '</div>';
  updateProjectStatus();
  if (tab === 'manage') renderMaintenance(project);
  if (tab === 'overview') { renderGitHubActions(project); loadReadme(project); }
  if (tab === 'files') loadFiles('');
  if (tab === 'terminal') { model.logSignature = ''; loadLogs(); }
}
function updateProjectStatus() {
  const project = projectById(model.projectId);
  if (!project || model.route !== 'project') return;
  if ($('#project-status')) $('#project-status').innerHTML = statusLabel(project);
  if ($('#project-error')) $('#project-error').innerHTML = project.lastError ? notice(project.lastError,true) : project.status === 'cloning' ? notice('Download em andamento. A linguagem e os comandos aparecerão quando os arquivos estiverem prontos.') : '';
  if ($('#project-actions')) $('#project-actions').innerHTML = (project.status === 'running' && project.port ? '<button class="button primary" data-open-app="' + project.id + '" data-spatial>' + icon('window') + ' Abrir no Orbit</button><a class="button" href="http://127.0.0.1:' + Number(project.port) + '" target="_blank" rel="noopener noreferrer" data-spatial>' + icon('external') + ' Nova aba</a>' : '') + (notRunnable(project) && !busy(project) ? '<button class="button" data-tab="overview">' + icon('file') + ' Ler README</button>' : busy(project) ? stopButton(project,'danger') : '<button class="button" data-action="install-project">' + icon('download') + ' Instalar</button><button class="button primary" data-action="start-project">' + icon('play') + ' Executar</button>');
  const actions = $('#project-actions');
  if (!actions || busy(project)) return;
  if (project.uninstallProgress || project.uninstallDockerPending) {
    actions.innerHTML = '<button class="button danger" data-action="uninstall-project">Retomar limpeza</button>';
  } else if (project.availableRelease && !notRunnable(project)) {
    actions.insertAdjacentHTML('afterbegin','<button class="button" data-action="update-project">' + icon('refresh') + ' Atualizar para ' + e(project.availableRelease.tag) + '</button>');
  }
}
function renderMaintenance(project) {
  const management = $('.app-management');
  if (!management) return;
  const disabled = busy(project) ? ' disabled' : '';
  const pending = project.uninstallProgress || (project.uninstallDockerPending ? {step:'docker'} : null);
  if (pending) {
    const labels = {docker:'Recursos Docker',shortcut:'Atalho',logs:'Registros',files:'Arquivos locais'};
    const completed = (pending.completed || []).map(step => labels[step]).filter(Boolean);
    $('[data-action="uninstall-project"]',management).textContent = 'Retomar limpeza';
    $('.management-removal',management).insertAdjacentHTML('afterbegin','<div class="library-warnings" role="status"><strong>Desinstalação pendente</strong><p>' +
      e(pending.error || 'A limpeza pode ser retomada.') + '</p>' + (completed.length ? '<p>Concluído · ' + e(completed.join(', ')) + '</p>' : '') +
      (labels[pending.step] ? '<p>Etapa pendente · ' + e(labels[pending.step]) + '</p>' : '') + '</div>');
    return;
  }
  const previous = project.previousRelease?.tag || (!project.installedRelease && (project.previousSource?.tag || project.previousSource?.version));
  management.insertAdjacentHTML('afterbegin','<section class="management-section"><h2>Reparo e versões</h2>' +
    (project.sourceMissing ? '<p>A pasta do código local está ausente.</p>' : '') +
    '<div class="management-controls"><button class="button" data-action="repair-project"' + disabled + '>' + icon('refresh') + ' Reparar instalação</button>' +
    (previous ? '<button class="button" data-action="rollback-project"' + disabled + '>Voltar para ' + e(previous) + '</button>' : '') +
    '</div></section>');
}
async function loadReadme(project) {
  if (project.status === 'cloning') { $('#readme-content').textContent = 'O README estará disponível quando o download terminar.'; return; }
  try {
    let readme;
    let readmeProject = project;
    try {
      readme = await getProjectReadme(project);
    } catch (error) {
      if (error.status !== 404) throw error;
      readme = await getRemoteReadme(project.fullName).catch(() => { throw error; });
      readmeProject = {...project, remote:true};
    }
    const container = $('#readme-content');
    if (model.projectId !== project.id || !container) return;
    renderReadme(readmeProject,readme,container);
    if (readmeProject.remote) {
      const source = document.createElement('p');
      source.textContent = 'README do repositório no GitHub';
      container.prepend(source);
    }
  } catch(error) { if (model.projectId === project.id && $('#readme-content')) $('#readme-content').textContent = error.message; }
}
async function loadFiles(relative) {
  model.filePath = relative;
  const id = model.projectId;
  try {
    const files = await api('/projects/' + id + '/files?path=' + encodeURIComponent(relative || '.'));
    if (model.projectId !== id || !$('#file-list') || model.filePath !== relative) return;
    $('#file-content').hidden = true; $('#files-location').textContent = '/' + relative;
    const parent = relative.split('/').slice(0,-1).join('/');
    $('#file-list').innerHTML = (relative ? '<button class="file-row" data-directory="' + e(parent) + '">' + icon('back') + ' ..</button>' : '') + files.map(file => '<button class="file-row" ' + (file.directory ? 'data-directory' : 'data-file') + '="' + e((relative ? relative + '/' : '') + file.name) + '">' + icon(file.directory ? 'folder' : 'file') + e(file.name) + (file.link ? ' (link)' : '') + '</button>').join('');
    if (!files.length) $('#file-list').innerHTML += '<p class="muted">Esta pasta está vazia.</p>';
  } catch(error) { if ($('#file-list')) $('#file-list').innerHTML = notice(error.message,true); }
}
async function openFile(relative) {
  const id = model.projectId;
  try {
    const {content} = await api('/projects/' + id + '/file?path=' + encodeURIComponent(relative));
    if (model.projectId !== id || !$('#file-content')) return;
    $('#file-content').textContent = content; $('#file-content').hidden = false; $('#files-location').textContent = '/' + relative;
  } catch(error) { toast(error.message); }
}
function renderTerminal() {
  const projects = model.state.projects;
  $('#main').innerHTML = heading('Cada processo, em tempo real', 'Acompanhe downloads, instalações e execuções.', false, 'Terminal') + (projects.length ? '<div class="toolbar"><label for="terminal-project">Projeto</label><select id="terminal-project" class="terminal-select">' + projects.map(project => '<option value="' + project.id + '"' + (project.id === model.projectId ? ' selected' : '') + '>' + e(project.name) + '</option>').join('') + '</select><button class="button small" data-action="copy-logs">' + icon('copy') + ' Copiar</button></div><div id="log-window" class="log-window" role="log" aria-label="Saída do terminal"></div>' : empty('O terminal está pronto.', 'Adicione um projeto pela Biblioteca para acompanhar o download, a instalação e a execução.','terminal'));
  if (projects.length) { model.projectId = $('#terminal-project').value; model.logSignature = ''; loadLogs(); }
}
async function loadLogs() {
  if (!$('#log-window') || !model.projectId) return;
  const id = model.projectId;
  try {
    const {entries} = await api('/projects/' + id + '/logs');
    if (model.projectId !== id || !$('#log-window')) return;
    const signature = JSON.stringify(entries);
    if (signature === model.logSignature) return;
    model.logSignature = signature;
    const box = $('#log-window'); const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = entries.length ? entries.map(entry => '<span class="log-line" data-stream="' + e(entry.stream) + '"><span class="log-time">' + new Date(entry.at).toLocaleTimeString('pt-BR') + '</span>' + e(entry.text) + '</span>').join('') : 'Nenhuma saída nesta sessão. Instale ou execute o projeto para começar.';
    if (atBottom) box.scrollTop = box.scrollHeight;
  } catch(error) { if ($('#log-window')) $('#log-window').textContent = error.message; }
}
const loadingTips = [
  'A primeira execução é a mais demorada. As próximas reaproveitam o ambiente já montado.',
  'O Orbit usa o ambiente compatível com o projeto.',
  'Quando o app ficar pronto, ele abre aqui mesmo, dentro do Orbit.',
  'Aperte T a qualquer momento para ver cada comando no terminal completo.',
  'Downloads grandes dependem da sua internet. Pode deixar o Orbit trabalhando.',
  'Se algo der errado, o projeto continua salvo. É só tentar de novo.'
];
const loadingStages = {native:['Procurar versão','Baixar','Preparar','Abrir'], download:['Baixar','Organizar','Pronto'], run:['Preparar','Ligar o Docker','Montar o ambiente','Instalar','Abrir o app'], install:['Preparar','Ligar o Docker','Montar o ambiente','Instalar','Pronto'], localRun:['Preparar','Ferramentas','Ambiente local','Dependências','Abrir o app'], localInstall:['Preparar','Ferramentas','Ambiente local','Dependências','Pronto']};
// Traduz uma linha do terminal para uma frase curta, com a etapa a que ela pertence.
function nativeLine(entry) {
  const text = String(entry.text || '').trim();
  let m;
  if (/^Execução no Windows|^Procurando uma versão/.test(text)) return {stage:0, text:'Procurando uma versão pronta para Windows'};
  if ((m = text.match(/^Versão encontrada: (.+)/))) return {stage:0, text:'Versão encontrada: ' + m[1]};
  if ((m = text.match(/^Baixando (.+?): (\d+)%/))) return {stage:1, text:'Baixando ' + m[1], percent:Number(m[2])};
  if (/^(Download concluído|Arquivo já baixado)/.test(text)) return {stage:1, text:'Download concluído'};
  if (/^Nenhuma versão pronta/.test(text)) return {stage:2, text:'Preparando a partir do código-fonte'};
  if ((m = text.match(/^(Extraindo|Criando o ambiente|Instalando dependências|Compilando)(.*)/))) return {stage:2, text:m[1] + m[2]};
  if ((m = text.match(/^(Abrindo|Terminal aberto|Instalando no aparelho)(.*)/))) return {stage:3, text:m[1] + m[2]};
  if (entry.stream === 'error' && text) return {stage:-1, text:text.length > 140 ? text.slice(0,140) + '…' : text, error:true};
  return null;
}
function friendlyLine(entry) {
  const text = String(entry.text || '').trim();
  let m;
  if (/^Baixando https?:\/\//.test(text)) return {stage:0, text:'Baixando o projeto do GitHub'};
  if ((m = text.match(/(Receiving objects|Recebendo objetos):\s*(\d+)%/i))) return {stage:0, text:'Recebendo os arquivos', percent:Number(m[2])};
  if ((m = text.match(/(Resolving deltas|Updating files):\s*(\d+)%/i))) return {stage:1, text:'Organizando os arquivos', percent:Number(m[2])};
  if (/Preparação Docker automática|Identificando dependências/i.test(text)) return {stage:0, text:'Lendo o projeto e escolhendo o ambiente'};
  if (/Preparando dependências locais|Preparando o conversor local/i.test(text)) return {stage:2, text:'Preparando o ambiente local'};
  if (/Aguardando o app local responder/i.test(text)) return {stage:4, text:text.trim()};
  if (/Docker desligado|Iniciando automaticamente/i.test(text)) return {stage:1, text:'Ligando o Docker Desktop'};
  if ((m = text.match(/Aguardando o Docker Desktop[^…]*…\s*([^(]+)/i))) return {stage:1, text:'Esperando o Docker ligar · ' + m[1].trim()};
  if (/Aguardando o mecanismo Docker/i.test(text)) return {stage:1, text:'Esperando o Docker ligar'};
  if (/Docker (iniciado e )?pronto/i.test(text)) return {stage:1, text:'Docker pronto'};
  if ((m = text.match(/#\d+\s+\[(?:[^\]]*?\s)?(\d+)\/(\d+)\]/))) { const installing = /npm|pnpm|yarn|bun|pip|cargo|go mod|mvn|cmake|install/i.test(text); return {stage:installing ? 3 : 2, text:(installing ? 'Instalando as dependências' : 'Montando o ambiente') + ' · etapa ' + m[1] + ' de ' + m[2], percent:installing ? null : Math.round(Number(m[1]) / Number(m[2]) * 100)}; }
  if (/Pulling|Downloading|Download complete|Extracting|Baixando imagem/i.test(text)) return {stage:2, text:'Baixando a base do ambiente'};
  if (/Preparando imagem Docker|docker build|Building/i.test(text)) return {stage:2, text:'Montando o ambiente'};
  if (/\b(npm (ci|install)|pnpm install|yarn install|bun install|pip install|cargo (build|fetch)|go mod download|mvn |added \d+ packages|Collecting |Installing collected)/i.test(text)) return {stage:3, text:'Instalando as dependências'};
  if (/(Local:|listening|ready in|Running on|started server|Uvicorn running|http:\/\/(0\.0\.0\.0|localhost|127\.0\.0\.1))/i.test(text)) return {stage:4, text:'Quase lá: o app está ligando'};
  if (entry.stream === 'error' && text && !/^#\d+/.test(text)) return {stage:-1, text:text.length > 140 ? text.slice(0,140) + '…' : text, error:true};
  return null;
}
function operationOf(project) {
  if (project.status === 'cloning') return 'download';
  if (nativeKind(project)) return 'native';
  const install = model.appOperation === 'install';
  return project.executionEnvironment === 'local' ? (install ? 'localInstall' : 'localRun') : (install ? 'install' : 'run');
}
function loadingHTML(project) {
  const operation = operationOf(project);
  const stages = loadingStages[operation];
  return '<div class="loading-stage" id="loading-stage" data-operation="' + operation + '"><div class="loading-art" data-language="' + e(project.language) + '">' + projectAvatar(project,'hero-avatar','eager') + '</div><div class="loading-copy"><span class="eyebrow">' + (operation === 'download' ? 'Baixando projeto' : ['install','localInstall'].includes(operation) ? 'Instalando' : 'Iniciando') + '</span><h1>' + e(project.name) + '</h1><p class="loading-step" id="loading-step" aria-live="polite">Preparando tudo…</p><div class="loading-meter"><span id="loading-bar"></span></div><div class="loading-meta"><span id="loading-detail"></span><span id="loading-time"></span></div><ol class="loading-stages" id="loading-stages">' + stages.map((label,index) => '<li data-index="' + index + '"><span class="stage-dot">' + icon('check') + '</span>' + e(label) + '</li>').join('') + '</ol><p class="loading-tip" id="loading-tip">' + e(loadingTips[model.tipIndex % loadingTips.length]) + '</p><button class="loading-key" data-action="toggle-log" data-spatial><kbd>T</kbd> Ver o terminal completo</button></div></div>' + logDrawerHTML();
}
function logDrawerHTML() {
  return '<aside class="log-drawer" id="log-drawer" hidden aria-label="Terminal completo"><div class="toolbar"><h2>' + icon('terminal') + ' Terminal</h2><button class="button small" data-action="copy-logs">' + icon('copy') + ' Copiar</button><button class="button small" data-action="toggle-log">Fechar <kbd>Esc</kbd></button></div><div id="log-window" class="log-window" role="log" aria-label="Saída do terminal">Carregando…</div></aside>';
}
function toggleLogDrawer(force) {
  const drawer = $('#log-drawer');
  if (!drawer) return;
  const open = force ?? drawer.hidden;
  drawer.hidden = !open;
  if (open) { model.logSignature = ''; loadLogs().then(() => { const box = $('#log-window'); if (box) box.scrollTop = box.scrollHeight; }); $('[data-action=toggle-log]', drawer)?.focus(); }
  else $('.loading-key, .app-message [data-action=toggle-log]')?.focus();
}
async function updateLoading() {
  const project = projectById(model.projectId);
  const stage = $('#loading-stage');
  if (!project || !stage) return;
  let entries = [];
  try { entries = (await api('/projects/' + project.id + '/logs')).entries; } catch { return; }
  if (!$('#loading-stage')) return;
  const operation = stage.dataset.operation;
  const stages = loadingStages[operation];
  const startIndex = Math.max(0, entries.map(entry => /^Execução no Windows|^Execução local|^Baixando https?:\/\/|Preparação Docker automática|Instalando dependências|Executando/.test(entry.text || '')).lastIndexOf(true));
  const session = entries.slice(startIndex);
  let reached = 0, latest = null;
  for (const entry of session) { const info = operation === 'native' ? nativeLine(entry) : friendlyLine(entry); if (!info) continue; if (info.stage >= 0) reached = Math.max(reached, Math.min(info.stage, stages.length - 1)); latest = info.error ? {...latest, error:info.text} : info; }
  const hint = model.activityHints[project.id];
  if (hint?.label && !latest) latest = {text:hint.label, percent:hint.percent};
  $('#loading-step').textContent = latest?.text ? latest.text + '…' : 'Preparando tudo…';
  $('#loading-detail').textContent = latest?.error ? 'Última mensagem: ' + latest.error : '';
  const share = 1 / stages.length;
  const within = Number.isFinite(latest?.percent) && latest.stage === reached ? latest.percent / 100 : 0.45;
  $('#loading-bar').style.width = Math.min(98, Math.round((reached + within) * share * 100)) + '%';
  $$('#loading-stages li').forEach(item => { const index = Number(item.dataset.index); item.classList.toggle('done', index < reached); item.classList.toggle('current', index === reached); });
  const since = session[0]?.at ? Date.now() - Date.parse(session[0].at) : 0;
  const seconds = Math.max(0, Math.round(since / 1000));
  $('#loading-time').textContent = seconds ? (seconds >= 60 ? Math.floor(seconds / 60) + ' min ' : '') + (seconds % 60) + ' s' : '';
  if (Date.now() - model.tipAt > 7000) { model.tipAt = Date.now(); model.tipIndex++; const tip = $('#loading-tip'); tip.classList.remove('swap'); void tip.offsetWidth; tip.classList.add('swap'); tip.textContent = loadingTips[model.tipIndex % loadingTips.length]; }
  if (!$('#log-drawer')?.hidden) await loadLogs();
}
function appBarHTML(project) {
  return '<button class="back-link" data-project="' + project.id + '" data-spatial>' + icon('back') + ' Projeto</button><div class="app-title">' + projectAvatar(project,'repo-logo','eager') + '<div><strong>' + e(project.name) + '</strong><small>' + e(project.fullName) + '</small></div><span id="app-status">' + statusLabel(project) + '</span></div><div class="app-actions">' + (project.status === 'running' && project.port ? '<button class="glass-pill icon-pill" data-action="reload-app" aria-label="Recarregar o app" title="Recarregar" data-spatial>' + icon('refresh') + '</button><button class="glass-pill icon-pill" data-action="fullscreen-app" aria-label="Tela cheia" title="Tela cheia" data-spatial>' + icon('expand') + '</button><a class="glass-pill icon-pill" href="http://127.0.0.1:' + Number(project.port) + '" target="_blank" rel="noopener noreferrer" aria-label="Abrir em uma nova aba" title="Abrir em uma nova aba" data-spatial>' + icon('external') + '</a>' : '') + (busy(project) ? stopButton(project,'danger small') : '') + '</div>';
}
function updateAppBar() {
  const project = projectById(model.projectId);
  if (project && $('#app-status')) $('#app-status').innerHTML = statusLabel(project);
}
function appMessage(glyph, title, text, actions) {
  return '<div class="app-message">' + icon(glyph) + '<h2>' + e(title) + '</h2><p>' + e(text) + '</p><div class="inline-actions">' + actions + '</div></div>';
}
function nativeHTML(project, back) {
  const install = nativeRequest?.id === project.id && nativeRequest.action === 'install';
  const copy = nativeCopy[project.kind] || {icon:'play',title:'Executar localmente',text:'O Orbit prepara as dependências no computador e abre o app no navegador.',button:'Executar localmente'};
  const failed = project.status === 'error' && project.lastError;
  const result = !failed && surfaceResult(project);
  return '<div class="app-message native-run">' + icon(copy.icon) + '<span class="eyebrow">' + e(kindTitles[project.kind] || 'App web') + '</span><h2>' + e(install ? 'Instalar localmente' : copy.title) + '</h2><p>' + e(install ? 'O Orbit prepara as dependências deste projeto no computador.' : copy.text) + '</p>'
    + (failed ? notice(project.lastError, true) : result ? notice(result) : '')
    + (!project.nativeConsent ? '<p class="native-warning">' + icon('shield') + '<span>O Orbit executa o código com as permissões do seu usuário. Continue se você confia no projeto.</span></p>' : '')
    + (project.kind === 'mcp' ? '<div id="mcp-panel" class="mcp-panel"><span class="spinner"></span> Descobrindo como conectar…</div>' : '')
    + '<div class="inline-actions"><button class="button primary" data-action="start-native" data-spatial>' + icon(project.kind === 'native' ? 'play' : copy.icon) + ' ' + e(install ? 'Instalar localmente' : failed ? 'Tentar de novo' : copy.button) + '</button><button class="button" data-action="toggle-log" data-spatial><kbd>T</kbd> Terminal</button>' + back + '</div></div>';
}
async function loadMcp(project) {
  let info;
  try { info = await api('/projects/' + project.id + '/mcp'); } catch (error) { if ($('#mcp-panel')) $('#mcp-panel').textContent = error.message; return; }
  const panel = $('#mcp-panel');
  if (!panel || model.projectId !== project.id) return;
  if (!info.launch) { panel.textContent = 'Não foi possível descobrir o comando deste servidor. Veja o README.'; return; }
  const command = [info.launch.command, ...info.launch.args].map(part => /\s/.test(part) ? '"' + part + '"' : part).join(' ');
  const client = (key, label) => '<button class="button small' + (info.clients[key] ? '' : '" disabled title="' + e(label) + ' não foi encontrado neste computador') + '" data-action="mcp-connect" data-client="' + key + '" data-spatial>' + icon('plus') + ' Conectar ao ' + e(label) + '</button>';
  panel.innerHTML = '<small>Comando do servidor</small><code>' + e(command) + '</code><div class="inline-actions">' + client('claude','Claude Code') + client('codex','Codex') + '<button class="button small" data-action="copy-mcp" data-command="' + e(command) + '" data-spatial>' + icon('copy') + ' Copiar comando</button></div>';
}
async function renderApp() {
  const project = projectById(model.projectId);
  if (!project) return navigate('library');
  if (project.status === 'running' && project.surface === 'window') return navigate('project', project.id);
  if (model.appOperation === 'install' && project.status === 'ready' && project.windowsPackage === 'installer' && project.systemInstall) {
    return navigate('project', project.id);
  }
  const requestId = ++model.appRequest;
  model.appPort = project.status === 'running' ? Number(project.port) || 0 : 0;
  const back = '<button class="button" data-project="' + project.id + '" data-spatial>' + icon('back') + ' Voltar para o projeto</button>';
  $('#main').innerHTML = '<section class="app-stage" aria-label="App ' + e(project.name) + '"><div class="app-bar">' + appBarHTML(project) + '</div><div class="app-frame-wrap" id="app-frame-wrap"><div class="app-loading" id="app-loading"><span class="spinner"></span><span>Abrindo ' + e(project.name) + '…</span></div></div></section>';
  const wrap = $('#app-frame-wrap');
  hideDock(); if (dockObserver) { dockObserver.disconnect(); dockObserver.observe(wrap); }
  model.appStatus = project.status;
  if (!model.appPort) {
    if (nativeKind(project) && project.status === 'running') { const monitored = project.surface === 'process'; wrap.innerHTML = appMessage(monitored ? 'terminal' : 'window', monitored ? 'Em execução no Orbit' : 'Aberto no Windows', monitored ? (project.surfaceDetail || project.name) + ' está em execução. O Orbit acompanha a saída e tenta corrigir falhas reconhecidas. Use Parar para encerrar.' : (project.surfaceDetail || project.name) + ' está aberto numa janela do Windows. Feche a janela dele quando terminar, ou clique em Parar.', '<button class="button" data-action="toggle-log" data-spatial><kbd>T</kbd> Ver o terminal completo</button>' + back) + logDrawerHTML(); return; }
    if (project.status === 'stopping') { wrap.innerHTML = appMessage('stop', 'Interrompendo a tarefa…', 'O Orbit está encerrando o processo do projeto.', back); return; }
    if (busy(project)) { wrap.innerHTML = loadingHTML(project); updateLoading(); return; }
    if (project.status === 'interrupted' && project.language === 'Detectando') { wrap.innerHTML = appMessage('stop', 'Download interrompido', 'Remova o projeto da biblioteca e adicione-o de novo para baixar os arquivos.', back); return; }
    if (nativeKind(project) || (nativeRequest?.id === project.id && !project.nativeConsent)) { wrap.innerHTML = nativeHTML(project, back) + logDrawerHTML(); if (project.kind === 'mcp') loadMcp(project); return; }
    const run = '<button class="button primary" data-action="start-from-app" data-spatial>' + icon('play') + ' Executar</button>';
    const terminal = '<button class="button" data-action="toggle-log" data-spatial><kbd>T</kbd> Ver o terminal completo</button>';
    if ((project.status === 'error' || project.status === 'interrupted') && !notRunnable(project)) wrap.innerHTML = appMessage('info', project.status === 'error' ? 'Não deu certo desta vez' : 'A tarefa foi interrompida', (project.lastError || 'A última tarefa terminou antes de o app abrir.') + ' O projeto continua salvo.', run.replace('Executar','Tentar de novo') + terminal + back) + logDrawerHTML();
    else if (notRunnable(project)) { const kind = project.language === 'Documentação' ? 'docs' : project.kind; wrap.innerHTML = appMessage(kindIcons[kind] || 'info', kindTitles[kind] || 'Este projeto não tem um app para abrir', project.note || 'Ele não tem uma tela para abrir no navegador.', '<button class="button primary" data-project="' + project.id + '" data-spatial>' + icon('file') + ' Ler README</button>'); }
    else wrap.innerHTML = appMessage('check', model.appOperation === 'download' || model.appOperation === 'install' ? 'Tudo pronto' : 'O app não está em execução', model.appOperation === 'download' ? 'O projeto foi baixado. Execute para abrir o app aqui dentro do Orbit.' : 'Execute o projeto para abrir o app aqui dentro do Orbit.', run + back) + logDrawerHTML();
    return;
  }
  // O app já está aberto em outra aba: volta para ele sem recarregar.
  if (frames.get(project.id)?.port === model.appPort) { showFrame(project.id); return; }
  for (let attempt = 0; attempt < 150; attempt++) {
    let info;
    try { info = await api('/projects/' + project.id + '/frame'); } catch (error) { info = {running:true, reachable:false, reason:error.message}; }
    if (requestId !== model.appRequest || model.route !== 'app') return;
    if (!info.running) { wrap.innerHTML = appMessage('play', 'O app não está em execução', 'O projeto parou antes de o app abrir. Veja o terminal do projeto para entender o que aconteceu.', back); return; }
    const newTab = '<a class="button primary" href="' + e(info.url) + '" target="_blank" rel="noopener noreferrer" data-spatial>' + icon('external') + ' Abrir em uma nova aba</a>';
    if (info.reachable && !info.frameable) { wrap.innerHTML = appMessage('window', 'Este app prefere a própria janela', info.reason + ' Abra-o em uma nova aba; ele continua rodando pelo Orbit.', newTab + back); return; }
    if (info.reachable) { mountFrame(project, info.url); return; }
    $('#app-loading span:last-child') && ($('#app-loading span:last-child').textContent = 'Esperando ' + project.name + ' responder…');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (requestId === model.appRequest && model.route === 'app') wrap.innerHTML = appMessage('info', 'O app não respondeu', 'O projeto está em execução, mas o endereço http://127.0.0.1:' + model.appPort + ' não respondeu. Veja o terminal do projeto para entender o que aconteceu.', back + '<button class="button" data-action="reload-view" data-spatial>' + icon('refresh') + ' Tentar de novo</button>');
}
// Mantém os apps web abertos ao navegar entre telas.
const frames = new Map();
let activeFrame = null;
const dockObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => placeDock()) : null;
let placeUntil = 0;
function hideDock() { const dock = $('#frame-dock'); if (dock) dock.hidden = true; }
function placeDock() {
  const dock = $('#frame-dock'), wrap = $('#app-frame-wrap');
  if (!dock || dock.hidden || !wrap || model.route !== 'app' || document.fullscreenElement === dock) return;
  const rect = wrap.getBoundingClientRect();
  Object.assign(dock.style, {left:rect.left + 1 + 'px', top:rect.top + 1 + 'px', width:Math.max(rect.width - 2,0) + 'px', height:Math.max(rect.height - 2,0) + 'px'});
}
// Segue a área do app durante a animação de entrada da tela.
function followDock() { placeUntil = performance.now() + 500; const step = () => { placeDock(); if (performance.now() < placeUntil) requestAnimationFrame(step); }; requestAnimationFrame(step); }
function revealFrame() { $('#frame-dock').hidden = false; $('#app-loading')?.setAttribute('hidden',''); followDock(); }
function showFrame(id) {
  const entry = frames.get(id);
  if (!entry) return false;
  activeFrame = id;
  for (const [key, item] of frames) { item.el.classList.toggle('active', key === id); if (key === id) item.el.id = 'app-frame'; else item.el.removeAttribute('id'); }
  if (entry.loaded) revealFrame(); else hideDock();
  return true;
}
function mountFrame(project, url) {
  dropFrame(project.id);
  const frame = document.createElement('iframe');
  frame.title = project.name; frame.src = url; frame.referrerPolicy = 'no-referrer';
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-pointer-lock allow-presentation');
  frame.setAttribute('allow','clipboard-read; clipboard-write; fullscreen; microphone; camera; autoplay');
  const entry = { el:frame, port:model.appPort, loaded:false };
  const reveal = () => { if (entry.loaded) return; entry.loaded = true; if (activeFrame === project.id && model.route === 'app' && model.projectId === project.id) revealFrame(); };
  frame.addEventListener('load', reveal);
  // Apps que carregam arquivos pesados (modelos 3D, vídeos) já mostram a interface antes do evento load: não esconde o app por mais de 5 s.
  entry.revealTimer = setTimeout(reveal, 5000);
  frames.set(project.id, entry);
  $('#frame-dock').appendChild(frame);
  showFrame(project.id);
}
function dropFrame(id) { const entry = frames.get(id); if (!entry) return; clearTimeout(entry.revealTimer); entry.el.remove(); frames.delete(id); if (activeFrame === id) activeFrame = null; }
// Fecha os apps que pararam ou mudaram de porta, e esquece projetos removidos.
function pruneFrames() {
  for (const [id, entry] of [...frames]) { const project = projectById(id); if (!project || project.status !== 'running' || Number(project.port) !== entry.port) dropFrame(id); }
}
window.addEventListener('resize', placeDock);
document.addEventListener('fullscreenchange', followDock);
function navigate(route, id) {
  finishHomeDrag();
  homeEditing = false;
  $('#main').removeAttribute('data-editing-home');
  model.route = route;
  if (id) { model.projectId = id; model.tab = 'overview'; }
  if (route !== 'app') hideDock();
  $('.app-shell').dataset.route = route;
  renderSidebar();
  if (route === 'explore') renderExplore();
  if (route === 'ranking') { renderRanking(); loadRanking(); }
  if (route === 'library') renderLibrary();
  if (route === 'settings') renderSettings();
  if (route === 'project') renderProject();
  if (route === 'remote') renderRemote(model.remote);
  if (route === 'terminal') renderTerminal();
  if (route === 'app') renderApp();
  $('#main').scrollTop = 0; window.scrollTo(0,0);
  history.replaceState(null,'','#' + route + (id ? '/' + id : ''));
}
async function search(query) {
  model.query = query.trim(); model.language = 'Todos'; model.searchError = '';
  if (!model.query) { model.requestId++; model.searching = false; navigate('explore'); return; }
  const requestId = ++model.requestId;
  model.searching = true; navigate('explore');
  try {
    const data = await api('/search?q=' + encodeURIComponent(model.query));
    if (requestId !== model.requestId) return;
    model.results = data.items;
    if (model.capabilities.exploreRecommendations) {
      const recentQuery = model.query.slice(0,200);
      try { const preferences = await post('/explore/preferences',{lastSearch:recentQuery,intent:''}); if (requestId === model.requestId) model.state.explorePreferences = preferences; } catch {}
    }
  } catch(error) { if (requestId !== model.requestId) return; model.results = []; model.searchError = error.message; }
  finally { if (requestId === model.requestId) { model.searching = false; if (model.route === 'explore') renderExplore(); } }
}
async function pollState() {
  try {
    const state = await api('/state');
    const signature = JSON.stringify(state);
    model.connected = true; $('#connection-status').textContent = 'Conectado ao workspace'; $('#connection-status').hidden = true; $('#connection-dot').classList.add('green');
    if (signature !== model.stateSignature) {
      const pinsChanged = JSON.stringify(state.explorePins || []) !== JSON.stringify(model.state.explorePins || []);
      const projectsChanged = JSON.stringify(state.projects) !== JSON.stringify(model.state.projects);
      const externalCleanupChanged = JSON.stringify(state.externalCleanup) !== JSON.stringify(model.state.externalCleanup);
      const oldProject = projectById(model.projectId);
      const oldStatus = oldProject?.status;
      model.state = state; model.stateSignature = signature;
      pruneFrames();
      renderSidebar();
      model.state.projects.forEach(project=>loadProjectLogo(project));
      if (model.route === 'library' && (projectsChanged || externalCleanupChanged)) renderLibrary();
      if (model.route === 'explore' && homeDrag && (projectsChanged || pinsChanged)) homeDrag.renderPending = true;
      else if (model.route === 'explore' && (!model.query || pinsChanged) && !pinPending && !$('#main').contains(document.activeElement)) renderExplore();
      else if (model.route === 'explore' && !model.query && !pinPending && (projectsChanged || pinsChanged) && $('#home-pins')) {
        const focused = $('#home-pins').contains(document.activeElement) ? document.activeElement : null;
        const attribute = ['data-project','data-repo','data-unpin-home','data-home-category'].find(name => focused?.hasAttribute(name));
        const value = attribute && focused.getAttribute(attribute);
        $('#home-pins').outerHTML = homePinsShelf();
        enableHomeSectionKeyboard();
        if (focused) {
          const next = attribute && $('#home-pins [' + attribute + '="' + CSS.escape(value) + '"]');
          (next || $('[data-action="edit-home"]'))?.focus({preventScroll:true});
        }
      }
      syncPinButtons();
      if (projectsChanged) $$('[data-version-project]').forEach(node => {
        const project = projectById(node.dataset.versionProject);
        if (!project) return;
        const version = projectVersionHTML(project);
        if (node.innerHTML !== version) node.innerHTML = version;
      });
      if (model.route === 'app') {
        const current = projectById(model.projectId);
        const port = current?.status === 'running' ? Number(current.port) || 0 : 0;
        if (!current || current.status !== model.appStatus || port !== model.appPort || current.surface !== oldProject?.surface) renderApp();
        else updateAppBar();
      }
      if (model.route === 'project') {
        const current = projectById(model.projectId);
        if (oldStatus === 'cloning' && current?.status !== 'cloning' && model.tab !== 'config') renderProject();
        else if (model.tab === 'manage' && (oldStatus !== current?.status || oldProject?.sourceMissing !== current?.sourceMissing ||
          JSON.stringify(oldProject?.uninstallProgress) !== JSON.stringify(current?.uninstallProgress))) renderProject();
        else updateProjectStatus();
      }
    }
    if (model.capabilities.releaseNotifications && releaseNotifications) releaseNotifications.sync(state.releaseNotifications || [], state.releaseUpdateCheck || {});
  } catch(error) { model.connected = false; $('#connection-status').textContent = 'Sem conexão · mantenha o Orbit aberto'; $('#connection-status').hidden = false; $('#connection-dot').classList.remove('green'); }
}
function openImport(url = '') { $('#import-parent').value=''; $('#import-shortcut').checked=false; $('#choose-import-folder').disabled=!model.capabilities.folderPicker; $('#import-shortcut-option').hidden=!model.capabilities.desktopShortcuts; $('#import-url').value = url; $('#import-error').textContent = ''; $('#import-dialog').showModal(); $('#import-url').focus(); }
async function download(url, options = {}) {
  const project = await post('/projects',{url,...options});
  await pollState(); model.appOperation = 'download'; navigate('app', project.id); toast('Download iniciado.');
}
async function runAction(action, button, confirmNative = false) {
  const project = projectById(model.projectId);
  if (!project) return;
  button.disabled = true;
  try {
    await post('/projects/' + project.id + '/' + action,{confirmNative});
    nativeRequest = undefined;
    model.appOperation = action === 'install' ? 'install' : 'run';
    await pollState();
    navigate('app',project.id);
  } catch(error) {
    if (error.status === 409 && error.message === 'confirm-native') {
      nativeRequest = {id:project.id,action};
      model.appOperation = action === 'install' ? 'install' : 'run';
      navigate('app',project.id);
    } else toast(error.message);
  }
  finally { if (button.isConnected) button.disabled = false; }
}
const operationLabels = {install:'Instalar',start:'Executar',update:'Atualizar',repair:'Reparar instalação',rollback:'Voltar à versão anterior'};
let planRequest;
const windowsPackageLabels = {portable:'Portátil no Orbit',installer:'Instalador do Windows'};
function showProjectPlan(plan) {
  const names = {release:'Release publicada',local:'Código-fonte local',native:'Código-fonte local',command:'Comando configurado',docker:'Docker',checkout:'Restaurar código-fonte','source-update':'Atualizar código-fonte'};
  const type = windowsPackageLabels[plan.packageMode] || names[plan.method];
  $('#project-plan-version').textContent = [type,plan.tag,plan.asset].filter(Boolean).join(' · ');
  $('#project-plan-summary').textContent = plan.details + (plan.confirmLocal ? ' Ao continuar, você autoriza a execução local de comandos deste projeto.' : '');
}
async function openProjectPlan(action) {
  const project = projectById(model.projectId);
  if (!project || busy(project)) return;
  const dialog = $('#project-plan-dialog');
  const tag = action === 'update' ? project.availableRelease?.tag : action === 'rollback' ? project.previousRelease?.tag || project.previousSource?.tag || project.previousSource?.version : '';
  const request = planRequest = {action,project,tag,plan:null,submitting:false};
  const label = operationLabels[action];
  $('#project-plan-title').textContent = label + ' · ' + project.name;
  $('#project-plan-summary').textContent = 'Verificando a versão e as dependências…';
  $('#project-plan-version').textContent = '';
  $('#project-plan-packages').hidden = true;
  $('#project-plan-package-options').replaceChildren();
  $('#project-plan-requirements').replaceChildren();
  $('#project-plan-notes').hidden = true;
  $('#project-plan-release').hidden = !tag || action !== 'update';
  if (action === 'update' && tag) $('#project-plan-release').href = project.url + '/releases/tag/' + encodeURIComponent(tag);
  $('#project-plan-error').textContent = '';
  $('#project-plan-confirm').textContent = label;
  $('#project-plan-confirm').disabled = true;
  dialog.showModal();
  try {
    const query = new URLSearchParams({operation:action, ...(tag ? {tag} : {})});
    const plan = action === 'rollback'
      ? {tag,details:'Seleciona a versão anterior que o Orbit preservou. Os dados do aplicativo ficam no local atual.'}
      : await api('/projects/' + project.id + '/plan?' + query);
    if (planRequest !== request || !dialog.open) return;
    request.plan = plan;
    if (plan.packageChoices?.length > 1) {
      const options = $('#project-plan-package-options');
      for (const choice of plan.packageChoices) {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        Object.assign(radio,{type:'radio',name:'windows-package',value:choice.mode,checked:choice.mode === plan.packageMode});
        radio.addEventListener('change', () => {
          Object.assign(plan,{packageMode:choice.mode,asset:choice.asset,details:choice.details});
          showProjectPlan(plan);
        });
        label.append(radio,windowsPackageLabels[choice.mode]);
        options.append(label);
      }
      $('#project-plan-packages').hidden = false;
    }
    showProjectPlan(plan);
    for (const requirement of plan.requirements || []) {
      const item = document.createElement('li');
      item.textContent = requirement;
      $('#project-plan-requirements').append(item);
    }
    $('#project-plan-notes').hidden = !plan.notes;
    $('#project-plan-notes-text').textContent = plan.notes || '';
    $('#project-plan-confirm').disabled = false;
  } catch (error) {
    if (planRequest !== request || !dialog.open) return;
    $('#project-plan-summary').textContent = 'Não foi possível preparar esta operação.';
    $('#project-plan-error').textContent = error.message;
  }
}
async function submitProjectPlan() {
  const request = planRequest;
  if (!request?.plan || request.submitting) return;
  const {action,project,tag,plan} = request;
  const button = $('#project-plan-confirm'), cancel = $('#project-plan-cancel');
  const packages = $('#project-plan-packages');
  request.submitting = button.disabled = cancel.disabled = true;
  packages.disabled = true;
  button.textContent = 'Em andamento…';
  $('#project-plan-error').textContent = '';
  try {
    await post('/projects/' + project.id + '/' + action,{tag:tag || plan.tag,method:plan.method,asset:plan.asset,packageMode:plan.packageMode,confirmNative:Boolean(plan.confirmLocal)});
    $('#project-plan-dialog').close();
    if (action === 'repair' || action === 'update' || action === 'rollback') projectReadmes.delete(project.id);
    await pollState();
    if (['rollback','update','repair'].includes(action) && !busy(projectById(project.id))) {
      renderProject();
      const current = projectById(project.id);
      toast(current?.lastError || (action === 'repair' ? 'Reparo concluído.' : 'Versão ' + tag + ' selecionada.'));
    } else {
      model.appOperation = action === 'start' ? 'run' : 'install';
      navigate('app',project.id);
    }
  } catch (error) {
    $('#project-plan-error').textContent = error.message;
  } finally {
    request.submitting = button.disabled = cancel.disabled = false;
    packages.disabled = false;
    button.textContent = operationLabels[action];
  }
}
$('#project-plan-dialog').addEventListener('cancel', event => { if (planRequest?.submitting) event.preventDefault(); });
async function stopProject(id, button) {
  const project = projectById(id);
  if (!busy(project) || button.getAttribute('aria-disabled') === 'true') return;
  const focused = document.activeElement === button;
  const route = model.route;
  const sync = () => $$('[data-stop-project="' + CSS.escape(id) + '"]').forEach(control => syncStopButton(control,projectById(id) || project));
  stoppingProjects.set(id,project.status);
  sync();
  try {
    const result = await post('/projects/' + id + '/stop');
    await pollState();
    toast(result.lastError || (result.status === 'stopping' ? 'Interrupção solicitada.' : result.status === 'stopped' ? 'Execução parada.' : 'Tarefa cancelada.'), 'pins');
  } catch (error) {
    await pollState();
    toast(error.message, 'pins');
  } finally {
    stoppingProjects.delete(id);
    sync();
    if (focused && !button.isConnected && document.activeElement === document.body && route === model.route && model.projectId === id) {
      ($('[data-stop-project="' + CSS.escape(id) + '"]', $('#main')) || $('.app-bar .back-link, #project-actions button', $('#main')))?.focus({preventScroll:true});
    }
  }
}
function isOrbitEvent(event) { return event.target instanceof Element && Boolean(event.target.closest('.app-shell,#import-dialog,#removal-dialog,#project-plan-dialog,#home-category-dialog,#support-dialog,#toast')); }
function finishHomeDrag(commit = false) {
  const drag = homeDrag;
  homeDrag = undefined;
  homePress = undefined;
  if (drag) {
    cancelAnimationFrame(drag.frame);
    drag.dropTarget?.removeAttribute('data-home-group-target');
    if (commit) saveHomeOrder(drag.list);
    else positionHomeSlot(drag,drag.originalNext);
    drag.item.removeAttribute('data-home-dragging');
    drag.preview.remove();
    if (drag.list.hasPointerCapture(drag.pointerId)) drag.list.releasePointerCapture(drag.pointerId);
    if (drag.focused) drag.source.focus({preventScroll:true});
  }
  return drag;
}
function positionHomeSlot(drag, before) {
  const {item,list} = drag;
  if (before === item || before === item.nextSibling) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    list.insertBefore(item,before);
    return;
  }
  // Animate the content while keeping the target rectangles in their new layout positions.
  const content = homeOrderItems(list).filter(node => node !== item).flatMap(node => [...node.children]);
  const previous = content.map(node => node.getBoundingClientRect());
  for (const animation of drag.animations) animation.cancel();
  drag.animations = [];
  list.insertBefore(item,before);
  content.forEach((node,index) => {
    const bounds = node.getBoundingClientRect();
    const x = previous[index].x - bounds.x;
    const y = previous[index].y - bounds.y;
    if (!x && !y) return;
    drag.animations.push(node.animate([{translate:x + 'px ' + y + 'px'},{translate:'0 0'}],
      {duration:180,easing:'cubic-bezier(.2,.75,.25,1)'}));
  });
}
function updateHomeSlot(drag, scrollTop) {
  const {x,y,item,list} = drag;
  if (x === drag.lastX && y === drag.lastY && scrollTop === drag.lastScroll) return;
  Object.assign(drag,{lastX:x,lastY:y,lastScroll:scrollTop});
  const hit = document.elementFromPoint(x,y);
  const group = item.matches('.pinned-shortcut') && hit?.closest('[data-home-favorite-group]');
  const targetGroup = group && group.dataset.homeFavoriteGroup !== list.dataset.homeOrderList ? group : null;
  if (drag.dropTarget !== targetGroup) {
    drag.dropTarget?.removeAttribute('data-home-group-target');
    targetGroup?.setAttribute('data-home-group-target','');
    drag.dropTarget = targetGroup;
  }
  if (!list.contains(hit)) return;
  const target = homeOrderItems(list).find(node => {
    const bounds = node.getBoundingClientRect();
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  });
  if (!target || target === item) return;
  const bounds = target.getBoundingClientRect();
  const after = list.dataset.homeOrderList === 'sections'
    ? y >= bounds.y + bounds.height / 2
    : x >= bounds.x + bounds.width / 2;
  positionHomeSlot(drag,after ? target.nextSibling : target);
}
function trackHomeDrag(drag) {
  const {x,y} = drag;
  const main = $('#main');
  const viewport = main.getBoundingClientRect();
  if (x >= viewport.left && x <= viewport.right) {
    if (y >= viewport.top && y < viewport.top + 44) main.scrollTop -= 12;
    if (y <= viewport.bottom && y > viewport.bottom - 44) main.scrollTop += 12;
  }
  drag.preview.style.transform = 'translate(' + (x + 14) + 'px,' + (y + 14) + 'px)';
  updateHomeSlot(drag,main.scrollTop);
  drag.frame = requestAnimationFrame(() => trackHomeDrag(drag));
}
function beginHomeDrag(press) {
  const {source,item,pointerId} = press;
  const list = item.parentElement;
  const preview = document.createElement('div');
  preview.className = 'home-drag-preview';
  preview.setAttribute('aria-hidden','true');
  const avatar = $('.pinned-shortcut-icon',item);
  if (item.matches('.pinned-shortcut') && avatar) preview.append(avatar.cloneNode(true));
  else preview.textContent = $('.shelf-head h2',item).textContent;
  $('.app-shell').append(preview);
  item.dataset.homeDragging = '';
  list.setPointerCapture(pointerId);
  homeDrag = {...press,list,preview,originalNext:item.nextSibling,animations:[],
    focused:document.activeElement === source,renderPending:false};
  return homeDrag;
}
$('#main').addEventListener('pointerdown', event => {
  if (!homeEditing || !event.isPrimary || event.button !== 0) return;
  const source = event.target.closest('.pinned-shortcut-open,.shelf-head h2');
  const item = source?.closest('[data-home-order-item]');
  if (!item) return;
  const canChangeCategory = item.matches('.pinned-shortcut') && homeCategories.length > 0;
  if (!canChangeCategory && homeOrderItems(item.parentElement).length < 2) return;
  homePress = {source,item,pointerId:event.pointerId,x:event.clientX,y:event.clientY};
});
document.addEventListener('pointermove', event => {
  const press = homePress;
  if (press?.pointerId !== event.pointerId) return;
  const {clientX:x,clientY:y} = event;
  if (!homeDrag && (Math.hypot(x - press.x,y - press.y) < 7 || !press.source.isConnected)) return;
  event.preventDefault();
  const drag = homeDrag || beginHomeDrag(press);
  Object.assign(drag,{x,y});
  if (!drag.frame) trackHomeDrag(drag);
}, {passive:false});
function endHomePointer(event) {
  if (homePress?.pointerId !== event.pointerId) return;
  let commit = false;
  let destination;
  if (homeDrag && event.type === 'pointerup') {
    Object.assign(homeDrag,{x:event.clientX,y:event.clientY});
    updateHomeSlot(homeDrag,$('#main').scrollTop);
    destination = homeDrag.dropTarget?.dataset.homeFavoriteGroup;
    commit = !destination && homeDrag.list.contains(document.elementFromPoint(event.clientX,event.clientY));
  }
  const drag = finishHomeDrag(commit);
  if (!drag) return;
  const key = drag.item.dataset.homeOrderItem;
  if (destination && moveHomeFavorite(key,destination)) {
    renderExplore();
    const moved = $('[data-home-order-item="' + CSS.escape(key) + '"] .pinned-shortcut-open');
    if (drag.focused) moved?.focus({preventScroll:true});
    const category = homeCategory(destination);
    toast(category ? 'App movido para ' + category.name + '.' : 'App movido para Sem categoria.');
  } else if (drag.renderPending) renderExplore();
}
document.addEventListener('pointerup',endHomePointer);
document.addEventListener('pointercancel',endHomePointer);
let pinPress;
function clearPinPress() {
  if (!pinPress) return;
  clearTimeout(pinPress.timer);
  pinPress = undefined;
}
$('#main').addEventListener('pointerdown', event => {
  const shortcut = event.target.closest('.pinned-shortcut-open');
  if (!shortcut || !event.isPrimary || event.button !== 0) return;
  if (homeEditing) return;
  clearPinPress();
  pinPress = {id:event.pointerId,x:event.clientX,y:event.clientY,timer:setTimeout(() => {
    if (shortcut.isConnected) setHomeEditing(true);
  },500)};
});
document.addEventListener('pointermove', event => {
  if (pinPress?.id === event.pointerId && Math.hypot(event.clientX - pinPress.x,event.clientY - pinPress.y) > 10) clearPinPress();
}, {passive:true});
for (const type of ['pointerup','pointercancel']) document.addEventListener(type, event => {
  if (pinPress?.id === event.pointerId) clearPinPress();
});
$('#main').addEventListener('contextmenu', event => {
  if (!event.target.closest('.pinned-shortcut-open')) return;
  event.preventDefault();
  if (homeEditing) return;
  clearPinPress();
  setHomeEditing(true);
});
document.addEventListener('click', async event => {
  if (!isOrbitEvent(event)) return;
  const target = event.target.closest('button,a');
  if (!target || target.disabled) return;
  if (target.dataset.action === 'edit-home') return setHomeEditing(!homeEditing);
  if (target.dataset.homeWidget) return toggleHomeWidget(target.dataset.homeWidget);
  if (target.dataset.homeCategory) return openHomeCategory(target.dataset.homeCategory);
  if (target.dataset.action === 'cancel-home-category') return $('#home-category-dialog').close();
  if (target.dataset.action === 'delete-home-category') {
    const id = $('#home-category-form').dataset.categoryId;
    if (saveHomeCategories(homeCategories.filter(category => category.id !== id))) {
      closeHomeCategory('new');
      toast('Categoria excluída. Os apps voltaram para Sem categoria.');
    } else $('#home-category-error').textContent = 'Não foi possível excluir a categoria.';
    return;
  }
  if (target.dataset.unpinHome) return unpinFromHome(target);
  if (homeEditing && target.matches('.pinned-shortcut-open')) return;
  if (target.dataset.readmeAnchor) { event.preventDefault(); document.getElementById(target.dataset.readmeAnchor)?.scrollIntoView({block:'start'}); return; }
  if (target.dataset.nav) { if (target.dataset.nav === 'explore') { model.query = ''; model.language = 'Todos'; $('#search-input').value = ''; } navigate(target.dataset.nav); return; }
  if (target.dataset.openApp) return navigate('app',target.dataset.openApp);
  if (target.dataset.selectProject) {
    const id = target.dataset.selectProject;
    if (library.selected.has(id)) library.selected.delete(id);
    else library.selected.add(id);
    renderLibrary();
    return;
  }
  if (target.dataset.project) return navigate('project',target.dataset.project);
  if (target.dataset.pinRepo) return toggleFavorite(target.dataset.pinRepo,target);
  if (target.dataset.repo) return openRemote(target.dataset.repo);
  if (target.dataset.cleanupOpen || target.dataset.cleanupDone) {
    target.disabled = true;
    try {
      await post('/library/external-cleanup',{id:target.dataset.cleanupOpen || target.dataset.cleanupDone,action:target.dataset.cleanupOpen ? 'open' : 'done'});
      await pollState();
    } catch (error) { toast(error.message); }
    finally { if (target.isConnected) target.disabled = false; }
    return;
  }
  if (target.dataset.rankingSet) { const [key, value] = target.dataset.rankingSet.split(':'); if (model.ranking[key] !== value) { model.ranking[key] = value; loadRanking(); } return; }
  if (target.dataset.tab) { model.tab = target.dataset.tab; renderProject(); $('.tab.active')?.focus(); return; }
  if ('languageFilter' in target.dataset) { model.language = target.dataset.languageFilter; renderExplore(); return; }
  if ('directory' in target.dataset) return loadFiles(target.dataset.directory);
  if ('file' in target.dataset) return openFile(target.dataset.file);
  const action = target.dataset.action;
  if (action === 'open-support') {
    $('#support-status').textContent = '';
    return $('#support-dialog').showModal();
  }
  if (action === 'close-support') return $('#support-dialog').close();
  if (action?.startsWith('library-filter-')) {
    library.filter = action.slice('library-filter-'.length);
    library.selected.clear();
    return renderLibrary(action);
  }
  if (action === 'library-select') {
    library.selecting = !library.selecting;
    library.selected.clear();
    renderLibrary();
  }
  if (action === 'library-select-all') {
    const projects = visibleLibraryProjects();
    library.selected = new Set(library.selected.size === projects.length ? [] : projects.map(project => project.id));
    renderLibrary();
  }
  if (action === 'library-pin' || action === 'library-unpin') return setHomePins(action === 'library-pin', action);
  if (action === 'library-remove' || action === 'library-uninstall') return openRemoval(action === 'library-uninstall' ? 'uninstall' : 'remove', true);
  if (action === 'import') openImport();
  if (action === 'close-import') $('#import-dialog').close();
  if (action === 'focus-search') $('#search-input').focus();
  if (action === 'orbit-check-update') {
    try { await window.orbitDesktop.checkUpdate(); } catch (error) { toast(error.message); }
    return;
  }
  if (action === 'orbit-install-update') {
    try {
      const result = await window.orbitDesktop.installUpdate();
      if (result === 'busy') toast('Conclua as tarefas e feche os apps em execução para atualizar o Orbit.');
    } catch (error) { toast(error.message); }
    return;
  }
  if (action === 'refresh-runtimes') { target.disabled = true; target.textContent = 'Verificando…'; await loadRuntimes(); }
  if (action === 'retry-search') search(model.query);
  if (action === 'retry-recommendations') loadRecommendations(true);
  if (action === 'retry-weekly-ranking') return loadWeeklyRanking(true);
  if (action === 'open-weekly-ranking') {
    Object.assign(model.ranking,weeklyRankingFilters);
    return navigate('ranking');
  }
  if (action === 'retry-ranking') loadRanking();
  if (action === 'clear-ranking') { Object.assign(model.ranking, rankingDefaults, {sort:model.ranking.sort}); loadRanking(); }
  if (action === 'reload-app') { const entry = frames.get(model.projectId); if (entry) { entry.loaded = false; hideDock(); $('#app-loading')?.removeAttribute('hidden'); entry.el.src = entry.el.src; clearTimeout(entry.revealTimer); entry.revealTimer = setTimeout(() => { if (!entry.loaded && model.projectId === activeFrame) { entry.loaded = true; revealFrame(); } }, 5000); } }
  if (action === 'fullscreen-app') { const dock = $('#frame-dock'); const stage = dock && !dock.hidden ? dock : $('.app-frame-wrap'); if (document.fullscreenElement) document.exitFullscreen?.(); else stage?.requestFullscreen?.().catch(() => toast('O navegador não permitiu a tela cheia.')); }
  if (action === 'files-root') loadFiles('');
  if (action === 'name-installation-folder') {
    const id = model.projectId;
    target.disabled = true;
    try {
      const result = await post('/projects/' + id + '/storage',{useProjectName:true});
      await pollState();
      if (model.route === 'project' && model.projectId === id) renderProject();
      toast(result.warnings?.length ? result.warnings.join(' ') : 'Pasta renomeada para o nome do projeto.','pins');
    } catch (error) { toast(error.message,'pins'); }
    finally { target.disabled = false; }
    return;
  }
  if (action === 'open-installation') {
    target.disabled = true;
    try { await post('/projects/' + model.projectId + '/open-installation'); }
    catch (error) { toast(error.message); }
    finally { target.disabled = false; }
  }
  if (action === 'download-remote') openImport(model.remote.url);
  if (action === 'reload-view') renderApp();
  if (action === 'toggle-log') toggleLogDrawer();
  if (action === 'start-native') return runAction(nativeRequest?.id === model.projectId ? nativeRequest.action : 'start',target,true);
  if (action === 'mcp-connect') { target.disabled = true; try { await post('/projects/' + model.projectId + '/mcp-connect', {client:target.dataset.client}); toast('Conectado. Reinicie o agente para ele carregar o servidor.'); } catch(error) { toast(error.message); } finally { target.disabled = false; } }
  if (action === 'copy-mcp') { try { await navigator.clipboard.writeText(target.dataset.command); toast('Comando copiado.'); } catch { toast('Selecione o comando para copiar.'); } }
  if (action === 'start-from-app' || action === 'start-project') return openProjectPlan('start');
  if (action === 'install-project') return openProjectPlan('install');
  if (action === 'update-project') return openProjectPlan('update');
  if (action === 'repair-project') return openProjectPlan('repair');
  if (action === 'rollback-project') return openProjectPlan('rollback');
  if (action === 'cancel-project-plan') return $('#project-plan-dialog').close();
  if (target.dataset.stopProject) return stopProject(target.dataset.stopProject,target);
  if (action === 'copy-logs') { try { const lines = $$('#log-window .log-line'); await navigator.clipboard.writeText(lines.length ? lines.map(line => { const time = $('.log-time',line)?.textContent || ''; return (time ? time + '  ' : '') + line.textContent.slice(time.length).replace(/\s+$/,''); }).join('\n') : $('#log-window').innerText); toast('Saída copiada.'); } catch { toast('Selecione o texto do terminal para copiar.'); } }
  if (action === 'remove-project') openRemoval('remove');
  if (action === 'uninstall-project') openRemoval('uninstall');
  if (action === 'cancel-removal') $('#removal-dialog').close();
  if (action === 'choose-import-folder') pickInstallationFolder($('#import-parent'),target);
  if (action === 'choose-project-folder') pickInstallationFolder($('#project-parent'),target);
  if (action === 'create-shortcut') {target.disabled=true;try{await post('/projects/'+model.projectId+'/shortcut');await pollState();if(model.route==='project')renderProject();toast('Atalho criado na área de trabalho.','pins');}catch(error){toast(error.message,'pins');}finally{if(target.isConnected)target.disabled=false;}}
  if (action === 'system-uninstall') {target.disabled=true;try{await post('/projects/'+model.projectId+'/system-uninstall');toast('Abrimos os apps instalados do Windows.','pins');}catch(error){toast(error.message,'pins');}finally{if(target.isConnected)target.disabled=false;}}
});
document.addEventListener('submit', async event => {
  if (event.target.id === 'home-category-form') { event.preventDefault(); return submitHomeCategory(event.target); }
  if (event.target.id === 'project-plan-form') { event.preventDefault(); return submitProjectPlan(); }
  const form = event.target;
  if (!isOrbitEvent(event) || !['global-search','import-form','config-form','location-form','removal-form'].includes(form.id)) return;
  event.preventDefault();
  if (form.id === 'global-search') return search($('#search-input').value);
  if(form.id==='location-form'){
    const button=$('[type=submit]',form),input=$('[name=parent]',form);button.disabled=true;$('#location-error').textContent='';button.textContent='Movendo arquivos…';
    try{const result=await post('/projects/'+form.dataset.id+'/storage',{parent:input.value.trim()});await pollState();if(model.route==='project')renderProject();toast(result.warnings?.length?result.warnings.join(' '):'Pasta de instalação alterada.','pins');}
    catch(error){if($('#location-error'))$('#location-error').textContent=error.message;}
    finally{if(button.isConnected){button.disabled=false;button.textContent='Mover instalação';}}
    return;
  }
  if (form.id === 'removal-form') return submitRemoval();
  if (form.id === 'import-form') {
    const button = $('#import-submit'); button.disabled = true; $('#import-error').textContent = '';
    try { await download($('#import-url').value,{installationParent:$('#import-parent').value.trim(),desktopShortcut:$('#import-shortcut').checked}); $('#import-dialog').close(); }
    catch(error) { $('#import-error').textContent = error.message; }
    finally { button.disabled = false; }
  }
  if (form.id === 'config-form') {
    const data = new FormData(form); const button = $('button[type=submit]',form); button.disabled = true;
    try {
      await post('/projects/' + form.dataset.id + '/config', { mode:data.get('mode'), port:Number(data.get('port')), image:data.get('image'), install:data.get('install'), command:data.get('command'), network:data.has('network'), trusted:data.has('trusted') });
      await pollState(); toast('Configuração salva. Você já pode instalar ou executar.');
    } catch(error) { toast(error.message); }
    finally { button.disabled = false; }
  }
});
document.addEventListener('change', async event => {
  if (!isOrbitEvent(event)) return;
  if (event.target.id === 'orbit-keep-in-tray') {
    event.target.disabled = true;
    try { desktopTrayPreference = await window.orbitDesktop.setTrayPreference(event.target.checked); }
    catch (error) { toast(error.message); }
    finally { syncDesktopAbout(); }
    return;
  }
  if (event.target.dataset.rankingFilter) { model.ranking[event.target.dataset.rankingFilter] = event.target.value; loadRanking(); return; }
  if (event.target.id === 'ranking-lists') { model.ranking.lists = event.target.checked ? 'hide' : 'show'; loadRanking(); return; }
 if (event.target.id === 'terminal-project') { model.projectId = event.target.value; model.logSignature = ''; loadLogs(); } });
document.addEventListener('keydown', event => {
  if (!isOrbitEvent(event) && event.target !== document.body) return;
  if (event.key === 'Escape' && homeEditing && !$('dialog[open]')) {
    setHomeEditing(false);
    event.preventDefault();
    return;
  }
  if (homeEditing && event.altKey && !event.ctrlKey && !event.metaKey && event.target.hasAttribute('aria-keyshortcuts')) {
    const directions = event.target.matches('.pinned-shortcut-open') ? ['ArrowLeft','ArrowRight'] : ['ArrowUp','ArrowDown'];
    if (directions.includes(event.key)) {
      event.preventDefault();
      moveHomeItemByStep(event.target,event.key === directions[0] ? -1 : 1);
      return;
    }
  }
  const focusedTab = event.target.closest('[role=tab][data-tab]');
  if (focusedTab && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault();
    const tabs = $$('[role=tab]', focusedTab.parentElement);
    const current = tabs.indexOf(focusedTab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    model.tab = tabs[next].dataset.tab; renderProject(); $('.tab.active')?.focus(); return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#search-input').focus(); }
  if (model.route === 'app' && $('#log-drawer') && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.matches?.('input, textarea, select')) {
    if (event.key.toLowerCase() === 't') { event.preventDefault(); toggleLogDrawer(); return; }
    if (event.key === 'Escape' && !$('#log-drawer').hidden) { event.preventDefault(); toggleLogDrawer(false); return; }
  }
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key) && !event.altKey && !event.ctrlKey && !event.metaKey && spatialMove(event)) event.preventDefault();
});
$('#import-dialog').addEventListener('click', event => { if (event.target === $('#import-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
$('#removal-dialog').addEventListener('cancel', event => { if ($('#removal-confirm').disabled) event.preventDefault(); });
function tickClock() {
  const now = new Date();
  const hour = now.getHours();
  $('#greeting').textContent = hour < 5 ? 'Boa noite' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const clock = $('#clock');
  clock.textContent = now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  clock.dateTime = now.toISOString();
  $('#date').textContent = now.toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'long'}).replace(/[.,]/g,'');
}
// Navegação pelas setas, como num console: vai para o alvo mais próximo na direção pressionada.
const spatialTargets = '[data-spatial], #main button:not([disabled]), #main a[href], #main select, #main input:not([type=hidden]), #task-progress button:not([disabled])';
function spatialMove(event) {
  const from = event.target instanceof Element ? event.target : null;
  if (!from || !from.closest('.app-shell') || from.id === 'main') return false;
  if (from.matches('textarea, select, [contenteditable]')) return false;
  if (from.matches('input') && ['ArrowLeft','ArrowRight'].includes(event.key)) return false;
  if (from.closest('[role=tablist]')) return false;
  const a = from.getBoundingClientRect();
  if (!a.width && !a.height) return false;
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  const dir = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
  let best = null, bestScore = Infinity;
  for (const node of $$(spatialTargets)) {
    if (node === from || node.contains(from) || node.closest('[hidden], dialog:not([open])')) continue;
    const b = node.getBoundingClientRect();
    if (!b.width || !b.height || getComputedStyle(node).visibility === 'hidden') continue;
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const along = (bx - ax) * dir[0] + (by - ay) * dir[1];
    const edgeGap = dir[0] ? (dir[0] > 0 ? b.left - a.right : a.left - b.right) : (dir[1] > 0 ? b.top - a.bottom : a.top - b.bottom);
    if (along <= 1 || edgeGap < -Math.min(a.width,a.height) / 2) continue;
    const across = Math.abs(dir[0] ? by - ay : bx - ax);
    const score = Math.max(edgeGap,0) + across * 2.2;
    if (score < bestScore) { bestScore = score; best = node; }
  }
  if (!best) return false;
  best.focus({preventScroll:true});
  best.scrollIntoView({block:'nearest',inline:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  return true;
}
async function init() {
  try {
    const response = await fetch('/api/session'); const session = await response.json(); model.token = session.token; model.capabilities = session.capabilities || {}; model.supportUrl = session.supportUrl;
    if (model.supportUrl) {
      const usePix = model.supportUrl === '/apoio';
      $('#support-local').hidden = !usePix;
      $('#support-external').hidden = usePix;
      if (!usePix) $('#support-external a').href = model.supportUrl;
      $('#support-button').hidden = false;
    }
    if (model.capabilities.releaseNotifications && window.createReleaseNotifications) releaseNotifications = window.createReleaseNotifications({ api, openProject: id => navigate('project', id), toast, escapeHTML });
    if (window.orbitDesktop) {
      window.orbitDesktop.onUpdate(receiveDesktopUpdate);
      window.orbitDesktop.updateState().then(receiveDesktopUpdate).catch(() => {});
      window.orbitDesktop.trayPreference().then(value => { desktopTrayPreference = value; syncDesktopAbout(); }).catch(() => {});
    }
    await pollState();
    const match = location.hash.match(/^#(explore|ranking|library|settings|terminal|project|app)(?:\/([\w-]+))?$/);
    navigate(match?.[1] || 'explore',match?.[2]);
    loadRuntimes(); refreshActivityProgress(); tickClock(); setInterval(tickClock,10000);
    setInterval(async () => { await pollState(); await refreshActivityProgress(); if (model.route === 'terminal' || (model.route === 'project' && model.tab === 'terminal')) await loadLogs(); if (model.route === 'app') { if ($('#loading-stage')) await updateLoading(); else if ($('#log-drawer') && !$('#log-drawer').hidden) await loadLogs(); } },1600);
  } catch(error) { $('#main').innerHTML = empty('Não foi possível abrir o workspace.', 'Mantenha o serviço do Orbit aberto e recarregue esta página.','info'); }
}
init();
