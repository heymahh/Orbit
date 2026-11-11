import { randomUUID } from 'node:crypto';
const labels = {cloning:'Baixando projeto',installing:'Preparando dependências',running:'Em execução',stopping:'Parando',ready:'Concluído',stopped:'Parado',interrupted:'Interrompido',error:'Falha na tarefa'};
export function migrateActivities(state) {
  const seen = new Set();
  state.events = state.events.filter(event => {
    const project = state.projects.find(project => event.projectId === project.id || event.message?.startsWith(project.name + ':'));
    if (!project) return true;
    if (seen.has(project.id)) return false;
    seen.add(project.id);
    event.projectId = project.id; event.projectName = project.name;
    if (!event.status || event.status !== project.status) {
      event.status = project.status; event.label = labels[project.status] || 'Aguardando';
      event.percent = ['ready','running'].includes(project.status) ? 100 : null;
    }
    return true;
  });
}
export function updateActivity(state, project, patch, {reset = false} = {}) {
  const now = new Date().toISOString();
  let entry = state.events.find(event => event.projectId === project.id);
  if (!entry) { entry = {id:randomUUID(),projectId:project.id,at:now}; state.events.unshift(entry); }
  if (reset) {
    entry.at = now; entry.startedAt = now;
    state.events = [entry,...state.events.filter(event => event !== entry)];
  }
  Object.assign(entry,patch,{projectName:project.name,updatedAt:now});
  entry.percent = Number.isFinite(entry.percent) ? Math.min(100,Math.max(0,Math.round(entry.percent))) : null;
  entry.message = project.name + ': ' + entry.label + '.';
  entry.type = entry.status === 'error' ? 'error' : ['ready','running'].includes(entry.status) ? 'success' : 'info';
  state.events = state.events.slice(0,60);
  return entry;
}
export function progressFromOutput(text) {
  const git = text.match(/(Receiving objects|Resolving deltas|Counting objects|Compressing objects|Updating files):\s*(\d+)%/i);
  if (git) return {label:({'receiving objects':'Recebendo objetos','resolving deltas':'Resolvendo arquivos','counting objects':'Contando objetos','compressing objects':'Compactando objetos','updating files':'Gravando arquivos'})[git[1].toLowerCase()],percent:Number(git[2])};
  const layer = text.match(/([a-f0-9]{12}):\s+(Downloading|Extracting).*?([\d.]+)\s*([kMGT]?i?B)\s*\/\s*([\d.]+)\s*([kMGT]?i?B)/i);
  if (layer) {
    const bytes = (value,unit) => Number(value) * (unit.includes('i') ? 1024 : 1000) ** Math.max(0,'bkmgt'.indexOf(unit[0].toLowerCase()));
    const total = bytes(layer[5],layer[6]);
    return {label:(layer[2].toLowerCase() === 'downloading' ? 'Baixando camada ' : 'Extraindo camada ') + layer[1].slice(0,6),percent:total ? bytes(layer[3],layer[4]) / total * 100 : null};
  }
  const build = text.match(/#\d+\s+\[(?:[^\]]*?\s)?(\d+)\/(\d+)\]/);
  if (build) return {label:'Compilando imagem · etapa ' + build[1] + ' de ' + build[2],percent:null};
  if (/Baixando imagem oficial|Pulling fs layer|Download complete|Pull complete/i.test(text)) return {label:'Baixando e preparando imagem Docker',percent:null};
  if (/Preparing|Preparando imagem Docker|installing collected packages|npm (?:ci|install)/i.test(text)) return {label:'Instalando dependências',percent:null};
  return null;
}
