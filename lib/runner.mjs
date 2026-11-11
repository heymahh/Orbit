import { dependencyPlan } from './prepare.mjs';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function parseRepository(value) {
  let raw = String(value || '').trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) raw = `https://github.com/${raw}`;
  let url;
  try { url = new URL(raw); } catch { throw new Error('Cole uma URL do GitHub ou use autor/projeto.'); }
  const match = url.pathname.match(/^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !match || match.slice(1).some(x => x === '.' || x === '..' || x.startsWith('-'))) throw new Error('Use https://github.com/autor/projeto, sem caminhos extras.');
  return { owner: match[1], name: match[2], fullName: `${match[1]}/${match[2]}`, url: `https://github.com/${match[1]}/${match[2]}` };
}

export async function safePath(root, relative = '.') {
  const base = await fs.realpath(root);
  const resolved = path.resolve(base, relative);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) throw new Error('O caminho precisa estar dentro do projeto.');
  const candidate = await fs.realpath(resolved);
  if (candidate !== base && !candidate.startsWith(base + path.sep)) throw new Error('O caminho precisa estar dentro do projeto.');
  return candidate;
}

const CODE_FILE = /\.(?:m?[jt]sx?|cjs|py|rs|go|java|kts?|c|cc|cpp|cxx|h|hpp|cs|fs|rb|php|swift|sh|bash|ps1|bat|cmd|lua|dart|scala|zig|nim|exs?|hs|ml|vue|svelte|html?|css|scss|ipynb|r|jl|pl|gradle)$/i;
const MANIFEST = /^(?:package\.json|dockerfile|containerfile|docker-compose\.ya?ml|compose\.ya?ml|makefile|cmakelists\.txt|cargo\.toml|go\.mod|pom\.xml|build\.gradle(?:\.kts)?|requirements\.txt|pyproject\.toml|setup\.py|gemfile|composer\.json|deno\.jsonc?|flake\.nix|meson\.build|.*\.(?:csproj|fsproj|sln))$/i;
// Listas e documentação (só Markdown, imagens e licença) não têm programa para executar.
export async function isDocumentationOnly(directory) {
  const queue = [[directory, 0]]; let seen = 0, files = 0;
  while (queue.length) {
    const [folder, depth] = queue.shift();
    let entries; try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (++seen > 4000) return false;
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name.startsWith('.orbit')) continue;
      if (entry.isDirectory()) { if (depth < 4 && entry.name !== '.github') queue.push([path.join(folder, entry.name), depth + 1]); continue; }
      if (folder.includes(path.sep + '.github')) continue;
      files++;
      if (CODE_FILE.test(entry.name) || MANIFEST.test(entry.name)) return false;
    }
  }
  return files > 0;
}
export const DOCUMENTATION_NOTE = 'Este repositório é documentação ou uma lista de links: não há programa para executar. Leia o conteúdo na aba Visão geral.';
// Diz se um app local aceita ser aberto dentro do Orbit, a partir dos cabeçalhos que ele envia.
export function frameVerdict(headers) {
  const get = name => String((typeof headers.get === 'function' ? headers.get(name) : headers[name]) || '').toLowerCase();
  const xfo = get('x-frame-options');
  if (/deny|sameorigin/.test(xfo)) return { frameable: false, reason: 'Este app não permite ser aberto dentro de outra página (X-Frame-Options).' };
  const ancestors = get('content-security-policy').match(/frame-ancestors([^;]*)/)?.[1]?.trim();
  if (ancestors && !ancestors.split(/\s+/).some(source => source === '*' || /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost)(?::(?:\*|\d+))?$/.test(source) || source === 'http:')) return { frameable: false, reason: 'Este app bloqueia ser aberto dentro de outra página (Content-Security-Policy).' };
  return { frameable: true, reason: '' };
}
export async function detectProject(directory) {
  const files = await fs.readdir(directory);
  const has = name => files.includes(name);
  const make = (language, image, install, command, note = '') => ({ language, image, install, command, note, mode: 'native' });
  if (has('package.json')) {
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
      const plan = await dependencyPlan(directory);
      const manager = plan.steps[0].split(' ')[0];
      const script = ['dev', 'start', 'serve', 'preview'].find(key => pkg.scripts?.[key]);
      return make(has('tsconfig.json') ? 'TypeScript' : 'JavaScript', 'node:22-bookworm', plan.steps.join(' && '), script ? `${manager} run ${script}` : '', script ? 'Para abrir uma interface web em Docker, o servidor do projeto deve escutar em 0.0.0.0.' : 'Este pacote não declara um comando de início. Configure um exemplo, teste ou outro comando.');
    } catch { return make('JavaScript', 'node:22-bookworm', 'npm install', '', 'package.json inválido: revise o arquivo e configure o comando.'); }
  }
  if (has('requirements.txt') || has('pyproject.toml') || files.some(x => x.endsWith('.py'))) {
    const plan = await dependencyPlan(directory);
    const entry = ['app.py', 'main.py', 'server.py', 'manage.py'].find(has);
    return make('Python', 'python:3.12-bookworm', plan.steps.join(' && '), entry ? `python ${entry}${entry === 'manage.py' ? ' runserver 0.0.0.0:8000' : ''}` : '', 'O Orbit prepara um ambiente Python do projeto e instala os pacotes. Projetos com GPU ou ambientes específicos exigem configuração própria.');
  }
  if (has('Cargo.toml')) return make('Rust', 'rust:1-bookworm', 'cargo fetch', 'cargo run', 'Bibliotecas Rust sem binário precisam de um exemplo ou comando próprio.');
  if (has('go.mod')) return make('Go', 'golang:1-bookworm', 'go mod download', 'go run .');
  if (has('pom.xml')) return make('Java', 'maven:3-eclipse-temurin-21', 'mvn -B dependency:resolve', '', 'Configure o comando de início do projeto Maven.');
  if (files.some(x => /\.(csproj|fsproj|sln)$/.test(x))) return make('C#', 'mcr.microsoft.com/dotnet/sdk:8.0', 'dotnet restore', 'dotnet run --urls http://0.0.0.0:8000');
  if (has('Gemfile')) return make('Ruby', 'ruby:3-bookworm', 'bundle config set --local path vendor/bundle && bundle install', has('config.ru') ? 'bundle exec rackup --host 0.0.0.0 --port 8000' : '');
  if (has('composer.json') || has('index.php')) return make('PHP', 'php:8.3-cli', '', has('index.php') ? 'php -S 0.0.0.0:8000' : '', 'Se o projeto usa Composer, selecione uma imagem que contenha Composer e configure a instalação.');
  if (has('CMakeLists.txt')) return make('C/C++', 'gcc:14', 'cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build build --parallel 2', '', 'Instalar tenta preparar CMake, Ninja, o compilador e os submódulos, e depois compila. Se houver um único programa principal, o Orbit configura sua execução.');
  if (await isDocumentationOnly(directory)) return make('Documentação', '', '', '', DOCUMENTATION_NOTE);
  return make('Personalizado', 'ubuntu:24.04', '', '', 'Defina uma imagem com as ferramentas necessárias e os comandos indicados no README.');
}

