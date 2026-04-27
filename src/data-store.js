export const ARTICLE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    link TEXT NOT NULL UNIQUE,
    summary TEXT,
    published_at TEXT,
    ingested_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source)"
];

const NEWS_COLUMNS = `id, source, title, link, summary, published_at AS publishedAt, ingested_at AS ingestedAt`;

function isPromise(value) {
  return Boolean(value) && typeof value.then === "function";
}

export function normalizeRows(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.results)) return result.results;
  return [];
}

export function normalizeRow(result) {
  if (Array.isArray(result)) return result[0] ?? null;
  if (Array.isArray(result?.results)) return result.results[0] ?? null;
  return result ?? null;
}

export function normalizeChanges(result) {
  return result?.changes ?? result?.meta?.changes ?? 0;
}

async function callStatement(db, method, sql, params = {}) {
  const statement = db.prepare(sql);
  const result = statement[method](params);
  return isPromise(result) ? await result : result;
}

export async function ensureArticlesSchema(db) {
  for (const statement of ARTICLE_SCHEMA_STATEMENTS) {
    await queryRun(db, statement);
  }
}

export async function queryAll(db, sql, params = {}) {
  return normalizeRows(await callStatement(db, "all", sql, params));
}

export async function queryGet(db, sql, params = {}) {
  return normalizeRow(await callStatement(db, "get", sql, params));
}

export async function queryRun(db, sql, params = {}) {
  return callStatement(db, "run", sql, params);
}

export async function insertArticles(db, articles = []) {
  const statement = db.prepare(`
    INSERT OR IGNORE INTO articles (source, title, link, summary, published_at, ingested_at)
    VALUES (@source, @title, @link, @summary, @published_at, @ingested_at)
  `);

  let inserted = 0;

  for (const article of articles) {
    const result = statement.run(article);
    const changes = normalizeChanges(isPromise(result) ? await result : result);
    inserted += changes > 0 ? changes : 0;
  }

  return inserted;
}

export async function fetchNews(db, { source = "", fromDate = "", toDate = "", limit = 80, offset = 0 } = {}) {
  const items = await queryAll(
    db,
    `
      SELECT ${NEWS_COLUMNS}
      FROM articles
      WHERE (@source = '' OR source = @source)
        AND (@fromDate = '' OR date(published_at) >= date(@fromDate))
        AND (@toDate = '' OR date(published_at) <= date(@toDate))
      ORDER BY datetime(published_at) DESC, datetime(ingested_at) DESC
      LIMIT @limit OFFSET @offset
    `,
    { source, fromDate, toDate, limit, offset }
  );

  return { items, total: items.length };
}

export async function fetchMeta(db) {
  const [sources, days] = await Promise.all([
    queryAll(
      db,
      `
        SELECT source, COUNT(*) AS count
        FROM articles
        GROUP BY source
        ORDER BY count DESC, source ASC
      `
    ),
    queryAll(
      db,
      `
        SELECT date(published_at) AS day, COUNT(*) AS count
        FROM articles
        GROUP BY date(published_at)
        ORDER BY day DESC
        LIMIT 30
      `
    )
  ]);

  return { sources, days };
}

export async function fetchRecentNews(db, hoursWindow = 72) {
  return queryAll(
    db,
    `
      SELECT source, title, summary, published_at AS publishedAt
      FROM articles
      WHERE datetime(published_at) >= datetime('now', @window)
      ORDER BY datetime(published_at) DESC, datetime(ingested_at) DESC
      LIMIT 400
    `,
    { window: `-${hoursWindow} hours` }
  );
}