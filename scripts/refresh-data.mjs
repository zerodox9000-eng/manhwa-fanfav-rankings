import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const HISTORY_DIR = path.join(DATA_DIR, "history");
const API_URL = "https://graphql.anilist.co";
const BATCH_SIZE = 16;
const RATE_DELAY_MS = 2300;
const DISCOVERY_LOOKBACK_DAYS = 45;
const DISCOVERY_PAGES = 5;
const DISCOVERY_PER_PAGE = 50;
const BASELINE_FIRST_SEEN = "2026-04-17T00:00:00.000Z";

const skipFetch = process.argv.includes("--skip-fetch");

const BUCKETS = [
  { key: "5000plus", label: "5000+", filename: "5000plus.json" },
  { key: "1000to5000", label: "1000 - 5000", filename: "1000to5000.json" },
  { key: "500to1000", label: "500 - 1000", filename: "500to1000.json" },
  { key: "200to500", label: "200 - 500", filename: "200to500.json" },
  { key: "50to200", label: "50 - 200", filename: "50to200.json" },
];

const HISTORY_WINDOWS = [
  { key: "1d", days: 1 },
  { key: "3d", days: 3 },
  { key: "7d", days: 7 },
  { key: "14d", days: 14 },
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
  { key: "180d", days: 180 },
  { key: "365d", days: 365 },
];

async function main() {
  await fs.mkdir(HISTORY_DIR, { recursive: true });

  const currentBuckets = await loadCurrentBuckets();
  const previousCatalog = await loadPreviousCatalog();
  const previousById = new Map(previousCatalog.entries.map((entry) => [Number(entry.mediaId), entry]));
  const sourceEntries = collectUniqueEntries(currentBuckets, previousCatalog.entries);

  let refreshedEntries;
  let sourceLabel;

  if (skipFetch) {
    refreshedEntries = sourceEntries.map((entry) => normalizeSnapshotEntry(entry, previousById.get(entry.mediaId)));
    sourceLabel = previousCatalog.meta?.source && previousCatalog.meta.source !== "Static imported snapshot"
      ? previousCatalog.meta.source
      : "Local prepared discovery catalog";
    console.log("Prepared catalog from local snapshot without live AniList fetch.");
  } else {
    console.log(`Refreshing ${sourceEntries.length} known AniList entries...`);
    const knownEntries = await refreshKnownEntries(sourceEntries, previousById);
    const discoveredEntries = await discoverRecentEntries(previousById, new Set(knownEntries.map((entry) => entry.mediaId)));
    refreshedEntries = [...knownEntries, ...discoveredEntries];
    sourceLabel = "Daily AniList refresh";
    console.log(`Daily refresh complete with ${discoveredEntries.length} newly discovered entries.`);
  }

  const historySnapshots = await loadHistorySnapshots();
  const entriesWithGrowth = addGrowth(refreshedEntries, historySnapshots);
  const sortedEntries = sortEntries(entriesWithGrowth);
  const catalog = buildCatalog(sortedEntries, sourceLabel);

  await writeCatalog(catalog);
  await writeLegacyBuckets(sortedEntries);
  await writeHistorySnapshot(sortedEntries, catalog.meta.lastUpdated);
  await pruneHistorySnapshots();
  console.log("Catalog, legacy buckets, metadata, and history snapshot written.");
}

async function loadCurrentBuckets() {
  const buckets = new Map();

  for (const bucket of BUCKETS) {
    const filePath = path.join(DATA_DIR, bucket.filename);
    const fileContent = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(fileContent);
    buckets.set(bucket.key, parsed);
  }

  return buckets;
}

async function loadPreviousCatalog() {
  try {
    const content = await fs.readFile(path.join(DATA_DIR, "catalog.json"), "utf8");
    const parsed = JSON.parse(content);
    return {
      meta: parsed.meta || null,
      entries: Array.isArray(parsed.entries) ? parsed.entries.map(canonicalizeCatalogEntry) : [],
    };
  } catch {
    return { meta: null, entries: [] };
  }
}

