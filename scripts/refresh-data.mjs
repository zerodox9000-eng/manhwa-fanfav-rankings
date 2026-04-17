import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const API_URL = "https://graphql.anilist.co";
const BATCH_SIZE = 20;
const RATE_DELAY_MS = 2100;

const BUCKETS = [
  { key: "5000plus", label: "5000+", filename: "5000plus.json" },
  { key: "1000to5000", label: "1000 - 5000", filename: "1000to5000.json" },
  { key: "500to1000", label: "500 - 1000", filename: "500to1000.json" },
  { key: "200to500", label: "200 - 500", filename: "200to500.json" },
  { key: "50to200", label: "50 - 200", filename: "50to200.json" },
];

const skipFetch = process.argv.includes("--skip-fetch");

async function main() {
  const currentBuckets = await loadCurrentBuckets();

  if (skipFetch) {
    const normalizedBuckets = new Map();
    for (const [bucketKey, entries] of currentBuckets.entries()) {
      normalizedBuckets.set(bucketKey, sortEntries(entries.map((entry) => canonicalizeExistingEntry(entry, bucketKey))));
    }

    await writeBucketsAndMetadata(normalizedBuckets, "Static imported snapshot");
    console.log("Prepared current snapshot metadata without live AniList refresh.");
    return;
  }

  const sourceEntries = collectUniqueEntries(currentBuckets);
  console.log(`Refreshing ${sourceEntries.length} unique AniList entries across all buckets...`);

  const refreshedEntries = await refreshEntries(sourceEntries);
  const rebucketedEntries = bucketEntries(refreshedEntries);

  await writeBucketsAndMetadata(rebucketedEntries, "Weekly AniList refresh");
  console.log("Weekly snapshot refresh complete.");
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

function collectUniqueEntries(currentBuckets) {
  const deduped = new Map();

  for (const bucket of BUCKETS) {
    const entries = currentBuckets.get(bucket.key) || [];
    for (const rawEntry of entries) {
      const canonical = canonicalizeExistingEntry(rawEntry, bucket.key);
      const dedupeKey = canonical.aniListUrl || `${canonical.bucketKey}:${canonical.title}`;
      if (!deduped.has(dedupeKey)) {
        deduped.set(dedupeKey, canonical);
      }
    }
  }

  return Array.from(deduped.values());
}

async function refreshEntries(entries) {
  const refreshedById = new Map();
  const refreshable = entries.filter((entry) => entry.mediaId);
  const batches = chunk(refreshable, BATCH_SIZE);

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    console.log(`Fetching AniList batch ${index + 1}/${batches.length} (${batch.length} entries)...`);

    const mediaById = await fetchMediaBatch(batch.map((entry) => entry.mediaId));
    for (const entry of batch) {
      const media = mediaById.get(entry.mediaId);
      refreshedById.set(entry.mediaId, media ? toSnapshotEntry(media, entry) : entry);
    }

    if (index < batches.length - 1) {
      await wait(RATE_DELAY_MS);
    }
  }

  return entries.map((entry) => {
    if (!entry.mediaId) {
      return entry;
    }

    return refreshedById.get(entry.mediaId) || entry;
  });
}

async function fetchMediaBatch(mediaIds) {
  const query = buildBatchQuery(mediaIds);
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "manhwa-fanfav-rankings-refresh",
    },
    body: JSON.stringify({ query }),
  });

  const payload = await response.json();

  if (response.status === 429) {
    const resetAt = response.headers.get("x-ratelimit-reset");
    const waitSeconds = resetAt ? Math.max(Number(resetAt) - Math.floor(Date.now() / 1000), 10) : 30;
    console.log(`AniList rate limit hit. Waiting ${waitSeconds}s before retrying...`);
    await wait(waitSeconds * 1000);
    return fetchMediaBatch(mediaIds);
  }

  if (!response.ok) {
    throw new Error(`AniList batch request failed with status ${response.status}`);
  }

  if (payload.errors?.length && !payload.data) {
    throw new Error(payload.errors[0].message || "AniList returned an error while refreshing data.");
  }

  const result = new Map();
  for (const key of Object.keys(payload.data || {})) {
    const media = payload.data[key];
    if (media?.id) {
      result.set(Number(media.id), media);
    }
  }

  return result;
}

function buildBatchQuery(mediaIds) {
  const fields = `
    id
    siteUrl
    title {
      userPreferred
    }
    popularity
    favourites
    meanScore
    status
    startDate {
      year
    }
  `;

  const selections = mediaIds
    .map((mediaId, index) => `item${index}: Media(id: ${mediaId}, type: MANGA) { ${fields} }`)
    .join("\n");

  return `query WeeklySnapshotBatch {\n${selections}\n}`;
}

