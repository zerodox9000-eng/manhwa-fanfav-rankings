const BUCKETS = [
  {
    key: "5000plus",
    label: "5000+",
    subtitle: "Major titles with broad reach. This is the default board.",
    file: "5000plus.json",
  },
  {
    key: "1000to5000",
    label: "1000 - 5000",
    subtitle: "Established reads with strong momentum, still separated from the biggest giants.",
    file: "1000to5000.json",
  },
  {
    key: "500to1000",
    label: "500 - 1000",
    subtitle: "Mid-popularity titles that can overperform without being buried by mega hits.",
    file: "500to1000.json",
  },
  {
    key: "200to500",
    label: "200 - 500",
    subtitle: "Smaller boards where reader loyalty stands out faster.",
    file: "200to500.json",
  },
  {
    key: "50to200",
    label: "50 - 200",
    subtitle: "Low-popularity discoveries with their own fair ranking space.",
    file: "50to200.json",
  },
];

const STATUS_LABELS = {
  ALL: "All",
  RELEASING: "Releasing",
  FINISHED: "Finished",
  CANCELLED: "Cancelled",
};

const DETAIL_CACHE_PREFIX = "manhwa-fanfav-detail-v1:";
const DETAIL_CACHE_TTL = 1000 * 60 * 60 * 24 * 7;

const state = {
  activeBucket: "5000plus",
  search: "",
  status: "ALL",
  meta: null,
  bucketData: new Map(),
  visibleEntries: [],
  selectedEntryId: null,
  detailMemoryCache: new Map(),
  detailAbortController: null,
};

const elements = {
  bucketTabs: document.getElementById("bucket-tabs"),
  searchInput: document.getElementById("search-input"),
  searchClear: document.getElementById("search-clear"),
  statusFilters: document.getElementById("status-filters"),
  rankingList: document.getElementById("ranking-list"),
  emptyState: document.getElementById("empty-state"),
  snapshotUpdated: document.getElementById("snapshot-updated"),
  activeBucketLabel: document.getElementById("active-bucket-label"),
  bucketSubtitle: document.getElementById("bucket-subtitle"),
  resultCount: document.getElementById("result-count"),
  detailSheet: document.getElementById("detail-sheet"),
  detailBody: document.getElementById("detail-body"),
  detailClose: document.getElementById("detail-close"),
  sheetBackdrop: document.getElementById("sheet-backdrop"),
  rankingCardTemplate: document.getElementById("ranking-card-template"),
};

document.addEventListener("DOMContentLoaded", () => {
  void init();
});

async function init() {
  renderBucketTabs();
  bindEvents();
  await loadSnapshotMeta();
  await setActiveBucket(state.activeBucket);
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    applyFiltersAndRender();
  });

  elements.searchClear.addEventListener("click", () => {
    elements.searchInput.value = "";
    state.search = "";
    applyFiltersAndRender();
  });

  elements.detailClose.addEventListener("click", closeDetailSheet);
  elements.sheetBackdrop.addEventListener("click", closeDetailSheet);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDetailSheet();
    }
  });
}

async function loadSnapshotMeta() {
  try {
    const response = await fetch("./data/snapshot-meta.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Snapshot metadata missing (${response.status})`);
    }
    state.meta = await response.json();
    if (state.meta?.defaultBucket) {
      state.activeBucket = state.meta.defaultBucket;
    }
  } catch (error) {
    state.meta = null;
  }

  updateSnapshotText();
  renderBucketTabs();
}

function updateSnapshotText() {
  if (!state.meta?.lastUpdated) {
    elements.snapshotUpdated.textContent = "Static snapshot";
    return;
  }

  const formatted = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(state.meta.lastUpdated));

  elements.snapshotUpdated.textContent = formatted;
}

async function setActiveBucket(bucketKey) {
  state.activeBucket = bucketKey;
  state.status = "ALL";
  state.search = "";
  elements.searchInput.value = "";

  renderBucketTabs();

  if (!state.bucketData.has(bucketKey)) {
    elements.rankingList.innerHTML = renderLoadingCards();
    await loadBucketData(bucketKey);
  }

  updateBucketSummary();
  applyFiltersAndRender();
}

async function loadBucketData(bucketKey) {
  const bucket = getBucketConfig(bucketKey);
  if (!bucket) {
    return;
  }

  const response = await fetch(`./data/${bucket.file}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load ${bucket.file}`);
  }

  const rawEntries = await response.json();
  const normalizedEntries = rawEntries
    .map((entry) => normalizeEntry(entry, bucketKey))
    .filter(Boolean)
    .sort(compareEntries)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

  state.bucketData.set(bucketKey, normalizedEntries);
}