function collectUniqueEntries(currentBuckets, catalogEntries) {
  const deduped = new Map();

  for (const entry of catalogEntries) {
    if (entry.mediaId) {
      deduped.set(entry.mediaId, entry);
    }
  }

  for (const bucket of BUCKETS) {
    const entries = currentBuckets.get(bucket.key) || [];
    for (const rawEntry of entries) {
      const canonical = canonicalizeLegacyEntry(rawEntry, bucket.key);
      if (canonical.mediaId && !deduped.has(canonical.mediaId)) {
        deduped.set(canonical.mediaId, canonical);
      }
    }
  }

  return Array.from(deduped.values());
}

async function refreshKnownEntries(entries, previousById) {
  const refreshed = [];
  const refreshable = entries.filter((entry) => entry.mediaId);
  const batches = chunk(refreshable, BATCH_SIZE);

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    console.log(`Fetching known batch ${index + 1}/${batches.length} (${batch.length} entries)...`);
    const mediaById = await fetchMediaBatch(batch.map((entry) => entry.mediaId));

    for (const entry of batch) {
      const media = mediaById.get(entry.mediaId);
      refreshed.push(media ? toSnapshotEntry(media, previousById.get(entry.mediaId) || entry) : normalizeSnapshotEntry(entry, previousById.get(entry.mediaId)));
    }

    if (index < batches.length - 1) {
      await wait(RATE_DELAY_MS);
    }
  }

  return refreshed;
}

async function discoverRecentEntries(previousById, knownIds) {
  const cutoff = new Date(Date.now() - DISCOVERY_LOOKBACK_DAYS * 86400000);
  const startDateGreater = Number(
    `${cutoff.getUTCFullYear()}${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}${String(cutoff.getUTCDate()).padStart(2, "0")}`
  );
  const discovered = [];

  for (let page = 1; page <= DISCOVERY_PAGES; page += 1) {
    console.log(`Searching recent KR releases page ${page}/${DISCOVERY_PAGES}...`);
    const media = await fetchRecentMediaPage(page, startDateGreater);

    for (const item of media) {
      if (!item?.id || knownIds.has(Number(item.id))) continue;
      const entry = toSnapshotEntry(item, previousById.get(Number(item.id)), true);
      discovered.push(entry);
      knownIds.add(Number(item.id));
    }

    if (media.length < DISCOVERY_PER_PAGE) break;
    await wait(RATE_DELAY_MS);
  }

  return discovered;
}

async function fetchMediaBatch(mediaIds) {
  const query = buildBatchQuery(mediaIds);
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "peakhwa-daily-refresh",
    },
    body: JSON.stringify({ query }),
  });

  return readMediaMapResponse(response, () => fetchMediaBatch(mediaIds));
}

async function fetchRecentMediaPage(page, startDateGreater) {
  const query = `
    query ($page: Int, $perPage: Int, $startDate: FuzzyDateInt) {
      Page(page: $page, perPage: $perPage) {
        media(type: MANGA, countryOfOrigin: "KR", sort: START_DATE_DESC, startDate_greater: $startDate) {
          ${mediaFields()}
        }
      }
    }
  `;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "peakhwa-daily-discovery",
    },
    body: JSON.stringify({
      query,
      variables: { page, perPage: DISCOVERY_PER_PAGE, startDate: startDateGreater },
    }),
  });

  const payload = await readJsonResponse(response, () => fetchRecentMediaPage(page, startDateGreater));
  return payload.data?.Page?.media || [];
}

async function readMediaMapResponse(response, retry) {
  const payload = await readJsonResponse(response, retry);
  const result = new Map();

  for (const key of Object.keys(payload.data || {})) {
    const media = payload.data[key];
    if (media?.id) {
      result.set(Number(media.id), media);
    }
  }

  return result;
}

