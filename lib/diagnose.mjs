// Nomes de importação que diferem do nome do pacote no pip.
const PIP_NAMES = { cv2: 'opencv-python-headless', PIL: 'pillow', sklearn: 'scikit-learn', skimage: 'scikit-image', yaml: 'pyyaml', bs4: 'beautifulsoup4', dotenv: 'python-dotenv', fitz: 'pymupdf', Crypto: 'pycryptodome', docx: 'python-docx', magic: 'python-magic', serial: 'pyserial', jwt: 'pyjwt', google: 'google-genai', attr: 'attrs' };
const pipName = module => { const top = module.split('.')[0]; return PIP_NAMES[top] || top; };
// Traduz a saída de um processo que falhou em uma explicação curta: o que aconteceu e o que fazer.
const RULES = [
  [/O app ficou sem memória|OOMKilled|JavaScript heap out of memory|^Killed\s*$/im, () => 'O app ficou sem memória e foi encerrado. Feche outros projetos em execução ou aumente a memória do Docker Desktop (Settings › Resources) e tente de novo.'],
  [/no space left on device/i, () => 'O disco do Docker está cheio. No Docker Desktop, use Troubleshoot › Clean / Purge data ou apague imagens antigas, e tente de novo.'],
  [/(?:pull access denied|manifest unknown|repository does not exist)/i, () => 'A imagem Docker indicada não existe ou é privada. Revise a imagem em Configuração.'],
  [/exec format error/i, () => 'A imagem foi feita para outro tipo de processador. Procure no README uma imagem compatível com o seu computador.'],
  [/\bENOTFOUND\b|\bEAI_AGAIN\b|Could not resolve host|Temporary failure in name resolution|getaddrinfo \S+ failed|Network is unreachable/, () => 'O container não conseguiu acessar a internet para baixar dependências. Confira sua conexão (e se a opção Rede está ligada em Configuração) e tente de novo.'],
  [/compiled runtime is missing|run `?(?:npm|pnpm|yarn) (?:run )?build/i, () => 'O projeto precisa ser compilado antes de iniciar, e o comando de início não faz isso. Em Configuração, informe um comando que rode o build e depois inicie o app.'],
  [/The engine "node" is incompatible|Unsupported engine|requires? (?:a )?node(?:\.js)? (?:version )?[<>=^~ ]*\d|EBADENGINE/i, () => 'O projeto pede outra versão do Node.js. O Orbit escolhe a versão pelo campo engines do package.json; se ele não declara, informe uma imagem como node:24-bookworm em Configuração.'],
  [/ERESOLVE|peer dep(?:endency)? conflict|Conflicting peer dependency/i, () => 'As dependências do projeto têm versões em conflito. O Orbit já tentou instalar de forma tolerante; o projeto precisa de uma correção no package.json.'],
  [/npm (?:ERR!|error) code E404|404 Not Found - GET https:\/\/registry/i, () => 'Uma dependência do projeto não existe mais no registro do npm. O projeto precisa ser atualizado pelo autor.'],
  [/gyp ERR!|node-gyp|prebuild-install (?:warn|err)/i, () => 'Uma dependência nativa não conseguiu compilar dentro do container. Verifique no README se o projeto exige bibliotecas do sistema ou uma versão específica do Node.'],
  [/error TS\d{4}/, () => 'O código TypeScript do projeto não compila. Isso é um problema no próprio repositório; tente uma versão estável (Releases) ou aguarde uma correção do autor.'],
  [/Cannot find module '([^']+)'/, match => 'Falta o módulo ' + match[1] + '. Normalmente o projeto precisa de uma etapa de build ou de uma dependência que não está declarada.'],
  [/ModuleNotFoundError: No module named '([^']+)'/, match => 'Falta o pacote Python ' + match[1] + ', que o projeto não declara nas dependências. Em Configuração, acrescente à instalação: pip install ' + pipName(match[1]) + '.'],
  [/No matching distribution found for ([^\s]+)|Could not find a version that satisfies the requirement ([^\s]+)/i, match => 'O pacote Python ' + (match[1] || match[2]) + ' não está disponível para esta versão do Python ou deste sistema. Verifique a versão exigida no README.'],
  [/CUDA|nvidia-smi|NVIDIA driver|torch\.cuda|No CUDA GPUs|cudaGetDeviceCount/i, () => 'O projeto precisa de uma placa de vídeo NVIDIA com CUDA, que não está disponível dentro do container. Procure no README uma opção para CPU.'],
  [/EADDRINUSE|Address already in use|address already in use/i, () => 'A porta que o app tentou usar já estava ocupada dentro do container. Em Configuração, deixe a porta em 0 para o Orbit escolher automaticamente.'],
  [/(?:API[_ -]?KEY|_TOKEN|SECRET)\b[^\n]{0,80}(?:not set|missing|required|is not defined|undefined|must be provided|not found)|(?:missing|set|provide)[^\n]{0,40}\b[A-Z][A-Z0-9_]*(?:API_KEY|_TOKEN|_SECRET)\b/i, () => 'O app precisa de uma chave de API ou variável de ambiente que não foi configurada. Veja no README quais variáveis ele exige.'],
  [/the input device is not a TTY|EOFError: EOF when reading a line|Inappropriate ioctl for device|stdin is not a tty/i, () => 'O programa espera que alguém digite respostas no terminal. Esse tipo de programa interativo não roda como app no Orbit.'],
  [/permission denied/i, () => 'O app tentou acessar um arquivo ou recurso sem permissão dentro do container. Veja o terminal completo para identificar qual.'],
  [/encerrou com código 137/, () => 'O container foi encerrado de fora: o Docker Desktop foi reiniciado ou fechado, ou o container foi parado. Tente executar de novo.'],
  [/O programa terminou sozinho sem abrir nenhum endereço/, () => 'O programa terminou sozinho sem abrir nenhum endereço. Provavelmente é uma ferramenta de terminal, não um app com tela. Veja no README como usar.']
];
const NOISE = /^(?:#\d+ |View build details|\s*$|Processo encerrado|Tarefa interrompida|npm notice|WARN |warning )/;
// Vale a causa que aparece por último na saída: é ela que derrubou o processo, não um aviso antigo.
export function explainFailure(output = '') {
  const text = String(output).slice(-20000);
  let best = null;
  for (const [pattern, explain] of RULES) {
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const matches = [...text.matchAll(new RegExp(pattern.source, flags))];
    const match = matches.at(-1);
    if (match && (!best || match.index > best.match.index)) best = { match, explain };
  }
  return best ? best.explain(best.match) : '';
}
// A última linha que realmente diz algo, ignorando ruído do build e avisos.
export function lastMeaningfulLine(output = '') {
  const lines = String(output).split(/\r?\n/).map(line => line.trim()).filter(line => line && !NOISE.test(line));
  return (lines.at(-1) || '').slice(0, 400);
}