function normalizeEntry(rawEntry, bucketKey) {
  const aniListUrl = rawEntry["AniList URL"] || "";
  const mediaId = parseAniListId(aniListUrl);

  return {
    id: aniListUrl || `${bucketKey}:${rawEntry.Title}`,
    mediaId,
    bucketKey,
    title: String(rawEntry.Title || "Untitled").trim(),
    fanFav: Number(rawEntry["FAN FAV"] || 0),
    meanScore: numberOrNull(rawEntry["Mean Score"]),
    status: String(rawEntry.Status || "UNKNOWN"),
    startYear: numberOrNull(rawEntry["Start Year"]),
    popularity: Number(rawEntry.Popularity || 0),
    favourites: Number(rawEntry.Favourites || 0),
    aniListUrl,
  };
}

function compareEntries(left, right) {
  return (
    compareDescending(left.fanFav, right.fanFav) ||
    compareDescending(left.meanScore ?? -1, right.meanScore ?? -1) ||
    compareDescending(left.favourites, right.favourites) ||
    compareDescending(left.popularity, right.popularity) ||
    left.title.localeCompare(right.title)
  );
}

function compareDescending(left, right) {
  return right - left;
}

function applyFiltersAndRender() {
  const entries = state.bucketData.get(state.activeBucket) || [];
  const visibleEntries = entries.filter((entry) => {
    const matchesSearch = !state.search || entry.title.toLowerCase().includes(state.search);
    const matchesStatus = state.status === "ALL" || entry.status === state.status;
    return matchesSearch && matchesStatus;
  });

  state.visibleEntries = visibleEntries;
  renderStatusFilters(entries);
  renderRankingList();
  updateBucketSummary();
}

function renderBucketTabs() {
  elements.bucketTabs.innerHTML = "";

  for (const bucket of BUCKETS) {
    const bucketKey = bucket.key;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bucket-tab${state.activeBucket === bucketKey ? " is-active" : ""}`;
    button.innerHTML = `
      <span class="bucket-tab__label">${bucket.label}</span>
      <span class="bucket-tab__count">${formatBucketCount(bucketKey)}</span>
    `;
    button.addEventListener("click", () => {
      if (state.activeBucket !== bucketKey) {
        void setActiveBucket(bucketKey);
      }
    });
    elements.bucketTabs.appendChild(button);
  }
}

function renderStatusFilters(entries) {
  const counts = entries.reduce(
    (accumulator, entry) => {
      accumulator.ALL += 1;
      accumulator[entry.status] = (accumulator[entry.status] || 0) + 1;
      return accumulator;
    },
    { ALL: 0 }
  );

  const orderedKeys = ["ALL", "RELEASING", "FINISHED", "CANCELLED"].filter((statusKey) => counts[statusKey]);

  elements.statusFilters.innerHTML = "";

  for (const statusKey of orderedKeys) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `status-chip${state.status === statusKey ? " is-active" : ""}`;
    button.textContent = `${STATUS_LABELS[statusKey]} · ${counts[statusKey]}`;
    button.addEventListener("click", () => {
      state.status = statusKey;
      applyFiltersAndRender();
    });
    elements.statusFilters.appendChild(button);
  }
}

function renderRankingList() {
  const fragment = document.createDocumentFragment();
  const template = elements.rankingCardTemplate.content;

  if (!state.visibleEntries.length) {
    elements.rankingList.innerHTML = "";
    elements.emptyState.classList.remove("hidden");
    return;
  }

  elements.emptyState.classList.add("hidden");
  elements.rankingList.innerHTML = "";

  for (const entry of state.visibleEntries) {
    const node = template.cloneNode(true);
    const button = node.querySelector(".ranking-card");
    const rank = node.querySelector(".ranking-card__rank");
    const title = node.querySelector(".ranking-card__title");
    const statValues = node.querySelectorAll(".stat-pill strong");
    const fanFav = statValues[0];
    const meanScore = statValues[1];

    rank.textContent = `#${entry.rank}`;
    title.textContent = entry.title;
    fanFav.textContent = formatPercent(entry.fanFav);
    meanScore.textContent = entry.meanScore ? String(entry.meanScore) : "-";

    button.addEventListener("click", () => {
      void openDetailSheet(entry);
    });

    fragment.appendChild(node);
  }

  elements.rankingList.appendChild(fragment);
}

async function openDetailSheet(entry) {
  state.selectedEntryId = entry.id;

  if (state.detailAbortController) {
    state.detailAbortController.abort();
  }

  elements.sheetBackdrop.classList.remove("hidden");
  elements.detailSheet.classList.add("is-open");
  elements.detailSheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("sheet-open");

  renderDetail(entry, {
    detail: getCachedDetail(entry.mediaId),
    loading: !getCachedDetail(entry.mediaId),
  });

  if (!entry.mediaId || getCachedDetail(entry.mediaId)) {
    return;
  }

  const abortController = new AbortController();
  state.detailAbortController = abortController;

  try {
    const detail = await fetchAniListDetail(entry.mediaId, abortController.signal);
    cacheDetail(entry.mediaId, detail);
    state.detailAbortController = null;

    if (state.selectedEntryId === entry.id) {
      renderDetail(entry, { detail, loading: false });
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      return;
    }

    if (state.selectedEntryId === entry.id) {
      renderDetail(entry, {
        detail: null,
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load live AniList details.",
      });
    }
  } finally {
    if (state.detailAbortController === abortController) {
      state.detailAbortController = null;
    }
  }
}