async function readJsonResponse(response, retry) {
  const payload = await response.json();

  if (response.status === 429) {
    const resetAt = response.headers.get("x-ratelimit-reset");
    const waitSeconds = resetAt ? Math.max(Number(resetAt) - Math.floor(Date.now() / 1000), 10) : 30;
    console.log(`AniList rate limit hit. Waiting ${waitSeconds}s before retrying...`);
    await wait(waitSeconds * 1000);
    return retry();
  }

  if (!response.ok || (payload.errors?.length && !payload.data)) {
    throw new Error(payload.errors?.[0]?.message || `AniList request failed with status ${response.status}`);
  }

  return payload;
}

function buildBatchQuery(mediaIds) {
  const selections = mediaIds
    .map((mediaId, index) => `item${index}: Media(id: ${mediaId}, type: MANGA) { ${mediaFields()} }`)
    .join("\n");
  return `query DailySnapshotBatch {\n${selections}\n}`;
}

function mediaFields() {
  return `
    id
    siteUrl
    title { english romaji userPreferred native }
    synonyms
    coverImage { extraLarge large medium color }
    bannerImage
    genres
    tags { name rank isMediaSpoiler }
    popularity
    favourites
    meanScore
    averageScore
    status
    startDate { year month day }
    chapters
    volumes
  `;
}

function toSnapshotEntry(media, fallbackEntry = {}, isNewDiscovery = false) {
  const popularity = Number(media.popularity || fallbackEntry.popularity || 0);
  const favourites = Number(media.favourites || fallbackEntry.favourites || 0);
  const synonyms = normalizeStringArray(media.synonyms || fallbackEntry.synonyms);
  const englishTitle = cleanTitle(media.title?.english || fallbackEntry.englishTitle);
  const romajiTitle = cleanTitle(media.title?.romaji || fallbackEntry.romajiTitle);
  const userPreferredTitle = cleanTitle(media.title?.userPreferred || fallbackEntry.userPreferredTitle);
  const nativeTitle = cleanTitle(media.title?.native || fallbackEntry.nativeTitle);
  const displayTitle = chooseDisplayTitle({
    english: englishTitle,
    synonyms,
    snapshotTitle: fallbackEntry.displayTitle || fallbackEntry.title,
    romaji: romajiTitle,
    userPreferred: userPreferredTitle,
    native: nativeTitle,
  });

  return {
    mediaId: Number(media.id || fallbackEntry.mediaId || 0),
    aniListUrl: media.siteUrl || fallbackEntry.aniListUrl || "",
    displayTitle,
    englishTitle,
    romajiTitle,
    userPreferredTitle,
    nativeTitle,
    synonyms,
    coverImage: media.coverImage?.extraLarge || media.coverImage?.large || fallbackEntry.coverImage || "",
    coverImageSmall: media.coverImage?.large || media.coverImage?.medium || fallbackEntry.coverImageSmall || "",
    coverColor: media.coverImage?.color || fallbackEntry.coverColor || "",
    bannerImage: media.bannerImage || fallbackEntry.bannerImage || "",
    genres: normalizeStringArray(media.genres || fallbackEntry.genres),
    tags: normalizeTags(media.tags || fallbackEntry.tags),
    fanFav: calculateFanFav(favourites, popularity),
    meanScore: numberOrNull(media.meanScore ?? fallbackEntry.meanScore),
    averageScore: numberOrNull(media.averageScore ?? fallbackEntry.averageScore),
    status: media.status || fallbackEntry.status || "UNKNOWN",
    startDate: normalizeStartDate(media.startDate || fallbackEntry.startDate, fallbackEntry.startYear),
    startYear: Number(media.startDate?.year || fallbackEntry.startYear || 0),
    popularity,
    favourites,
    chapters: numberOrNull(media.chapters ?? fallbackEntry.chapters),
    volumes: numberOrNull(media.volumes ?? fallbackEntry.volumes),
    firstSeen: fallbackEntry.firstSeen || (isNewDiscovery ? new Date().toISOString() : BASELINE_FIRST_SEEN),
    lastUpdated: new Date().toISOString(),
  };
}

