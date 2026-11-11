import { promises as fs } from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['tests', 'test', 'examples', 'docs', 'assets', 'models', 'data', 'node_modules', 'vendor', 'build', 'dist', '__pycache__']);
const FIRST = ['server', 'api', 'app', 'src', 'backend'];

// Read code only: README commands are never executed as instructions.
export async function pythonSources(directory) {
  const sources = {};
  let visited = 0;
  async function scan(relative, depth) {
    if (++visited > 100 || Object.keys(sources).length >= 160) return;
    let entries;
    try { entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.py') || entry.name.startsWith('test_') || Object.keys(sources).length >= 160) continue;
      const name = relative ? relative + '/' + entry.name : entry.name;
      sources[name] = (await fs.readFile(path.join(directory, name), 'utf8')).slice(0, 120000);
    }
    if (depth >= 3) return;
    const rank = name => FIRST.includes(name) ? FIRST.indexOf(name) : FIRST.length;
    for (const entry of entries.filter(item => item.isDirectory() && !item.name.startsWith('.') && !SKIP.has(item.name.toLowerCase())).sort((a, b) => rank(a.name) - rank(b.name))) {
      await scan(relative ? relative + '/' + entry.name : entry.name, depth + 1);
    }
  }
  await scan('', 0);
  return sources;
}

export function pythonWebEntry(sources) {
  for (const [file, code] of Object.entries(sources)) {
    const module = file.replace(/^src\//, '').replace(/\.py$/, '').replaceAll('/', '.');
    let match;
    if (/\bFastAPI\(/.test(code) && (match = code.match(/^def\s+(create_app|make_app)\s*\(/m))) return { file, module, framework: 'fastapi', target: match[1], factory: true };
    if ((match = code.match(/^(\w+)\s*=\s*(?:fastapi\.)?FastAPI\(/m))) return { file, module, framework: 'fastapi', target: match[1] };
    if ((match = code.match(/^\s*(\w+)\s*=\s*(?:flask\.)?Flask\(/m))) return { file, module, framework: 'flask', target: match[1] };
    if (/^\s*(?:from|import)\s+streamlit\b/m.test(code)) return { file, module, framework: 'streamlit' };
    if (/^\s*(?:from|import)\s+gradio\b/m.test(code) && /\.launch\(/.test(code)) return { file, module, framework: 'gradio' };
  }
  return null;
}