function closeDetailSheet() {
  if (state.detailAbortController) {
    state.detailAbortController.abort();
    state.detailAbortController = null;
  }

  state.selectedEntryId = null;
  elements.sheetBackdrop.classList.add("hidden");
  elements.detailSheet.classList.remove("is-open");
  elements.detailSheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("sheet-open");
}

function renderDetail(entry, options = {}) {
  const detail = options.detail || null;
  const liveTitle = detail?.title || entry.title;
  const liveStatus = detail?.status || entry.status;
  const liveStartYear = detail?.startYear || entry.startYear;
  const livePopularity = detail?.popularity || entry.popularity;
  const liveFavourites = detail?.favourites || entry.favourites;
  const synopsis = detail?.description
    ? formatSynopsis(detail.description)
    : options.loading
      ? "<p>Loading synopsis from AniList...</p>"
      : "<p>No live synopsis is available for this entry right now.</p>";
  const genres = detail?.genres || [];
  const tags = detail?.tags || [];
  const externalUrl = detail?.siteUrl || entry.aniListUrl;
  const liveNote = options.error
    ? escapeHtml(options.error)
    : detail
      ? "Live detail pulled from AniList and cached in this browser."
      : "Opening the detail card triggers a live AniList lookup.";
  const coverMarkup = detail?.coverImage
    ? `<img src="${escapeAttribute(detail.coverImage)}" alt="${escapeAttribute(liveTitle)} cover" loading="lazy" />`
    : `<div class="detail-cover__placeholder"><span>Cover loads here</span></div>`;

  elements.detailBody.innerHTML = `
    <section class="detail-hero">
      <div class="detail-cover">${coverMarkup}</div>
      <div>
        <div class="detail-title">
          <p class="detail-title__kicker">${escapeHtml(formatBucketLabel(entry.bucketKey))} bucket</p>
          <h3>${escapeHtml(liveTitle)}</h3>
          <p class="detail-live-note">${liveNote}</p>
        </div>

        <div class="detail-stats">
          <div class="stat-pill stat-pill--fan">
            <span>Fan Fav</span>
            <strong>${formatPercent(entry.fanFav)}</strong>
          </div>
          <div class="stat-pill">
            <span>Mean Score</span>
            <strong>${entry.meanScore ? escapeHtml(String(entry.meanScore)) : "-"}</strong>
          </div>
        </div>

        <div class="detail-block">
          <h4>Snapshot + live facts</h4>
          <dl class="detail-meta">
            <div>
              <dt>Status</dt>
              <dd>${escapeHtml(liveStatus || "Unknown")}</dd>
            </div>
            <div>
              <dt>Start year</dt>
              <dd>${liveStartYear ? escapeHtml(String(liveStartYear)) : "-"}</dd>
            </div>
            <div>
              <dt>Popularity</dt>
              <dd>${formatInteger(livePopularity)}</dd>
            </div>
            <div>
              <dt>Favourites</dt>
              <dd>${formatInteger(liveFavourites)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <section class="detail-block">
      <h4>Synopsis</h4>
      <div class="detail-synopsis">${synopsis}</div>
    </section>

    <section class="detail-block">
      <h4>Genres</h4>
      ${
        genres.length
          ? `<div class="tag-cloud">${genres.map((genre) => `<span class="tag-chip">${escapeHtml(genre)}</span>`).join("")}</div>`
          : `<p class="detail-empty">Genres will appear here when AniList returns them.</p>`
      }
    </section>

    <section class="detail-block">
      <h4>Tags</h4>
      ${
        tags.length
          ? `<div class="tag-cloud">${tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}</div>`
          : `<p class="detail-empty">Clean, non-spoiler tags are shown when AniList provides them.</p>`
      }
    </section>

    <div class="detail-actions">
      <a class="detail-link" href="${escapeAttribute(externalUrl)}" target="_blank" rel="noreferrer">Open AniList</a>
      <button class="detail-link detail-link--ghost" type="button" id="close-detail-inline">Back to list</button>
    </div>
  `;

  const inlineClose = document.getElementById("close-detail-inline");
  inlineClose?.addEventListener("click", closeDetailSheet);
}