function normalizeSnapshotEntry(entry, previousEntry) {
  const fallback = previousEntry || entry;
  const popularity = Number(entry.popularity || entry.Popularity || fallback.popularity || 0);
  const favourites = Number(entry.favourites || entry.Favourites || fallback.favourites || 0);
  const synonyms = normalizeStringArray(entry.synonyms || fallback.synonyms);
  const englishTitle = cleanTitle(entry.englishTitle || fallback.englishTitle);
  const romajiTitle = cleanTitle(entry.romajiTitle || fallback.romajiTitle);
  const displayTitle = chooseDisplayTitle({
    english: englishTitle,
    synonyms,
    snapshotTitle: entry.displayTitle || entry.title || entry.Title || fallback.displayTitle,
    romaji: romajiTitle,
    userPreferred: entry.userPreferredTitle || fallback.userPreferredTitle,
    native: entry.nativeTitle || fallback.nativeTitle,
  });

  return {
    mediaId: Number(entry.mediaId || fallback.mediaId || 0),
    aniListUrl: entry.aniListUrl || entry["AniList URL"] || fallback.aniListUrl || "",
    displayTitle,
    englishTitle,
    romajiTitle,
    userPreferredTitle: cleanTitle(entry.userPreferredTitle || fallback.userPreferredTitle),
    nativeTitle: cleanTitle(entry.nativeTitle || fallback.nativeTitle),
    synonyms,
    coverImage: entry.coverImage || fallback.coverImage || "",
    coverImageSmall: entry.coverImageSmall || fallback.coverImageSmall || "",
    coverColor: entry.coverColor || fallback.coverColor || "",
    bannerImage: entry.bannerImage || fallback.bannerImage || "",
    genres: normalizeStringArray(entry.genres || fallback.genres),
    tags: normalizeStringArray(entry.tags || fallback.tags),
    fanFav: Number(entry.fanFav ?? entry["FAN FAV"] ?? calculateFanFav(favourites, popularity)),
    meanScore: numberOrNull(entry.meanScore ?? entry["Mean Score"] ?? fallback.meanScore),
    averageScore: numberOrNull(entry.averageScore ?? fallback.averageScore),
    status: entry.status || entry.Status || fallback.status || "UNKNOWN",
    startDate: normalizeStartDate(entry.startDate || fallback.startDate, entry.startYear || entry["Start Year"] || fallback.startYear),
    startYear: Number(entry.startYear || entry["Start Year"] || fallback.startYear || 0),
    popularity,
    favourites,
    chapters: numberOrNull(entry.chapters ?? fallback.chapters),
    volumes: numberOrNull(entry.volumes ?? fallback.volumes),
    firstSeen: entry.firstSeen || fallback.firstSeen || BASELINE_FIRST_SEEN,
    lastUpdated: new Date().toISOString(),
  };
}

function canonicalizeLegacyEntry(rawEntry, bucketKey) {
  const aniListUrl = rawEntry["AniList URL"] || rawEntry.aniListUrl || "";
  const mediaId = Number(rawEntry.mediaId || parseMediaId(aniListUrl) || 0);
  return {
    mediaId,
    aniListUrl,
    displayTitle: cleanTitle(rawEntry.displayTitle || rawEntry.Title || rawEntry.title),
    title: cleanTitle(rawEntry.Title || rawEntry.title),
    fanFav: Number(rawEntry["FAN FAV"] || rawEntry.fanFav || 0),
    meanScore: numberOrNull(rawEntry["Mean Score"] ?? rawEntry.meanScore),
    status: rawEntry.Status || rawEntry.status || "UNKNOWN",
    startYear: Number(rawEntry["Start Year"] || rawEntry.startYear || 0),
    popularity: Number(rawEntry.Popularity || rawEntry.popularity || 0),
    favourites: Number(rawEntry.Favourites || rawEntry.favourites || 0),
    bucketKey,
    firstSeen: rawEntry.firstSeen || BASELINE_FIRST_SEEN,
  };
}