export function dockerArguments(project, directory, command, containerName) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(project.image || '')) throw new Error('Informe uma imagem Docker válida.');
  if (directory.includes(',')) throw new Error('Docker não aceita vírgula neste caminho. Mova o Orbit para outra pasta.');
  const args = ['run', '--rm', '--init', '--name', containerName, '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=256', '--memory=4g', '--cpus=2', '--mount', `type=bind,source=${directory},target=/workspace`, '-w', '/workspace', '-e', 'PYTHONUNBUFFERED=1', '-e', 'PYTHONPATH=/workspace/.orbit-packages'];
  if (!project.network) args.push('--network=none');
  const port = Number(project.port);
  if (port) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use uma porta entre 1024 e 65535.');
    args.push('-p', `127.0.0.1:${port}:${port}`);
  }
  args.push(project.image, 'sh', '-lc', command);
  return args;
}

export function capture(executable, args = [], options = {}) {
  return new Promise(resolve => {
    let output = '';
    let settled = false;
    const child = spawn(executable, args, { windowsHide: true, ...options });
    const finish = (ok, error) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ ok, output: (output || error || '').trim() }); };
    const timer = setTimeout(() => { child.kill(); finish(false, 'Tempo limite excedido.'); }, options.timeout || 7000);
    child.stdout?.on('data', chunk => { output = (output + chunk).slice(-12000); });
    child.stderr?.on('data', chunk => { output = (output + chunk).slice(-12000); });
    child.on('error', error => finish(false, error.message));
    child.on('close', code => finish(code === 0));
  });
}
