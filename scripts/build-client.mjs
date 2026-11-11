import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const parts=await Promise.all(['vendor/marked.umd.js','vendor/purify.min.js','public/app.source.js'].map(file=>fs.readFile(path.join(root,file),'utf8')));
const output=path.join(root,'public/app.js');
const bundle='// Gerado por scripts/build-client.mjs; edite public/app.source.js.\n'+parts.join('\n;\n')+'\n';
if (process.argv.includes('--check')) {
  if (await fs.readFile(output,'utf8')!==bundle) throw new Error('A interface compilada está desatualizada. Edite public/app.source.js e execute npm run build.');
  console.log('Interface compilada corresponde ao código fonte.');
} else {
  await fs.writeFile(output,bundle);
  console.log('Interface recompilada com Markdown e limpeza de HTML.');
}