function canonicalizeCatalogEntry(rawEntry) {
  return normalizeSnapshotEntry(rawEntry, rawEntry);
}

async function loadHistorySnapshots() {
  const snapshots = [];
  const files = await fs.readdir(HISTORY_DIR).catch(() => []);

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      const content = await fs.readFile(path.join(HISTORY_DIR, file), "utf8");
      const parsed = JSON.parse(content);
      const date = parsed.date || parsed.meta?.lastUpdated || file.replace(".json", "");
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      snapshots.push({
        date,
        time: new Date(date).getTime(),
        entriesById: new Map(entries.map((entry) => [Number(entry.mediaId), entry])),
      });
    } catch (error) {
      console.warn(`Skipping unreadable history snapshot ${file}: ${error.message}`);
    }
  }

  return snapshots.sort((left, right) => left.time - right.time);
}

function addGrowth(entries, historySnapshots) {
  const now = Date.now();

  return entries.map((entry) => {
    const growth = {};
    for (const window of HISTORY_WINDOWS) {
      const target = now - window.days * 86400000;
      const previous = findClosestSnapshot(historySnapshots, target)?.entriesById.get(entry.mediaId);
      growth[window.key] = previous ? calculateGrowth(entry, previous) : zeroGrowth();
    }

    const first = historySnapshots[0]?.entriesById.get(entry.mediaId);
    growth.all = first ? calculateGrowth(entry, first) : zeroGrowth();
    return { ...entry, growth };
  });
}

function findClosestSnapshot(snapshots, targetTime) {
  let closest = null;
  let closestDelta = Infinity;

  for (const snapshot of snapshots) {
    const delta = Math.abs(snapshot.time - targetTime);
    if (delta < closestDelta) {
      closest = snapshot;
      closestDelta = delta;
    }
  }

  return closest;
}

function calculateGrowth(current, previous) {
  return {
    popularity: Number(current.popularity || 0) - Number(previous.popularity || 0),
    favourites: Number(current.favourites || 0) - Number(previous.favourites || 0),
    fanFav: Number((Number(current.fanFav || 0) - Number(previous.fanFav || 0)).toFixed(2)),
    meanScore: Number(current.meanScore || 0) - Number(previous.meanScore || 0),
  };
}

function zeroGrowth() {
  return { popularity: 0, favourites: 0, fanFav: 0, meanScore: 0 };
}

function buildCatalog(entries, sourceLabel) {
  const now = new Date().toISOString();
  const indexes = {
    genres: topValues(entries.flatMap((entry) => entry.genres), 64),
    tags: topValues(entries.flatMap((entry) => entry.tags), 96),
  };

  return {
    meta: {
      lastUpdated: now,
      source: sourceLabel,
      totalEntries: entries.length,
      defaultPage: "discovery",
      defaultTab: "relevant",
      defaultWindow: "7d",
      indexes,
      lanes: laneCounts(entries),
      statuses: countBy(entries, (entry) => entry.status || "UNKNOWN"),
    },
    entries: entries.map(toCatalogEntry),
  };
}

