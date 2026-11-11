export const RANKING_LANGUAGES = ['Todos', 'Python', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'C', 'C++', 'C#', 'Java', 'Kotlin', 'Swift', 'Dart', 'PHP', 'Ruby', 'Lua', 'Zig', 'Elixir', 'Haskell', 'Scala', 'Shell', 'HTML', 'Vue', 'Svelte', 'Jupyter Notebook'];
// Cada filtro aceita só valores desta lista; nada do usuário vai direto para a busca do GitHub.
export const RANKING_OPTIONS = {
  period: { all: 0, year: 'year', month: 30, week: 7, day: 1 },
  updated: { any: 0, week: 7, month: 30, year: 365 },
  topic: { all: '', ai: 'llm', 'machine-learning': 'machine-learning', game: 'game', 'game-engine': 'game-engine', emulator: 'emulator', 'self-hosted': 'self-hosted', cli: 'cli', web: 'webapp', mobile: 'android', desktop: 'desktop-app', security: 'security', automation: 'automation', docker: 'docker' },
  stars: { any: 0, '100': 100, '1000': 1000, '10000': 10000, '50000': 50000 },
  license: { any: '', mit: 'mit', apache: 'apache-2.0', gpl: 'gpl-3.0', bsd: 'bsd-3-clause', mpl: 'mpl-2.0' },
  sort: { stars: 'stars', forks: 'forks', updated: 'updated' },
  lists: { show: false, hide: true }
};
export const RANKING_DEFAULTS = { language: 'Todos', period: 'all', updated: 'any', topic: 'all', stars: 'any', license: 'any', sort: 'stars', lists: 'show' };
const invalid = message => Object.assign(new Error(message), { status: 400 });
const daysAgo = (date, days) => { const cutoff = new Date(date); cutoff.setUTCDate(cutoff.getUTCDate() - days); return cutoff.toISOString().slice(0, 10); };

export function normalizeRankingFilters(input = {}) {
  const filters = { ...RANKING_DEFAULTS };
  for (const key of Object.keys(RANKING_DEFAULTS)) if (input[key] != null && input[key] !== '') filters[key] = String(input[key]);
  if (!RANKING_LANGUAGES.includes(filters.language)) throw invalid('Escolha uma linguagem da lista.');
  const labels = { period: 'um período', updated: 'uma atualização', topic: 'um tema', stars: 'um mínimo de estrelas', license: 'uma licença', sort: 'uma ordem', lists: 'uma opção de listas' };
  for (const [key, label] of Object.entries(labels)) if (!Object.hasOwn(RANKING_OPTIONS[key], filters[key])) throw invalid('Escolha ' + label + ' da lista.');
  return filters;
}

// rankingQuery(linguagem, período, data) ou rankingQuery({filtros}, data)
export function rankingQuery(language = 'Todos', period = 'all', date = new Date()) {
  let filters;
  if (typeof language === 'object' && language) { filters = normalizeRankingFilters(language); if (period instanceof Date) date = period; }
  else filters = normalizeRankingFilters({ language, period });
  const stars = RANKING_OPTIONS.stars[filters.stars];
  const parts = [stars ? 'stars:>=' + stars : 'stars:>0', 'archived:false', 'fork:false'];
  if (filters.language !== 'Todos') parts.push('language:"' + filters.language + '"');
  const created = RANKING_OPTIONS.period[filters.period];
  if (created === 'year') { const cutoff = new Date(date); cutoff.setUTCMonth(0, 1); parts.push('created:>=' + cutoff.toISOString().slice(0, 10)); }
  else if (created) parts.push('created:>=' + daysAgo(date, created));
  const pushed = RANKING_OPTIONS.updated[filters.updated];
  if (pushed) parts.push('pushed:>=' + daysAgo(date, pushed));
  const topic = RANKING_OPTIONS.topic[filters.topic];
  if (topic) parts.push('topic:' + topic);
  const license = RANKING_OPTIONS.license[filters.license];
  if (license) parts.push('license:' + license);
  if (RANKING_OPTIONS.lists[filters.lists]) parts.push('-topic:awesome-list', '-topic:awesome', '-topic:resources');
  return parts.join(' ');
}

// Cache por filtro: evita repetir consultas e permite consultar a última lista sem rede.
export function createRanking({ github, repoView, now = Date.now, ttl = 600000 }) {
  const cache = new Map();
  const pending = new Map();
  return async function ranking(input = 'Todos', legacyPeriod) {
    const filters = normalizeRankingFilters(typeof input === 'object' && input ? input : { language: input, period: legacyPeriod });
    const query = rankingQuery(filters, new Date(now()));
    const key = JSON.stringify(filters);
    const previous = cache.get(key);
    if (previous && now() - previous.timestamp < ttl) return { ...previous.data, stale: false };
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      try {
        const sort = RANKING_OPTIONS.sort[filters.sort];
        const search = value => github('search/repositories?q=' + encodeURIComponent(value) + '&sort=' + sort + '&order=desc&per_page=30');
        // Uma faixa inicial menor evita timeout em buscas com milhões de projetos.
        // Se ela não preencher a lista, a consulta é ampliada para manter o top correto.
        const narrow = filters.period === 'all' && sort === 'stars' && query.startsWith('stars:>0 ');
        let result = await search(narrow ? query.replace('stars:>0', 'stars:>=1000') : query);
        if (narrow && !result.incomplete_results && result.items.length < 30) result = await search(query);
        // Um resultado parcial nunca substitui uma consulta completa já disponível.
        if (result.incomplete_results && previous) throw new Error('O GitHub retornou uma busca parcial.');
        const timestamp = now();
        const data = { items: result.items.map(repoView), total: result.total_count, updatedAt: new Date(timestamp).toISOString(), ...filters, filters, stale: false, partial: Boolean(result.incomplete_results) };
        if (!data.partial) cache.set(key, { timestamp, data });
        return data;
      } catch (error) {
        if (previous) return { ...previous.data, stale: true, warning: 'Não foi possível atualizar o GitHub. Exibindo a última consulta. ' + error.message };
        throw error;
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, task);
    return task;
  };
}