function toSnapshotEntry(media, fallbackEntry) {
  const popularity = Number(media.popularity || fallbackEntry.popularity || 0);
  const favourites = Number(media.favourites || fallbackEntry.favourites || 0);

  return {
    title: media.title?.userPreferred || fallbackEntry.title,
    fanFav: calculateFanFav(favourites, popularity),
    meanScore: Number(media.meanScore || fallbackEntry.meanScore || 0),
    status: media.status || fallbackEntry.status,
    startYear: Number(media.startDate?.year || fallbackEntry.startYear || 0),
    popularity,
    favourites,
    aniListUrl: media.siteUrl || fallbackEntry.aniListUrl,
    mediaId: fallbackEntry.mediaId,
    bucketKey: resolveBucket(popularity) || fallbackEntry.bucketKey,
  };
}

function bucketEntries(entries) {
  const buckets = new Map(BUCKETS.map((bucket) => [bucket.key, []]));

  for (const entry of entries) {
    const bucketKey = resolveBucket(entry.popularity) || entry.bucketKey || "50to200";
    buckets.get(bucketKey).push(entry);
  }

  for (const bucket of BUCKETS) {
    buckets.set(bucket.key, sortEntries(buckets.get(bucket.key)));
  }

  return buckets;
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    return (
      compareDescending(left.fanFav, right.fanFav) ||
      compareDescending(left.meanScore, right.meanScore) ||
      compareDescending(left.favourites, right.favourites) ||
      compareDescending(left.popularity, right.popularity) ||
      left.title.localeCompare(right.title)
    );
  });
}

function compareDescending(left, right) {
  return (right || 0) - (left || 0);
}

function resolveBucket(popularity) {
  if (popularity >= 5000) return "5000plus";
  if (popularity >= 1000) return "1000to5000";
  if (popularity >= 500) return "500to1000";
  if (popularity >= 200) return "200to500";
  if (popularity >= 50) return "50to200";
  return null;
}

async function writeBucketsAndMetadata(bucketMap, sourceLabel) {
  const totalEntries = BUCKETS.reduce((sum, bucket) => sum + (bucketMap.get(bucket.key)?.length || 0), 0);
  const lastUpdated = new Date().toISOString();

  for (const bucket of BUCKETS) {
    const entries = (bucketMap.get(bucket.key) || []).map(toSerializableEntry);
    const filePath = path.join(DATA_DIR, bucket.filename);
    await fs.writeFile(filePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  }

  const metadata = {
    lastUpdated,
    defaultBucket: "5000plus",
    source: sourceLabel,
    totalEntries,
    bucketOrder: BUCKETS.map((bucket) => bucket.key),
    buckets: Object.fromEntries(
      BUCKETS.map((bucket) => [
        bucket.key,
        {
          label: bucket.label,
          count: bucketMap.get(bucket.key)?.length || 0,
        },
      ])
    ),
  };

  await fs.writeFile(path.join(DATA_DIR, "snapshot-meta.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function toSerializableEntry(entry) {
  return {
    Title: entry.title,
    "FAN FAV": Number(entry.fanFav.toFixed(2)),
    "Mean Score": entry.meanScore || 0,
    Status: entry.status,
    "Start Year": entry.startYear || 0,
    Popularity: entry.popularity || 0,
    Favourites: entry.favourites || 0,
    "AniList URL": entry.aniListUrl,
  };
}

function canonicalizeExistingEntry(rawEntry, bucketKey) {
  const aniListUrl = rawEntry["AniList URL"] || "";
  const mediaId = parseMediaId(aniListUrl);

  return {
    title: String(rawEntry.Title || "Untitled").trim(),
    fanFav: Number(rawEntry["FAN FAV"] || 0),
    meanScore: Number(rawEntry["Mean Score"] || 0),
    status: String(rawEntry.Status || "UNKNOWN"),
    startYear: Number(rawEntry["Start Year"] || 0),
    popularity: Number(rawEntry.Popularity || 0),
    favourites: Number(rawEntry.Favourites || 0),
    aniListUrl,
    mediaId,
    bucketKey,
  };
}

function parseMediaId(url) {
  const match = String(url).match(/\/manga\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

function calculateFanFav(favourites, popularity) {
  if (!popularity) {
    return 0;
  }
  return Number(((favourites / popularity) * 100).toFixed(2));
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function wait(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