function toCatalogEntry(entry) {
  return {
    mediaId: entry.mediaId,
    aniListUrl: entry.aniListUrl,
    displayTitle: entry.displayTitle,
    englishTitle: entry.englishTitle,
    romajiTitle: entry.romajiTitle,
    userPreferredTitle: entry.userPreferredTitle,
    nativeTitle: entry.nativeTitle,
    synonyms: entry.synonyms,
    coverImage: entry.coverImage,
    coverImageSmall: entry.coverImageSmall,
    coverColor: entry.coverColor,
    bannerImage: entry.bannerImage,
    genres: entry.genres,
    tags: entry.tags,
    fanFav: Number(Number(entry.fanFav || 0).toFixed(2)),
    meanScore: entry.meanScore || 0,
    averageScore: entry.averageScore || 0,
    status: entry.status,
    startDate: entry.startDate,
    startYear: entry.startYear || entry.startDate?.year || 0,
    popularity: entry.popularity || 0,
    favourites: entry.favourites || 0,
    chapters: entry.chapters || 0,
    volumes: entry.volumes || 0,
    firstSeen: entry.firstSeen,
    lastUpdated: entry.lastUpdated,
    growth: entry.growth,
  };
}

async function writeCatalog(catalog) {
  await fs.writeFile(path.join(DATA_DIR, "catalog.json"), `${JSON.stringify(catalog)}\n`, "utf8");
  await fs.writeFile(path.join(DATA_DIR, "snapshot-meta.json"), `${JSON.stringify(catalog.meta, null, 2)}\n`, "utf8");
}

async function writeLegacyBuckets(entries) {
  const buckets = new Map(BUCKETS.map((bucket) => [bucket.key, []]));

  for (const entry of entries) {
    const bucketKey = resolveLegacyBucket(entry.popularity);
    if (bucketKey) {
      buckets.get(bucketKey).push(entry);
    }
  }

  for (const bucket of BUCKETS) {
    const serializable = sortEntries(buckets.get(bucket.key) || []).map((entry) => ({
      Title: entry.displayTitle,
      "FAN FAV": Number(Number(entry.fanFav || 0).toFixed(2)),
      "Mean Score": entry.meanScore || 0,
      Status: entry.status,
      "Start Year": entry.startYear || 0,
      Popularity: entry.popularity || 0,
      Favourites: entry.favourites || 0,
      "AniList URL": entry.aniListUrl,
    }));
    await fs.writeFile(path.join(DATA_DIR, bucket.filename), `${JSON.stringify(serializable, null, 2)}\n`, "utf8");
  }
}

async function writeHistorySnapshot(entries, lastUpdated) {
  const dateKey = lastUpdated.slice(0, 10);
  const history = {
    date: lastUpdated,
    entries: entries.map((entry) => ({
      mediaId: entry.mediaId,
      fanFav: Number(Number(entry.fanFav || 0).toFixed(2)),
      meanScore: entry.meanScore || 0,
      popularity: entry.popularity || 0,
      favourites: entry.favourites || 0,
      startYear: entry.startYear || 0,
    })),
  };
  await fs.writeFile(path.join(HISTORY_DIR, `${dateKey}.json`), `${JSON.stringify(history)}\n`, "utf8");
}

async function pruneHistorySnapshots() {
  const files = (await fs.readdir(HISTORY_DIR).catch(() => [])).filter((file) => file.endsWith(".json")).sort();
  const keep = new Set(files.slice(-420));

  for (const file of files) {
    if (!keep.has(file)) {
      await fs.rm(path.join(HISTORY_DIR, file));
    }
  }
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    return (
      compareDescending(left.fanFav, right.fanFav) ||
      compareDescending(left.meanScore ?? -1, right.meanScore ?? -1) ||
      compareDescending(left.favourites, right.favourites) ||
      compareDescending(left.popularity, right.popularity) ||
      left.displayTitle.localeCompare(right.displayTitle)
    );
  });
}

function compareDescending(left, right) {
  return (right || 0) - (left || 0);
}

function resolveLegacyBucket(popularity) {
  if (popularity >= 5000) return "5000plus";
  if (popularity >= 1000) return "1000to5000";
  if (popularity >= 500) return "500to1000";
  if (popularity >= 200) return "200to500";
  if (popularity >= 50) return "50to200";
  return null;
}

