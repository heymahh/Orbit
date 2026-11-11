const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const stop = new Set('a o os as e de do da dos das em no na nos nas um uma uns umas com para por que eu quero gostaria preciso encontrar buscar usar ter fazer meu minha meus minhas app apps aplicativo aplicativos programa programas ferramenta ferramentas projeto projetos software tool tools application applications project projects open source github using use python javascript typescript rust java golang'.split(' '));
const words = text => normalize(text).replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^a-z0-9]+/).filter(word => word.length > 2 && !stop.has(word));
const definitions = [
 ['video','edição de vídeo','video editor',['video','videos','filmagem','filmagens','video-editing','video-editor','filmmaking']],
 ['image','edição de imagens','image editor',['imagem','imagens','foto','fotos','image','images','photo','photos','image-editing','photo-editor']],
 ['audio','áudio e música','audio editor',['audio','musica','musicas','music','sound','podcast','audio-editing']],
 ['screen','gravação de tela','screen recorder',['gravar tela','gravacao de tela','screen recording','screen recorder','screencast']],
 ['emulator','emuladores','emulator',['emulador','emuladores','emulator','emulation','retroarch','retrogaming']],
 ['drivers','drivers e dispositivos','driver updater',['driver','drivers','driver-updater','dispositivos','hardware drivers']],
 ['automation','automação','automation',['automacao','automatizar','automacoes','automation','automate','workflow','workflows']],
 ['llm','modelos de linguagem','local llm',['llm','ollama','chatbot','chatbots','language model','modelos de linguagem','inteligencia artificial','artificial intelligence']],
 ['image-ai','geração de imagens','image generation',['gerar imagens','geracao de imagens','image generation','stable diffusion','text-to-image']],
 ['notes','notas e conhecimento','note taking',['notas','anotacoes','notes','note-taking','note taking','knowledge-base','obsidian']],
 ['tasks','tarefas e organização','task management',['tarefas','tasks','kanban','task-management','task management','todo','to-do']],
 ['files','arquivos e sincronização','file manager',['arquivos','gerenciador de arquivos','file manager','file-manager','sincronizacao','file sync']],
 ['security','segurança','security scanner',['seguranca','security','antivirus','vulnerability','vulnerabilidades']],
 ['password','senhas','password manager',['senhas','password','passwords','password-manager','bitwarden']],
 ['browser','navegadores','web browser',['navegador','navegadores','browser','browsers','web-browser']],
 ['drawing','desenho e diagramas','drawing diagram',['desenhar','desenho','diagramas','diagrama','drawing','diagram','diagrams','whiteboard','excalidraw']],
 ['3d','modelagem 3D','3d modeling',['3d','modelagem','modeling','blender','cad']],
 ['games','jogos','game',['jogos','jogo','games','game','gaming']],
 ['download','downloads','download manager',['download','downloads','downloader','baixar videos','baixar arquivos']],
 ['remote','acesso remoto','remote desktop',['acesso remoto','remote desktop','rustdesk','vnc']],
 ['code','edição de código','code editor',['editar codigo','editor de codigo','code editor','vscode','neovim']],
 ['api','APIs','api client',['api','apis','rest','http client','postman','insomnia']],
 ['web','desenvolvimento web','web development',['web','frontend','vite','react','svelte','nextjs']],
 ['docs','documentação','documentation',['documentacao','documentation','markdown','mdbook']],
 ['database','bancos de dados','database client',['banco de dados','database','sql','sqlite','postgres','postgresql']]
].map(([id,label,query,aliases])=>({id,label,query,aliases}));
function mentions(text, phrase) { return (' '+normalize(text).replace(/[^a-z0-9]+/g,' ')+' ').includes(' '+normalize(phrase).replace(/[^a-z0-9]+/g,' ')+' '); }
const repositoryText = repo => [repo.name || repo.fullName?.split('/')[1],repo.description,...(repo.topics || [])].filter(Boolean).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2');
export function recommendationProfile(state = {}) {
 const preferences=state.explorePreferences || {};
 const intent=String(preferences.intent || '').trim();
 const lastSearch=String(preferences.lastSearch || '').trim();
 const pins=state.explorePins || [], projects=state.projects || [];
 const signals=intent ? [{text:intent,weight:12,label:'seu objetivo'}] : lastSearch ? [{text:lastSearch,weight:8,label:'sua busca recente'},...pins.slice(0,8).map(repo=>({text:repositoryText(repo),weight:2,label:repo.fullName}))] : [...pins.slice(0,12).map(repo=>({text:repositoryText(repo),weight:4,label:repo.fullName})),...projects.slice(-8).map(repo=>({text:repositoryText(repo),weight:1,label:repo.fullName}))];
 const interests=definitions.map(definition=>({...definition,weight:signals.reduce((sum,signal)=>sum+(definition.aliases.some(alias=>mentions(signal.text,alias)) ? signal.weight : 0),0)})).filter(item=>item.weight>0).sort((a,b)=>b.weight-a.weight).slice(0,3);
 const terms=new Map();for(const signal of signals)for(const word of new Set(words(signal.text)))terms.set(word,(terms.get(word)||0)+signal.weight);
 const keywords=[...terms].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([word])=>word);
 const queries=interests.length ? interests.map(item=>item.query) : keywords.length ? [keywords.slice(0,3).map(word=>'"'+word+'"').join(' ')] : [];
 return {signals,interests,terms,queries,basis:intent?'Objetivo: '+intent:lastSearch?'Com base na busca: '+lastSearch:pins.length?'Com base nos seus favoritos':projects.length?'Com base na sua biblioteca':'Conte o que você quer fazer para receber sugestões.',intent};
}
export function rankRecommendations(repositories, profile, excluded = new Set()) {
 const seen=new Set();const result=[];
 for(const repo of repositories){
  const fullName=repo.fullName || '';const key=fullName.toLowerCase();
  if(!fullName||seen.has(key)||excluded.has(key)||repo.archived||repo.fork)continue;seen.add(key);
  if(/^(awesome(?:-|$)|tutorial|course|cheatsheet|roadmap)/i.test(repo.name || '') || (repo.topics||[]).some(topic=>['awesome','awesome-list','tutorial','course'].includes(topic)))continue;
  const text=repositoryText(repo);const tokens=new Set(words(text));
  const matches=profile.interests.filter(item=>item.aliases.some(alias=>mentions(text,alias)));
  let score=matches.reduce((sum,item)=>{
    const exactTopic=(repo.topics||[]).some(topic=>item.aliases.some(alias=>normalize(topic).replace(/[^a-z0-9]+/g,' ')===normalize(alias).replace(/[^a-z0-9]+/g,' ')));
    const specificPhrase=item.aliases.some(alias=>normalize(alias).split(/[^a-z0-9]+/).length>1&&mentions(text,alias));
    return sum+item.weight*(exactTopic?16:specificPhrase?12:2);
  },0);
  for(const [word,weight] of profile.terms)if(tokens.has(word))score+=weight;
  if(score<=0)continue;
  const match=matches[0];const reason=match?'Relacionado a '+match.label:profile.intent?'Relacionado ao seu objetivo':'Semelhante aos seus interesses';
  result.push({...repo,recommendationReason:reason,score});
 }
 return result.sort((a,b)=>b.score-a.score||(b.stars||0)-(a.stars||0)).slice(0,12).map(({score,...repo})=>repo);
}
export function createRecommendations({github,repoView,now=Date.now,ttl=600000}) {
 const cache=new Map(),pending=new Map();
 return async function recommend(state,language='Todos'){
  if(!['Todos','Python','JavaScript','TypeScript','Go','Rust'].includes(language))throw Object.assign(Error('Escolha uma linguagem da lista.'),{status:400});
  const profile=recommendationProfile(state);
  if(!profile.queries.length)return{items:[],basis:profile.basis,needsInterests:true};
  const excluded=new Set([...(state.explorePins||[]),...(state.projects||[])].map(repo=>repo.fullName.toLowerCase()));
  const key=JSON.stringify([profile.signals,language,[...excluded].sort()]);const previous=cache.get(key);
  if(previous&&now()-previous.at<ttl)return previous.data;
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
   const repositories=[];let failure,partial=false;
   for(const query of profile.queries){
    try{
     const q=query+' in:name,description,topics archived:false fork:false -topic:awesome-list -topic:awesome'+(language!=='Todos'?' language:"'+language+'"':'');
     const response=await github('search/repositories?q='+encodeURIComponent(q)+'&sort=stars&order=desc&per_page=50');
     if(!Array.isArray(response.items))throw Error('Resposta de sugestões inválida.');
     repositories.push(...response.items.map(item=>({...repoView(item),archived:item.archived,fork:item.fork})));partial ||= Boolean(response.incomplete_results);
    }catch(error){failure=error;break;}
   }
   if(failure&&previous)return{...previous.data,stale:true,warning:'Não foi possível atualizar as sugestões. Mostrando a última seleção para estes interesses.'};
   if(failure&&!repositories.length)throw failure;
   const data={items:rankRecommendations(repositories,profile,excluded),basis:profile.basis,needsInterests:false,partial:partial||Boolean(failure),updatedAt:new Date(now()).toISOString()};
   if(!data.partial){cache.set(key,{at:now(),data});while(cache.size>24)cache.delete(cache.keys().next().value);}
   return data;
  })().finally(()=>pending.delete(key));pending.set(key,task);return task;
 };
}