async function fetchAniListDetail(mediaId, signal) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id
        siteUrl
        title {
          userPreferred
          romaji
          english
          native
        }
        description
        coverImage {
          extraLarge
          large
          medium
          color
        }
        genres
        tags {
          name
          rank
          isMediaSpoiler
        }
        status
        popularity
        favourites
        meanScore
        averageScore
        startDate {
          year
        }
      }
    }
  `;

  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query,
      variables: { id: mediaId },
    }),
    signal,
  });

  const payload = await response.json();

  if (!response.ok || payload.errors?.length) {
    const message = payload.errors?.[0]?.message || `AniList request failed (${response.status})`;
    throw new Error(message);
  }

  return normalizeAniListDetail(payload.data?.Media);
}

function normalizeAniListDetail(media) {
  if (!media) {
    throw new Error("AniList did not return media details for this entry.");
  }

  const tags = (media.tags || [])
    .filter((tag) => !tag.isMediaSpoiler)
    .sort((left, right) => (right.rank || 0) - (left.rank || 0))
    .slice(0, 8)
    .map((tag) => tag.name);

  return {
    title:
      media.title?.userPreferred ||
      media.title?.english ||
      media.title?.romaji ||
      media.title?.native ||
      "Untitled",
    description: stripHtml(media.description || ""),
    coverImage: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || "",
    genres: media.genres || [],
    tags,
    status: media.status || "",
    popularity: Number(media.popularity || 0),
    favourites: Number(media.favourites || 0),
    meanScore: numberOrNull(media.meanScore),
    averageScore: numberOrNull(media.averageScore),
    startYear: numberOrNull(media.startDate?.year),
    siteUrl: media.siteUrl || "",
  };
}

function getCachedDetail(mediaId) {
  if (!mediaId) {
    return null;
  }

  if (state.detailMemoryCache.has(mediaId)) {
    return state.detailMemoryCache.get(mediaId);
  }

  try {
    const rawValue = localStorage.getItem(`${DETAIL_CACHE_PREFIX}${mediaId}`);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DETAIL_CACHE_TTL) {
      localStorage.removeItem(`${DETAIL_CACHE_PREFIX}${mediaId}`);
      return null;
    }

    state.detailMemoryCache.set(mediaId, parsed.detail);
    return parsed.detail;
  } catch (error) {
    return null;
  }
}

function cacheDetail(mediaId, detail) {
  if (!mediaId || !detail) {
    return;
  }

  state.detailMemoryCache.set(mediaId, detail);

  try {
    localStorage.setItem(
      `${DETAIL_CACHE_PREFIX}${mediaId}`,
      JSON.stringify({
        savedAt: Date.now(),
        detail,
      })
    );
  } catch (error) {
    // Ignore storage failures. The in-memory cache still helps within the session.
  }
}

function updateBucketSummary() {
  const bucket = getBucketConfig(state.activeBucket);
  const totalEntries = state.bucketData.get(state.activeBucket)?.length || state.meta?.buckets?.[state.activeBucket]?.count || 0;
  const visibleCount = state.visibleEntries.length || (state.bucketData.has(state.activeBucket) ? 0 : totalEntries);

  elements.activeBucketLabel.textContent = bucket?.label || state.activeBucket;
  elements.bucketSubtitle.textContent = bucket?.subtitle || "A separate leaderboard for fair comparison.";
  elements.resultCount.textContent = formatInteger(visibleCount);
  elements.searchInput.placeholder = `Search titles in ${bucket?.label || state.activeBucket}`;
}

function renderLoadingCards() {
  return Array.from({ length: 6 })
    .map(
      (_, index) => `
        <div class="ranking-card" aria-hidden="true">
          <div class="ranking-card__rank">#${index + 1}</div>
          <div class="ranking-card__main">
            <h3 class="ranking-card__title">Loading titles...</h3>
            <p class="ranking-card__hint">Pulling the selected bucket into view.</p>
          </div>
          <div class="ranking-card__stats">
            <div class="stat-pill stat-pill--fan"><span>Fan Fav</span><strong>-</strong></div>
            <div class="stat-pill"><span>Mean Score</span><strong>-</strong></div>
          </div>
        </div>
      `
    )
    .join("");
}

function formatBucketCount(bucketKey) {
  const count = state.meta?.buckets?.[bucketKey]?.count ?? state.bucketData.get(bucketKey)?.length;
  return count ? `${formatInteger(count)} titles` : "Loading titles";
}

function getBucketConfig(bucketKey) {
  return BUCKETS.find((bucket) => bucket.key === bucketKey);
}

function formatBucketLabel(bucketKey) {
  return getBucketConfig(bucketKey)?.label || bucketKey;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatInteger(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseAniListId(url) {
  if (!url) {
    return null;
  }

  const match = url.match(/\/manga\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

function stripHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function formatSynopsis(value) {
  const safeText = escapeHtml(value || "No synopsis available.");
  return safeText
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