function laneCounts(entries) {
  return {
    mainstream: entries.filter((entry) => entry.popularity >= 5000).length,
    established: entries.filter((entry) => entry.popularity >= 1000 && entry.popularity < 5000).length,
    rising: entries.filter((entry) => entry.popularity >= 300 && entry.popularity < 1000).length,
    underground: entries.filter((entry) => entry.popularity >= 100 && entry.popularity < 300).length,
    tooEarly: entries.filter((entry) => entry.popularity < 100).length,
  };
}

function countBy(entries, getKey) {
  const counts = {};
  for (const entry of entries) {
    const key = getKey(entry);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function topValues(values, limit) {
  const counts = new Map();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  if (typeof tags[0] === "string") return normalizeStringArray(tags);
  return tags
    .filter((tag) => !tag.isMediaSpoiler)
    .sort((left, right) => (right.rank || 0) - (left.rank || 0))
    .slice(0, 18)
    .map((tag) => cleanTitle(tag.name))
    .filter(Boolean);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(cleanTitle).filter(Boolean)));
}

function normalizeStartDate(startDate, startYearFallback) {
  if (startDate && typeof startDate === "object") {
    const year = Number(startDate.year || 0);
    if (!year) return null;
    return {
      year,
      month: Number(startDate.month || 1),
      day: Number(startDate.day || 1),
    };
  }

  const year = Number(startYearFallback || 0);
  return year ? { year, month: 1, day: 1 } : null;
}

function chooseDisplayTitle({ english, synonyms = [], snapshotTitle, romaji, userPreferred, native }) {
  if (isUsableTitle(english)) return cleanTitle(english);

  const englishSynonym = chooseEnglishSynonym(synonyms);
  if (englishSynonym) return englishSynonym;

  if (looksEnglish(snapshotTitle)) return cleanTitle(snapshotTitle);
  if (isUsableTitle(romaji)) return cleanTitle(romaji);
  if (isUsableTitle(userPreferred)) return cleanTitle(userPreferred);
  if (isUsableTitle(native)) return cleanTitle(native);
  return "Untitled";
}

function chooseEnglishSynonym(synonyms) {
  return normalizeStringArray(synonyms)
    .map((synonym) => ({ synonym, score: englishTitleScore(synonym) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.synonym.length - right.synonym.length)[0]?.synonym || "";
}

function englishTitleScore(value) {
  const text = cleanTitle(value);
  if (!looksLatin(text)) return 0;
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  if (!words.length) return 0;

  const common = new Set([
    "a", "an", "and", "are", "back", "best", "blade", "day", "developer", "estate", "family", "field",
    "forgotten", "god", "gods", "greatest", "home", "homeless", "i", "level", "love", "magic", "max",
    "my", "newbie", "no", "of", "only", "princess", "reader", "return", "school", "solo", "star", "the",
    "to", "up", "with", "world"
  ]);
  const romanizationWords = new Set(["na", "ni", "ga", "wa", "wo", "ui", "eopseo", "dake", "ken"]);
  const commonHits = words.filter((word) => common.has(word)).length;
  const romanizationPenalty = words.filter((word) => romanizationWords.has(word)).length;
  return commonHits * 3 + (/\s/.test(text) ? 1 : 0) + (text.length <= 34 ? 1 : 0) - romanizationPenalty * 2;
}

function looksEnglish(value) {
  return englishTitleScore(value) >= 2;
}

function looksLatin(value) {
  const text = cleanTitle(value);
  return Boolean(text) && /^[\u0000-\u007f]+$/.test(text) && /[a-z]/i.test(text);
}

function isUsableTitle(value) {
  return Boolean(cleanTitle(value));
}

function cleanTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function calculateFanFav(favourites, popularity) {
  if (!popularity) return 0;
  return (Number(favourites || 0) / Number(popularity)) * 100;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseMediaId(url) {
  const match = String(url || "").match(/\/manga\/(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
