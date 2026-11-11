import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isDocumentationOnly } from './runner.mjs';
import { pythonSources, pythonWebEntry } from './python-entry.mjs';

// O que cada tipo de projeto é, em linguagem simples. Só "web" abre como app no Orbit.
export const KIND_INFO = {
  web: { title: 'App web', text: '' },
  docs: { title: 'Este projeto é para ler', text: 'Este repositório é documentação ou uma lista de links: não há programa para executar. Leia o conteúdo na aba Visão geral.' },
  mcp: { title: 'Este projeto é um servidor MCP', text: 'Servidor MCP: funciona dentro de um agente de IA. Em Executar, o Orbit conecta ao Claude Code ou ao Codex com um clique, ou inicia o servidor num terminal do Windows.' },
  cli: { title: 'Este projeto é uma ferramenta de terminal', text: 'Ferramenta de terminal: em Executar, o Orbit prepara e inicia a ferramenta, acompanha a saída e tenta corrigir falhas reconhecidas automaticamente.' },
  library: { title: 'Este projeto é uma biblioteca', text: 'Biblioteca: em Executar, o Orbit instala as dependências e tenta iniciar a entrada declarada ou importar a biblioteca, acompanhando o resultado e tentando corrigir falhas reconhecidas.' },
  native: { title: 'Este projeto é um programa nativo', text: 'Programa nativo: em Executar, o Orbit baixa a versão para Windows da página de Releases (ou compila com as ferramentas do seu computador) e abre o programa numa janela própria.' },
  android: { title: 'Este projeto é um app Android', text: 'App Android: em Executar, o Orbit baixa o APK das Releases e instala no aparelho conectado por ADB, ou roda o script de instalação do projeto.' },
  unknown: { title: 'O Orbit não reconheceu como executar', text: 'Não há um manifesto conhecido (package.json, requirements.txt, Dockerfile, Cargo.toml, go.mod…) na raiz nem nas pastas principais. Em Configuração, informe a imagem Docker e os comandos de instalação e execução indicados no README.' }
};
export const RUNNABLE = new Set(['web']);

const SKIP = new Set(['.git', '.github', 'node_modules', 'docs', 'doc', 'documentation', 'examples', 'example', 'samples', 'test', 'tests', '__tests__', 'third_party', 'vendor', 'fixtures', 'benchmarks', 'bench', 'scripts', 'licenses', 'assets', 'media', 'images', '.orbit-runtime', '.orbit-packages', '.venv', 'dist', 'build', 'target']);
const PREFERRED = ['web', 'app', 'frontend', 'client', 'ui', 'site', 'www', 'webapp', 'server', 'backend', 'api', 'dashboard', 'studio', 'playground'];
const NODE_FRONT = ['vite', 'next', 'nuxt', 'astro', '@sveltejs/kit', 'react-scripts', '@angular/cli', 'gatsby', 'react-dom', 'vue', 'svelte', 'solid-js', 'preact', '@remix-run/dev'];
const PY_WEB = ['flask', 'fastapi', 'django', 'streamlit', 'gradio', 'uvicorn', 'aiohttp', 'starlette', 'dash', 'panel', 'nicegui', 'chainlit', 'tornado', 'sanic', 'bottle', 'quart', 'litestar', 'reflex', 'mesop', 'solara', 'shiny', 'waitress', 'gunicorn'];
const PY_GUI = ['pygame', 'pyqt5', 'pyqt6', 'pyside2', 'pyside6', 'kivy', 'wxpython', 'pyglet', 'arcade', 'customtkinter', 'dearpygui', 'pywebview', 'flet'];
const PY_GUI_IMPORTS = ['pygame', 'tkinter', 'PyQt5', 'PyQt6', 'PySide2', 'PySide6', 'kivy', 'wx', 'pyglet', 'arcade', 'customtkinter', 'dearpygui', 'webview'];
const RUST_WEB = ['axum', 'actix-web', 'rocket', 'warp', 'poem', 'tide', 'salvo', 'leptos_axum', 'loco-rs'];
const RUST_GUI = ['bevy', 'eframe', 'egui', 'iced', 'winit', 'sdl2', 'tauri', 'slint', 'gtk', 'gtk4', 'macroquad', 'ggez', 'piston', 'fltk', 'druid', 'raylib', 'wgpu'];
const GO_WEB = ['github.com/gin-gonic/gin', 'github.com/labstack/echo', 'github.com/gofiber/fiber', 'github.com/go-chi/chi', 'github.com/gorilla/mux', 'github.com/beego', 'github.com/revel'];
const GO_GUI = ['fyne.io', 'gioui.org', 'github.com/wailsapp', 'github.com/hajimehoshi/ebiten', 'github.com/gen2brain/raylib-go'];
const esc = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function text(file, max = 200000) { try { return (await fs.readFile(file, 'utf8')).slice(0, max); } catch { return ''; } }
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }

// Escolhe o script de início de um package.json: servidores de desenvolvimento primeiro.
export function pickNodeScript(pkg) {
  const scripts = pkg.scripts || {};
  const primary = ['dev:web','dev','start','serve','preview'].find(key => typeof scripts[key] === 'string' && scripts[key].trim());
  if (primary) return primary;
  return ['start:dev','develop','dev-server','build-dev'].find(key => typeof scripts[key] === 'string' &&
    /\b(?:webpack\s+serve|webpack-dev-server|vite\s+dev|next\s+dev|astro\s+dev|ng\s+serve)\b/.test(scripts[key])) || '';
}
function mentions(source, names) { return names.some(name => new RegExp('(^|[\\s"\'`,\\[(])' + esc(name) + '(?=$|[\\s"\'`<>=~!;,\\[\\]()])', 'mi').test(source)); }
function imports(code, names) { return names.some(name => new RegExp('^\\s*(?:from|import)\\s+' + esc(name) + '\\b', 'm').test(code)); }

// Analisa uma pasta e diz o que ela contém. Devolve null quando não há nenhum manifesto reconhecível.
export async function analyzeFolder(dir) {
  let files; try { files = await fs.readdir(dir); } catch { return null; }
  const has = name => files.includes(name);
  const read = name => text(path.join(dir, name));
  const serverJson = has('server.json') ? await read('server.json') : '';
  if (/modelcontextprotocol/i.test(serverJson)) return { kind: 'mcp' };
  const dockerfile = has('Dockerfile') ? await read('Dockerfile') : '';
  if (has('package.json')) {
    let pkg; try { pkg = JSON.parse(await read('package.json')); } catch { return { kind: 'web', runtime: 'node' }; }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    const script = pickNodeScript(pkg), command = script ? pkg.scripts[script] : '';
    const front = NODE_FRONT.some(name => name in deps);
    const mcpDep = ['@modelcontextprotocol/sdk', 'fastmcp', 'mcp-framework', 'mcp-use'].some(name => name in deps);
    const mcpWord = /\bmcp\b/i.test([pkg.name, pkg.description, ...(Array.isArray(pkg.keywords) ? pkg.keywords : [])].join(' '));
    if (!front && (mcpDep || /\bmcp\b/.test(command)) && (mcpWord || /\bmcp\b/.test(command))) return { kind: 'mcp' };
    if ('electron' in deps && /\belectron\b|electron-forge|electron-vite/.test(command)) return { kind: 'native', detail: 'Electron' };
    if (script) {
      if (!Object.keys(deps).length && /\b(?:python3?|bash|make|clang\+?\+?|gcc|g\+\+|cargo|cmake)\b/.test(command)) return { kind: 'native' };
      return { kind: 'web', runtime: 'node' };
    }
    if (/^\s*EXPOSE\s+\d+/im.test(dockerfile)) return { kind: 'web', runtime: 'docker' };
    return { kind: pkg.bin ? 'cli' : 'library' };
  }
  const pyFiles = files.filter(name => name.endsWith('.py'));
  if (has('requirements.txt') || has('pyproject.toml') || has('Pipfile') || has('setup.py') || pyFiles.length) {
    const manifest = (await Promise.all(['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py'].filter(has).map(read))).join('\n').toLowerCase();
    const code = (await Promise.all(pyFiles.slice(0, 15).map(name => text(path.join(dir, name), 80000)))).join('\n');
    const web = mentions(manifest, PY_WEB) || imports(code, PY_WEB) || has('manage.py') || /\bhttp\.server\b|HTTPServer\(/.test(code);
    if ((mentions(manifest, ['mcp', 'fastmcp']) || imports(code, ['mcp', 'fastmcp'])) && !mentions(manifest, ['streamlit', 'gradio', 'django', 'flask', 'nicegui', 'chainlit'])) return { kind: 'mcp' };
    if ((web && (has('manage.py') || pyFiles.some(name => /^(?:app|main|server|run|webui|launch|demo|streamlit_app|Home|api|wsgi|asgi)\.py$/.test(name)) || pythonWebEntry(await pythonSources(dir)))) || /^\s*EXPOSE\s+\d+/im.test(dockerfile)) return { kind: 'web', runtime: 'python' };
    if (mentions(manifest, PY_GUI) || imports(code, PY_GUI_IMPORTS)) return { kind: 'native', detail: 'Python desktop' };
    if (pyFiles.length || /\[project\.scripts\]|console_scripts|\[tool\.poetry\.scripts\]/.test(manifest)) return { kind: 'cli' };
    return { kind: 'library' };
  }
  if (/^\s*EXPOSE\s+\d+/im.test(dockerfile)) return { kind: 'web', runtime: 'docker' };
  if (has('Cargo.toml')) {
    const cargo = (await read('Cargo.toml')).toLowerCase();
    const dep = names => names.some(name => new RegExp('^\\s*"?' + esc(name) + '"?\\s*=', 'm').test(cargo));
    if (dep(RUST_WEB)) return { kind: 'web', runtime: 'rust' };
    if (dep(RUST_GUI)) return { kind: 'native' };
    return { kind: /\[\[bin\]\]/.test(cargo) || await exists(path.join(dir, 'src', 'main.rs')) ? 'cli' : 'library' };
  }
  if (has('go.mod')) {
    const mod = await read('go.mod');
    if (GO_GUI.some(name => mod.includes(name))) return { kind: 'native' };
    if (GO_WEB.some(name => mod.includes(name))) return { kind: 'web', runtime: 'go' };
    const goFiles = files.filter(name => name.endsWith('.go')).slice(0, 30);
    const code = (await Promise.all(goFiles.map(name => text(path.join(dir, name), 80000)))).join('\n');
    if (/ListenAndServe|http\.Serve\(|\.Run\(":?\d*"\)/.test(code)) return { kind: 'web', runtime: 'go' };
    return { kind: goFiles.some(name => name === 'main.go') || has('cmd') ? 'cli' : 'library' };
  }
  const gradle = (await Promise.all(['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'].filter(has).map(read))).join('\n');
  const appGradle = await text(path.join(dir, 'app', 'build.gradle')) + await text(path.join(dir, 'app', 'build.gradle.kts'));
  if (/com\.android\.|android\s*\{/.test(gradle + appGradle) || has('AndroidManifest.xml')) return { kind: 'android' };
  if (has('pom.xml') || gradle) {
    const java = (await read('pom.xml')) + gradle;
    if (/spring-boot|quarkus|micronaut|javalin|io\.vertx|jetty|tomcat|ktor/i.test(java)) return { kind: 'web', runtime: 'java' };
    return { kind: 'cli' };
  }
  const project = files.find(name => /\.(cs|fs)proj$/.test(name));
  if (project) return /Microsoft\.NET\.Sdk\.(Web|BlazorWebAssembly)/.test(await read(project)) ? { kind: 'web', runtime: 'dotnet' } : { kind: 'native' };
  if (has('composer.json') || has('index.php')) return { kind: 'web', runtime: 'php' };
  if (has('Gemfile')) return /\b(rails|sinatra|rack|hanami|roda)\b/.test(await read('Gemfile')) ? { kind: 'web', runtime: 'ruby' } : { kind: 'cli' };
  if (has('CMakeLists.txt') || has('Makefile') || has('makefile') || has('meson.build') || has('configure') || files.some(name => /\.(sln|vcxproj|xcodeproj)$/.test(name))) return { kind: 'native' };
  if (has('index.html')) return { kind: 'web', runtime: 'static' };
  return null;
}

// Classifica o repositório inteiro. Quando a raiz não tem um app, procura nas pastas principais (monorepos).
export async function classifyProject(directory, {preferSource=false}={}) {
  if (await isDocumentationOnly(directory).catch(() => false)) return { kind: 'docs', appDir: '' };
  const root = await analyzeFolder(directory);
  if (root && root.kind !== 'cli' && root.kind !== 'library' && !(preferSource && root.runtime === 'docker')) return { ...root, appDir: '' };
  for (const file of preferSource ? [] : ['Dockerfile', 'deploy/Dockerfile', 'docker/Dockerfile', 'deploy/docker/Dockerfile']) {
    if (/^\s*EXPOSE\s+\d+/im.test(await text(path.join(directory, file)))) return { kind: 'web', runtime: 'docker', appDir: '' };
  }
  const candidates = [];
  const scan = async (relative, depth) => {
    let entries; try { entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP.has(entry.name.toLowerCase())) continue;
      const child = relative ? relative + '/' + entry.name : entry.name;
      const found = await analyzeFolder(path.join(directory, child));
      if (found) candidates.push({ ...found, appDir: child });
      if (depth < 2) await scan(child, depth + 1);
    }
  };
  await scan('', 1);
  const rank = item => { const name = item.appDir.split('/').pop().toLowerCase(); const index = PREFERRED.indexOf(name); return (index === -1 ? PREFERRED.length : index) + item.appDir.split('/').length * 0.1; };
  const web = candidates.filter(item => item.kind === 'web' && !(preferSource && item.runtime === 'docker')).sort((a, b) => rank(a) - rank(b));
  if (web.length) return web[0];
  if (root) return { ...root, appDir: '' };
  const order = ['mcp', 'native', 'android', 'cli', 'library'];
  const best = candidates.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];
  return best ? { ...best, appDir: '' } : { kind: 'unknown', appDir: '' };
}
