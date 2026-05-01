const DATA_FILES = [
  ["5000plus", "./data/5000plus.json"],
  ["1000to5000", "./data/1000to5000.json"],
  ["500to1000", "./data/500to1000.json"],
  ["200to500", "./data/200to500.json"],
  ["50to200", "./data/50to200.json"],
];

const STORAGE_KEY = "peakhwa-discovery-state-v1";
const SAVED_KEY = "peakhwa-saved-media-v1";
const DETAIL_CACHE_PREFIX = "peakhwa-detail-v2:";
const DETAIL_CACHE_TTL = 1000 * 60 * 60 * 24 * 7;
const PAGE_SIZE = 64;

const THEMES = [
  { key: "noir", label: "Noir" },
  { key: "aurora", label: "Aurora" },
  { key: "light", label: "Light" },
];

const PAGES = {
  discovery: "Discovery",
  top: "Top Lists",
  new: "New",
  saved: "Saved",
};

const DISCOVERY_TABS = [
  { key: "relevant", label: "Most Relevant" },
  { key: "newly", label: "Newly Added" },
  { key: "fresh", label: "Fresh Releases" },
  { key: "hot", label: "Hot" },
  { key: "fanRising", label: "Fan Fav Rising" },
  { key: "hidden", label: "Hidden Gems" },
  { key: "mainstream", label: "Mainstream" },
  { key: "legacy", label: "Legacy Picks" },
];

const TIME_WINDOWS = [
  { key: "1d", label: "1 Day", days: 1 },
  { key: "3d", label: "3 Days", days: 3 },
  { key: "7d", label: "7 Days", days: 7 },
  { key: "14d", label: "14 Days", days: 14 },
  { key: "30d", label: "30 Days", days: 30 },
  { key: "90d", label: "90 Days", days: 90 },
  { key: "180d", label: "180 Days", days: 180 },
  { key: "365d", label: "1 Year", days: 365 },
  { key: "all", label: "All Time", days: Infinity },
];

const AGE_FILTERS = [
  { key: "all", label: "All Ages" },
  { key: "7d", label: "Last 7 Days", days: 7 },
  { key: "30d", label: "Last 30 Days", days: 30 },
  { key: "90d", label: "Last 90 Days", days: 90 },
  { key: "year", label: "This Year" },
  { key: "1to3", label: "1-3 Years" },
  { key: "3to10", label: "3-10 Years" },
  { key: "10plus", label: "10+ Years" },
];

const LANES = [
  { key: "all", label: "All Lanes", min: 0, max: Infinity },
  { key: "mainstream", label: "Mainstream", min: 5000, max: Infinity },
  { key: "established", label: "Established", min: 1000, max: 4999 },
  { key: "rising", label: "Rising", min: 300, max: 999 },
  { key: "underground", label: "Underground", min: 100, max: 299 },
  { key: "tooEarly", label: "Too Early", min: 0, max: 99 },
];

const SORTS = [
  { key: "smart", label: "Smart Rank" },
  { key: "fanFav", label: "Fan Fav" },
  { key: "meanScore", label: "Mean Score" },
  { key: "popularity", label: "Popularity" },
  { key: "growth", label: "Growth" },
  { key: "newest", label: "Newest" },
];

const STATUS_LABELS = {
  ALL: "All",
  RELEASING: "Releasing",
  FINISHED: "Finished",
  HIATUS: "Hiatus",
  CANCELLED: "Cancelled",
  NOT_YET_RELEASED: "Not Yet",
  UNKNOWN: "Unknown",
};

const TIER_ORDER = [
  "Peak",
  "Almost Peak",
  "Hidden Gem+",
  "Hidden Gem",
  "Great",
  "Good",
  "Decent",
  "Fair",
  "Meh",
];

const DEFAULT_UI = {
  page: "discovery",
  discoveryTab: "relevant",
  timeWindow: "7d",
  theme: "noir",
  search: "",
  releaseAge: "all",
  lane: "all",
  status: "ALL",
  sort: "smart",
  popMin: 100,
  popMax: "",
  scoreMin: "",
  scoreMax: "",
  fanMin: "",
  fanMax: "",
  favouritesMin: "",
  favouritesMax: "",
  includeGenres: [],
  rejectGenres: [],
  includeTags: [],
  rejectTags: [],
  showTooEarly: false,
};

const state = {
  ui: loadUiState(),
  entries: [],
  meta: null,
  visibleEntries: [],
  renderEntries: [],
  renderLimit: PAGE_SIZE,
  savedIds: new Set(loadSavedIds()),
  detailMemoryCache: new Map(),
  detailAbortController: null,
  filterIndexes: {
    genres: [],
    tags: [],
  },
};

const elements = {
  appShell: document.getElementById("app-shell"),
  themeButton: document.getElementById("theme-button"),
  searchInput: document.getElementById("search-input"),
  discoveryTabs: document.getElementById("discovery-tabs"),
  timeTabs: document.getElementById("time-tabs"),
  statusStrip: document.getElementById("status-strip"),
  pageLabel: document.getElementById("page-label"),
  resultCount: document.getElementById("result-count"),
  snapshotUpdated: document.getElementById("snapshot-updated"),
  quickRow: document.getElementById("quick-row"),
  feed: document.getElementById("feed"),
  loadMore: document.getElementById("load-more"),
  navItems: document.querySelectorAll(".nav-item"),
  sheetBackdrop: document.getElementById("sheet-backdrop"),
  detailSheet: document.getElementById("detail-sheet"),
  detailBody: document.getElementById("detail-body"),
  detailClose: document.getElementById("detail-close"),
  filterSheet: document.getElementById("filter-sheet"),
  filterBody: document.getElementById("filter-body"),
  filterClose: document.getElementById("filter-close"),
  cardTemplate: document.getElementById("card-template"),
};

init();

async function init() {
  applyTheme();
  bindEvents();
  renderChrome();
  renderLoadingState();

  try {
    const { entries, meta } = await loadCatalog();
    state.entries = entries.map(normalizeEntry).filter((entry) => entry.mediaId || entry.aniListUrl);
    state.meta = meta;
    state.filterIndexes = buildFilterIndexes(state.entries, meta);
    renderChrome();
    applyFiltersAndRender();
  } catch (error) {
    renderEmptyState(`Unable to load the catalog. ${error instanceof Error ? error.message : ""}`);
  }
}

function bindEvents() {
  elements.themeButton.addEventListener("click", () => {
    const currentIndex = THEMES.findIndex((theme) => theme.key === state.ui.theme);
    state.ui.theme = THEMES[(currentIndex + 1) % THEMES.length].key;
    persistUi();
    applyTheme();
  });

  elements.searchInput.value = state.ui.search || "";
  elements.searchInput.addEventListener("input", () => {
    state.ui.search = elements.searchInput.value.trim();
    state.renderLimit = PAGE_SIZE;
    persistUi();
    applyFiltersAndRender();
  });

  elements.loadMore.addEventListener("click", () => {
    state.renderLimit += PAGE_SIZE;
    renderFeed();
  });

  for (const item of elements.navItems) {
    item.addEventListener("click", () => {
      const action = item.dataset.action;
      if (action === "filters") {
        openFilterSheet();
        return;
      }

      state.ui.page = item.dataset.page || "discovery";
      state.renderLimit = PAGE_SIZE;
      persistUi();
      renderChrome();
      applyFiltersAndRender();
    });
  }

  elements.sheetBackdrop.addEventListener("click", closeSheets);
  elements.detailClose.addEventListener("click", closeSheets);
  elements.filterClose.addEventListener("click", closeSheets);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSheets();
    }
  });
}

async function loadCatalog() {
  const catalogResponse = await fetch("./data/catalog.json", { cache: "no-store" });
  if (catalogResponse.ok) {
    const catalog = await catalogResponse.json();
    return {
      entries: Array.isArray(catalog.entries) ? catalog.entries : [],
      meta: catalog.meta || null,
    };
  }

  const [bucketResponses, metaResponse] = await Promise.all([
    Promise.all(
      DATA_FILES.map(async ([bucketKey, url]) => {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return [];
        const entries = await response.json();
        return entries.map((entry) => ({ ...entry, bucketKey }));
      })
    ),
    fetch("./data/snapshot-meta.json", { cache: "no-store" }).catch(() => null),
  ]);

  const meta = metaResponse?.ok ? await metaResponse.json() : null;
  return {
    entries: bucketResponses.flat(),
    meta,
  };
}

function normalizeEntry(rawEntry) {
  const aniListUrl = rawEntry.aniListUrl || rawEntry["AniList URL"] || rawEntry.url || "";
  const mediaId = Number(rawEntry.mediaId || rawEntry.id || parseAniListId(aniListUrl) || 0);
  const rawTitle = rawEntry.displayTitle || rawEntry.title || rawEntry.Title || "";
  const synonyms = normalizeStringArray(rawEntry.synonyms);
  const romajiTitle = rawEntry.romajiTitle || rawEntry.romaji || "";
  const englishTitle = rawEntry.englishTitle || "";
  const displayTitle = chooseDisplayTitle({
    english: englishTitle,
    synonyms,
    snapshotTitle: rawTitle,
    romaji: romajiTitle,
    userPreferred: rawEntry.userPreferredTitle || rawEntry.userPreferred || "",
    native: rawEntry.nativeTitle || "",
  });
  const popularity = Number(rawEntry.popularity ?? rawEntry.Popularity ?? 0);
  const favourites = Number(rawEntry.favourites ?? rawEntry.Favourites ?? 0);
  const fanFav = Number(rawEntry.fanFav ?? rawEntry["FAN FAV"] ?? calculateFanFav(favourites, popularity));
  const startDate = normalizeStartDate(rawEntry.startDate, rawEntry["Start Year"] || rawEntry.startYear);
  const startYear = Number(rawEntry.startYear || rawEntry["Start Year"] || startDate?.year || 0);
  const meanScore = numberOrNull(rawEntry.meanScore ?? rawEntry["Mean Score"]);
  const growth = rawEntry.growth && typeof rawEntry.growth === "object" ? rawEntry.growth : {};
  const firstSeen = rawEntry.firstSeen || "";

  return {
    id: String(mediaId || aniListUrl || displayTitle),
    mediaId,
    aniListUrl,
    displayTitle,
    title: displayTitle,
    romajiTitle,
    englishTitle,
    nativeTitle: rawEntry.nativeTitle || "",
    synonyms,
    coverImage: rawEntry.coverImage || rawEntry.coverImageLarge || rawEntry.cover || "",
    coverImageSmall: rawEntry.coverImageSmall || rawEntry.coverImageMedium || rawEntry.coverImage || "",
    bannerImage: rawEntry.bannerImage || "",
    genres: normalizeStringArray(rawEntry.genres),
    tags: normalizeStringArray(rawEntry.tags),
    fanFav,
    meanScore,
    averageScore: numberOrNull(rawEntry.averageScore),
    status: String(rawEntry.status || rawEntry.Status || "UNKNOWN"),
    startDate,
    startYear,
    popularity,
    favourites,
    chapters: numberOrNull(rawEntry.chapters),
    volumes: numberOrNull(rawEntry.volumes),
    firstSeen,
    lastUpdated: rawEntry.lastUpdated || state.meta?.lastUpdated || "",
    growth,
    lane: getLane(popularity).key,
  };
}

function renderChrome() {
  elements.discoveryTabs.innerHTML = "";
  for (const tab of DISCOVERY_TABS) {
    const button = makeChip(tab.label, state.ui.discoveryTab === tab.key);
    button.addEventListener("click", () => {
      state.ui.discoveryTab = tab.key;
      state.ui.page = tab.key === "newly" || tab.key === "fresh" ? "new" : "discovery";
      state.renderLimit = PAGE_SIZE;
      persistUi();
      renderChrome();
      applyFiltersAndRender();
    });
    elements.discoveryTabs.appendChild(button);
  }

  elements.timeTabs.innerHTML = "";
  for (const windowOption of TIME_WINDOWS) {
    const button = makeChip(windowOption.label, state.ui.timeWindow === windowOption.key);
    button.addEventListener("click", () => {
      state.ui.timeWindow = windowOption.key;
      state.renderLimit = PAGE_SIZE;
      persistUi();
      renderChrome();
      applyFiltersAndRender();
    });
    elements.timeTabs.appendChild(button);
  }

  for (const item of elements.navItems) {
    const page = item.dataset.page;
    item.classList.toggle("is-active", Boolean(page && page === state.ui.page));
  }

  const theme = THEMES.find((item) => item.key === state.ui.theme) || THEMES[0];
  elements.themeButton.textContent = theme.label;
  elements.pageLabel.textContent = PAGES[state.ui.page] || "Discovery";
  elements.snapshotUpdated.textContent = formatSnapshotDate(state.meta?.lastUpdated);
  renderQuickRow();
}

function renderQuickRow() {
  const chips = [
    getActiveDiscoveryTab().label,
    getActiveTimeWindow().label,
    getLane(Number(state.ui.popMin || 0)).label,
  ];

  if (state.ui.releaseAge !== "all") {
    chips.push(getReleaseAgeOption().label);
  }
  if (state.ui.status !== "ALL") {
    chips.push(STATUS_LABELS[state.ui.status] || state.ui.status);
  }
  if (state.ui.includeGenres.length) {
    chips.push(`Genres +${state.ui.includeGenres.length}`);
  }
  if (state.ui.includeTags.length) {
    chips.push(`Tags +${state.ui.includeTags.length}`);
  }
  if (state.ui.rejectGenres.length || state.ui.rejectTags.length) {
    chips.push("Reject rules on");
  }

  elements.quickRow.innerHTML = chips.map((chip) => `<span class="quick-chip">${escapeHtml(chip)}</span>`).join("");
}

function applyFiltersAndRender() {
  const filtered = state.entries.filter(matchesFilters);
  let entries = filtered;

  if (state.ui.page === "saved") {
    entries = entries.filter((entry) => state.savedIds.has(String(entry.mediaId)));
  } else if (state.ui.page === "new") {
    entries = entries.filter((entry) => isNewlyAdded(entry) || isFreshRelease(entry));
  } else if (state.ui.page !== "top") {
    entries = entries.filter(matchesDiscoveryTab);
  }

  state.visibleEntries = sortEntries(entries);
  state.renderEntries = state.visibleEntries;
  renderFeed();
}

function matchesFilters(entry) {
  const query = state.ui.search.trim().toLowerCase();
  if (query && !getSearchHaystack(entry).includes(query)) return false;

  if (state.ui.status !== "ALL" && entry.status !== state.ui.status) return false;
  if (!matchesRange(entry.popularity, state.ui.popMin, state.ui.popMax)) return false;
  if (!matchesRange(entry.meanScore ?? 0, state.ui.scoreMin, state.ui.scoreMax)) return false;
  if (!matchesRange(entry.fanFav, state.ui.fanMin, state.ui.fanMax)) return false;
  if (!matchesRange(entry.favourites, state.ui.favouritesMin, state.ui.favouritesMax)) return false;
  if (!matchesReleaseAge(entry)) return false;

  const lane = getLane(entry.popularity);
  if (state.ui.lane !== "all" && lane.key !== state.ui.lane) return false;
  if (!state.ui.showTooEarly && lane.key === "tooEarly" && state.ui.page !== "new") return false;

  if (!containsEvery(entry.genres, state.ui.includeGenres)) return false;
  if (containsAny(entry.genres, state.ui.rejectGenres)) return false;
  if (!containsEvery(entry.tags, state.ui.includeTags)) return false;
  if (containsAny(entry.tags, state.ui.rejectTags)) return false;

  return true;
}

function matchesDiscoveryTab(entry) {
  const tab = state.ui.discoveryTab;

  if (tab === "newly") return isNewlyAdded(entry);
  if (tab === "fresh") return isFreshRelease(entry);
  if (tab === "hot") return getGrowth(entry, "popularity") > 0 || eligibleForMainFeed(entry);
  if (tab === "fanRising") return getGrowth(entry, "fanFav") > 0 || entry.fanFav >= 3;
  if (tab === "hidden") return entry.popularity < 5000 && (entry.meanScore ?? 0) >= 75 && (entry.fanFav >= 3 || (entry.meanScore ?? 0) >= 80);
  if (tab === "mainstream") return entry.popularity >= 5000;
  if (tab === "legacy") return isLegacy(entry) && (entry.meanScore ?? 0) >= 72;

  return eligibleForMainFeed(entry);
}

function eligibleForMainFeed(entry) {
  if (entry.popularity < 100) return false;
  if (entry.meanScore === null) return entry.popularity >= 300;
  return entry.meanScore >= 65;
}

function sortEntries(entries) {
  const sort = state.ui.page === "top" && state.ui.sort === "smart" ? "fanFav" : state.ui.sort;
  const sorted = [...entries];

  sorted.sort((left, right) => {
    if (sort === "fanFav") return compareDesc(left.fanFav, right.fanFav) || commonTieBreak(left, right);
    if (sort === "meanScore") return compareDesc(left.meanScore ?? -1, right.meanScore ?? -1) || commonTieBreak(left, right);
    if (sort === "popularity") return compareDesc(left.popularity, right.popularity) || commonTieBreak(left, right);
    if (sort === "growth") return compareDesc(growthScore(left), growthScore(right)) || commonTieBreak(left, right);
    if (sort === "newest") return compareDesc(getDateValue(left.startDate), getDateValue(right.startDate)) || commonTieBreak(left, right);
    return compareDesc(relevanceScore(left), relevanceScore(right)) || commonTieBreak(left, right);
  });

  return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function commonTieBreak(left, right) {
  return (
    compareDesc(left.favourites, right.favourites) ||
    compareDesc(left.popularity, right.popularity) ||
    left.displayTitle.localeCompare(right.displayTitle)
  );
}

function relevanceScore(entry) {
  const popGrowth = normalizeGrowth(getGrowth(entry, "popularity"), Math.max(entry.popularity, 1));
  const favGrowth = normalizeGrowth(getGrowth(entry, "favourites"), Math.max(entry.favourites, 1));
  const fanGrowth = Math.max(getGrowth(entry, "fanFav"), 0) / 8;
  const mean = (entry.meanScore ?? 0) / 100;
  const fan = Math.min(entry.fanFav / 12, 1);
  const recency = releaseRecencyScore(entry);
  const confidencePenalty = entry.popularity < 100 ? 0.22 : entry.meanScore === null ? 0.14 : 0;

  return popGrowth * 0.28 + favGrowth * 0.18 + fanGrowth * 0.16 + mean * 0.22 + fan * 0.1 + recency * 0.06 - confidencePenalty;
}

function growthScore(entry) {
  return getGrowth(entry, "popularity") * 0.55 + getGrowth(entry, "favourites") * 2 + getGrowth(entry, "fanFav") * 30;
}

function renderFeed() {
  elements.resultCount.textContent = `${formatInteger(state.visibleEntries.length)} titles`;
  elements.feed.innerHTML = "";

  if (!state.visibleEntries.length) {
    renderEmptyState(state.ui.page === "saved" ? "No saved titles yet. Open a title and save it from the detail sheet." : "Nothing matches the current discovery setup.");
    elements.loadMore.classList.add("hidden");
    return;
  }

  if (state.ui.page === "top") {
    renderTierSections();
  } else {
    renderEntryList(state.renderEntries.slice(0, state.renderLimit));
  }

  elements.loadMore.classList.toggle("hidden", state.renderLimit >= state.renderEntries.length);
}

function renderTierSections() {
  const visible = state.renderEntries.slice(0, state.renderLimit);
  let rendered = 0;

  for (const tier of TIER_ORDER) {
    const tierEntries = visible.filter((entry) => getTier(entry) === tier);
    if (!tierEntries.length) continue;

    const title = document.createElement("h2");
    title.className = "section-title";
    title.textContent = `${tier} (${tierEntries.length})`;
    elements.feed.appendChild(title);
    renderEntryList(tierEntries);
    rendered += tierEntries.length;
  }

  if (!rendered) {
    renderEmptyState("No tier sections match this setup.");
  }
}

function renderEntryList(entries) {
  const fragment = document.createDocumentFragment();

  for (const entry of entries) {
    const node = elements.cardTemplate.content.cloneNode(true);
    const card = node.querySelector(".entry-card");
    const cover = node.querySelector(".entry-card__cover");
    const rank = node.querySelector(".rank-pill");
    const lane = node.querySelector(".lane-pill");
    const title = node.querySelector(".entry-card__title");
    const badgeRow = node.querySelector(".badge-row");
    const fan = node.querySelector(".metric-fan");
    const score = node.querySelector(".metric-score");
    const pop = node.querySelector(".metric-pop");

    cover.innerHTML = entry.coverImageSmall || entry.coverImage
      ? `<img src="${escapeAttribute(entry.coverImageSmall || entry.coverImage)}" alt="${escapeAttribute(entry.displayTitle)} cover" loading="lazy" decoding="async" width="148" height="222" />`
      : `<span>No cover</span>`;
    rank.textContent = `#${entry.rank}`;
    lane.textContent = getLane(entry.popularity).label;
    title.textContent = entry.displayTitle;
    badgeRow.innerHTML = getBadges(entry).map(renderBadge).join("");
    fan.textContent = formatPercent(entry.fanFav);
    score.textContent = entry.meanScore === null ? "-" : String(entry.meanScore);
    pop.textContent = compactNumber(entry.popularity);

    card.addEventListener("click", () => openDetailSheet(entry));
    fragment.appendChild(node);
  }

  elements.feed.appendChild(fragment);
}

function renderBadge(badge) {
  return `<span class="badge badge--${escapeAttribute(badge.key)}">${escapeHtml(badge.label)}</span>`;
}

function renderEmptyState(message) {
  elements.feed.innerHTML = `<div class="empty-state glass-panel">${escapeHtml(message)}</div>`;
}

function renderLoadingState() {
  elements.feed.innerHTML = Array.from({ length: 5 }, (_, index) => `
    <div class="entry-card glass-panel" aria-hidden="true">
      <div class="entry-card__cover"><span>${index + 1}</span></div>
      <div class="entry-card__body">
        <div class="entry-card__top"><span class="rank-pill">...</span><span class="lane-pill">Loading</span></div>
        <h3 class="entry-card__title">Building discovery feed</h3>
        <div class="badge-row"><span class="badge">Daily snapshot</span></div>
        <div class="metric-row"><div><span>Fan Fav</span><strong>-</strong></div><div><span>Mean</span><strong>-</strong></div><div><span>Pop</span><strong>-</strong></div></div>
      </div>
    </div>
  `).join("");
}

async function openDetailSheet(entry) {
  if (state.detailAbortController) {
    state.detailAbortController.abort();
  }

  elements.sheetBackdrop.classList.remove("hidden");
  elements.detailSheet.classList.add("is-open");
  elements.detailSheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("sheet-open");

  const cachedDetail = getCachedDetail(entry.mediaId);
  renderDetail(entry, cachedDetail, { loading: !cachedDetail });

  if (!entry.mediaId || cachedDetail) return;

  const abortController = new AbortController();
  state.detailAbortController = abortController;

  try {
    const detail = await fetchAniListDetail(entry.mediaId, abortController.signal);
    cacheDetail(entry.mediaId, detail);
    renderDetail(entry, detail, { loading: false });
  } catch (error) {
    if (!abortController.signal.aborted) {
      renderDetail(entry, null, { loading: false, error: error instanceof Error ? error.message : "AniList detail failed." });
    }
  } finally {
    if (state.detailAbortController === abortController) {
      state.detailAbortController = null;
    }
  }
}

function renderDetail(entry, detail, options = {}) {
  const title = detail?.displayTitle || entry.displayTitle;
  const cover = detail?.coverImage || entry.coverImage || entry.coverImageSmall;
  const synopsis = detail?.description
    ? formatSynopsis(detail.description)
    : options.loading
      ? "<p>Loading synopsis from AniList...</p>"
      : `<p>${escapeHtml(options.error || "No synopsis is available right now.")}</p>`;
  const genres = detail?.genres?.length ? detail.genres : entry.genres;
  const tags = detail?.tags?.length ? detail.tags : entry.tags;
  const livePopularity = detail?.popularity ?? entry.popularity;
  const liveFavourites = detail?.favourites ?? entry.favourites;
  const liveMean = detail?.meanScore ?? entry.meanScore;
  const saved = state.savedIds.has(String(entry.mediaId));

  elements.detailBody.innerHTML = `
    <section class="detail-hero">
      <div class="detail-cover">
        ${
          cover
            ? `<img src="${escapeAttribute(cover)}" alt="${escapeAttribute(title)} cover" decoding="async" />`
            : `<div class="empty-state">No cover available</div>`
        }
      </div>
      <div class="detail-title">
        <p class="eyebrow">${escapeHtml(getLane(livePopularity).label)} / ${escapeHtml(getTier({ ...entry, popularity: livePopularity, meanScore: liveMean }))}</p>
        <h2>${escapeHtml(title)}</h2>
        <p class="detail-subtitle">${escapeHtml(getBadges(entry).map((badge) => badge.label).join(" / ") || "AniList snapshot")}</p>
      </div>
    </section>

    <section class="detail-grid">
      ${renderDetailBox("Fan Fav", formatPercent(entry.fanFav))}
      ${renderDetailBox("Mean Score", liveMean === null ? "-" : String(liveMean))}
      ${renderDetailBox("Popularity", formatInteger(livePopularity))}
      ${renderDetailBox("Favourites", formatInteger(liveFavourites))}
      ${renderDetailBox("Status", STATUS_LABELS[detail?.status || entry.status] || entry.status)}
      ${renderDetailBox("Start", formatStartDate(detail?.startDate || entry.startDate, entry.startYear))}
      ${renderDetailBox("Chapters", detail?.chapters || entry.chapters || "-")}
      ${renderDetailBox("Volumes", detail?.volumes || entry.volumes || "-")}
    </section>

    <section class="detail-block">
      <h3>Synopsis</h3>
      <div class="detail-text">${synopsis}</div>
    </section>

    <section class="detail-block">
      <h3>Genres</h3>
      <div class="tag-cloud">${genres.length ? genres.map((genre) => `<span class="tag">${escapeHtml(genre)}</span>`).join("") : `<span class="tag">No genres</span>`}</div>
    </section>

    <section class="detail-block">
      <h3>Tags</h3>
      <div class="tag-cloud">${tags.length ? tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("") : `<span class="tag">No tags</span>`}</div>
    </section>

    <div class="detail-actions">
      <button class="action-button" id="save-toggle" type="button">${saved ? "Saved" : "Save"}</button>
      <a class="action-button action-button--primary" href="${escapeAttribute(detail?.siteUrl || entry.aniListUrl)}" target="_blank" rel="noreferrer">AniList</a>
    </div>
  `;

  document.getElementById("save-toggle")?.addEventListener("click", () => {
    toggleSaved(entry);
    renderDetail(entry, detail, options);
  });
}

function renderDetailBox(label, value) {
  return `<div class="detail-box"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

async function fetchAniListDetail(mediaId, signal) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id
        siteUrl
        title { english romaji userPreferred native }
        synonyms
        description
        coverImage { extraLarge large medium color }
        bannerImage
        genres
        tags { name rank isMediaSpoiler }
        status
        popularity
        favourites
        meanScore
        averageScore
        startDate { year month day }
        chapters
        volumes
      }
    }
  `;

  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables: { id: mediaId } }),
    signal,
  });
  const payload = await response.json();

  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || `AniList request failed (${response.status})`);
  }

  return normalizeDetail(payload.data?.Media);
}

function normalizeDetail(media) {
  if (!media) throw new Error("AniList did not return this entry.");
  const synonyms = normalizeStringArray(media.synonyms);
  const tags = (media.tags || [])
    .filter((tag) => !tag.isMediaSpoiler)
    .sort((left, right) => (right.rank || 0) - (left.rank || 0))
    .slice(0, 16)
    .map((tag) => tag.name);

  return {
    displayTitle: chooseDisplayTitle({
      english: media.title?.english,
      synonyms,
      romaji: media.title?.romaji,
      userPreferred: media.title?.userPreferred,
      native: media.title?.native,
    }),
    description: stripHtml(media.description || ""),
    coverImage: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || "",
    bannerImage: media.bannerImage || "",
    genres: normalizeStringArray(media.genres),
    tags,
    status: media.status || "UNKNOWN",
    popularity: Number(media.popularity || 0),
    favourites: Number(media.favourites || 0),
    meanScore: numberOrNull(media.meanScore),
    averageScore: numberOrNull(media.averageScore),
    startDate: normalizeStartDate(media.startDate),
    chapters: numberOrNull(media.chapters),
    volumes: numberOrNull(media.volumes),
    siteUrl: media.siteUrl || "",
  };
}

function openFilterSheet() {
  elements.sheetBackdrop.classList.remove("hidden");
  elements.filterSheet.classList.add("is-open");
  elements.filterSheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("sheet-open");
  renderFilterSheet();
}

function renderFilterSheet() {
  elements.filterBody.innerHTML = `
    <div class="filter-grid">
      ${renderChipGroup("Discovery", DISCOVERY_TABS, state.ui.discoveryTab, "discoveryTab")}
      ${renderChipGroup("Growth Window", TIME_WINDOWS, state.ui.timeWindow, "timeWindow")}
      ${renderChipGroup("Release Age", AGE_FILTERS, state.ui.releaseAge, "releaseAge")}
      ${renderChipGroup("Lane", LANES, state.ui.lane, "lane")}
      ${renderChipGroup("Status", Object.keys(STATUS_LABELS).map((key) => ({ key, label: STATUS_LABELS[key] })), state.ui.status, "status")}
      ${renderChipGroup("Sort", SORTS, state.ui.sort, "sort")}
      ${renderRangeGroup("Popularity", "popMin", "popMax", "100", "5000+")}
      ${renderRangeGroup("Mean Score", "scoreMin", "scoreMax", "65", "100")}
      ${renderRangeGroup("Fan Fav %", "fanMin", "fanMax", "3", "15")}
      ${renderRangeGroup("Favourites", "favouritesMin", "favouritesMax", "0", "5000")}
      ${renderRuleGroup("Genres", state.filterIndexes.genres.slice(0, 32), "genre")}
      ${renderRuleGroup("Tags", state.filterIndexes.tags.slice(0, 42), "tag")}
      <div class="filter-group">
        <h3>Early Entries</h3>
        <button class="filter-chip ${state.ui.showTooEarly ? "is-active" : ""}" data-toggle="showTooEarly" type="button">Show Too Early</button>
      </div>
    </div>
    <div class="filter-actions">
      <button class="action-button" id="filter-reset" type="button">Reset</button>
      <button class="action-button action-button--primary" id="filter-apply" type="button">Apply</button>
    </div>
  `;

  elements.filterBody.querySelectorAll("[data-field]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ui[button.dataset.field] = button.dataset.value;
      if (button.dataset.field === "discoveryTab") state.ui.page = "discovery";
      state.renderLimit = PAGE_SIZE;
      persistUi();
      renderChrome();
      applyFiltersAndRender();
      renderFilterSheet();
    });
  });

  elements.filterBody.querySelectorAll("[data-range]").forEach((input) => {
    input.addEventListener("input", () => {
      state.ui[input.dataset.range] = input.value.trim();
      state.renderLimit = PAGE_SIZE;
      persistUi();
      applyFiltersAndRender();
      renderChrome();
    });
  });

  elements.filterBody.querySelectorAll("[data-rule-type]").forEach((button) => {
    button.addEventListener("click", () => {
      cycleRule(button.dataset.ruleType, button.dataset.value);
      state.renderLimit = PAGE_SIZE;
      persistUi();
      applyFiltersAndRender();
      renderChrome();
      renderFilterSheet();
    });
  });

  elements.filterBody.querySelector("[data-toggle='showTooEarly']")?.addEventListener("click", () => {
    state.ui.showTooEarly = !state.ui.showTooEarly;
    state.renderLimit = PAGE_SIZE;
    persistUi();
    applyFiltersAndRender();
    renderChrome();
    renderFilterSheet();
  });

  document.getElementById("filter-reset")?.addEventListener("click", () => {
    state.ui = { ...DEFAULT_UI, theme: state.ui.theme };
    elements.searchInput.value = "";
    state.renderLimit = PAGE_SIZE;
    persistUi();
    renderChrome();
    applyFiltersAndRender();
    renderFilterSheet();
  });

  document.getElementById("filter-apply")?.addEventListener("click", closeSheets);
}

function renderChipGroup(title, options, activeValue, field) {
  return `
    <div class="filter-group">
      <h3>${escapeHtml(title)}</h3>
      <div class="chip-grid">
        ${options
          .map((option) => `<button class="filter-chip ${activeValue === option.key ? "is-active" : ""}" data-field="${field}" data-value="${escapeAttribute(option.key)}" type="button">${escapeHtml(option.label)}</button>`)
          .join("")}
      </div>
    </div>
  `;
}

function renderRangeGroup(title, minField, maxField, minPlaceholder, maxPlaceholder) {
  return `
    <div class="filter-group">
      <h3>${escapeHtml(title)}</h3>
      <div class="range-grid">
        <label><span class="range-label">Min</span><input data-range="${minField}" inputmode="decimal" value="${escapeAttribute(state.ui[minField])}" placeholder="${escapeAttribute(minPlaceholder)}" /></label>
        <label><span class="range-label">Max</span><input data-range="${maxField}" inputmode="decimal" value="${escapeAttribute(state.ui[maxField])}" placeholder="${escapeAttribute(maxPlaceholder)}" /></label>
      </div>
    </div>
  `;
}

function renderRuleGroup(title, values, type) {
  return `
    <div class="filter-group">
      <h3>${escapeHtml(title)}</h3>
      <div class="chip-grid">
        ${values.map((value) => {
          const stateClass = getRuleState(type, value);
          return `<button class="filter-chip ${stateClass}" data-rule-type="${type}" data-value="${escapeAttribute(value)}" type="button">${escapeHtml(value)}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function getRuleState(type, value) {
  const includeKey = type === "genre" ? "includeGenres" : "includeTags";
  const rejectKey = type === "genre" ? "rejectGenres" : "rejectTags";
  if (state.ui.includeGenres.includes(value) && includeKey === "includeGenres") return "is-active";
  if (state.ui.rejectGenres.includes(value) && rejectKey === "rejectGenres") return "is-reject";
  if (state.ui.includeTags.includes(value) && includeKey === "includeTags") return "is-active";
  if (state.ui.rejectTags.includes(value) && rejectKey === "rejectTags") return "is-reject";
  return "";
}

function cycleRule(type, value) {
  const includeKey = type === "genre" ? "includeGenres" : "includeTags";
  const rejectKey = type === "genre" ? "rejectGenres" : "rejectTags";
  const include = new Set(state.ui[includeKey]);
  const reject = new Set(state.ui[rejectKey]);

  if (!include.has(value) && !reject.has(value)) {
    include.add(value);
  } else if (include.has(value)) {
    include.delete(value);
    reject.add(value);
  } else {
    reject.delete(value);
  }

  state.ui[includeKey] = Array.from(include);
  state.ui[rejectKey] = Array.from(reject);
}

function closeSheets() {
  if (state.detailAbortController) {
    state.detailAbortController.abort();
    state.detailAbortController = null;
  }

  elements.sheetBackdrop.classList.add("hidden");
  elements.detailSheet.classList.remove("is-open");
  elements.filterSheet.classList.remove("is-open");
  elements.detailSheet.setAttribute("aria-hidden", "true");
  elements.filterSheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("sheet-open");
}

function getBadges(entry) {
  const badges = [];
  if (isNewlyAdded(entry)) badges.push({ key: "new", label: "New" });
  if (isFreshRelease(entry)) badges.push({ key: "fresh", label: "Fresh" });
  if (getGrowth(entry, "popularity") >= 50) badges.push({ key: "hot", label: "Hot" });
  if (getGrowth(entry, "fanFav") >= 0.5 || getGrowth(entry, "favourites") >= 10) badges.push({ key: "rise", label: "Rising" });
  if (isBreakout(entry)) badges.push({ key: "hot", label: "Breakout" });
  if (entry.popularity < 5000 && (entry.meanScore ?? 0) >= 78 && entry.fanFav >= 3) badges.push({ key: "hidden", label: "Hidden Gem" });
  if (isLegacy(entry)) badges.push({ key: "legacy", label: "Legacy" });
  if (getLane(entry.popularity).key === "tooEarly" || entry.meanScore === null) badges.push({ key: "early", label: "Too Early" });
  return badges.slice(0, 4);
}

function getTier(entry) {
  const mean = entry.meanScore ?? 0;
  const fanHigh = entry.fanFav >= 3;
  if (mean >= 80) return fanHigh ? "Peak" : "Hidden Gem+";
  if (mean >= 75) return fanHigh ? "Almost Peak" : "Hidden Gem";
  if (mean >= 70) return fanHigh ? "Great" : "Good";
  if (mean >= 65) return fanHigh ? "Decent" : "Fair";
  return "Meh";
}

function getLane(popularity) {
  return LANES.find((lane) => popularity >= lane.min && popularity <= lane.max && lane.key !== "all") || LANES[4];
}

function getActiveDiscoveryTab() {
  return DISCOVERY_TABS.find((tab) => tab.key === state.ui.discoveryTab) || DISCOVERY_TABS[0];
}

function getActiveTimeWindow() {
  return TIME_WINDOWS.find((windowOption) => windowOption.key === state.ui.timeWindow) || TIME_WINDOWS[2];
}

function getReleaseAgeOption() {
  return AGE_FILTERS.find((option) => option.key === state.ui.releaseAge) || AGE_FILTERS[0];
}

function getGrowth(entry, metric) {
  const windowKey = state.ui.timeWindow;
  const windowGrowth = entry.growth?.[windowKey] || entry.growth?.all || {};
  return Number(windowGrowth[metric] || 0);
}

function isNewlyAdded(entry) {
  if (!entry.firstSeen) return false;
  return daysSince(entry.firstSeen) <= getActiveTimeWindow().days;
}

function isFreshRelease(entry) {
  if (!entry.startDate) return false;
  const age = daysSinceDateObject(entry.startDate);
  return age >= -14 && age <= 30;
}

function isLegacy(entry) {
  if (!entry.startYear) return false;
  return new Date().getFullYear() - entry.startYear >= 10;
}

function isBreakout(entry) {
  const popGrowth = getGrowth(entry, "popularity");
  return popGrowth >= 1000 || (entry.popularity >= 1000 && entry.popularity - popGrowth < 1000);
}

function matchesReleaseAge(entry) {
  const option = getReleaseAgeOption();
  if (option.key === "all") return true;
  if (!entry.startDate && !entry.startYear) return false;

  const now = new Date();
  const ageDays = entry.startDate ? daysSinceDateObject(entry.startDate) : Infinity;
  const ageYears = entry.startYear ? now.getFullYear() - entry.startYear : Infinity;

  if (option.days) return ageDays >= 0 && ageDays <= option.days;
  if (option.key === "year") return entry.startYear === now.getFullYear();
  if (option.key === "1to3") return ageYears >= 1 && ageYears <= 3;
  if (option.key === "3to10") return ageYears > 3 && ageYears < 10;
  if (option.key === "10plus") return ageYears >= 10;
  return true;
}

function releaseRecencyScore(entry) {
  if (!entry.startDate) return 0;
  const days = daysSinceDateObject(entry.startDate);
  if (days < -14) return 0;
  if (days <= 30) return 1;
  if (days <= 90) return 0.65;
  if (days <= 365) return 0.25;
  return 0;
}

function normalizeGrowth(value, base) {
  if (!value || !base) return 0;
  return Math.min(Math.max(value / base, 0), 1);
}

function buildFilterIndexes(entries, meta) {
  if (meta?.indexes?.genres?.length || meta?.indexes?.tags?.length) {
    return {
      genres: meta.indexes.genres || [],
      tags: meta.indexes.tags || [],
    };
  }

  return {
    genres: topValues(entries.flatMap((entry) => entry.genres), 48),
    tags: topValues(entries.flatMap((entry) => entry.tags), 64),
  };
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
  return synonyms
    .map((synonym) => ({ synonym: cleanTitle(synonym), score: englishTitleScore(synonym) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.synonym.length - right.synonym.length)[0]?.synonym || "";
}

function englishTitleScore(value) {
  const text = cleanTitle(value);
  if (!looksLatin(text)) return 0;
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z]+/g) || [];
  if (!words.length) return 0;

  const common = new Set([
    "a", "an", "and", "are", "back", "best", "blade", "day", "developer", "estate", "family", "field",
    "forgotten", "god", "gods", "greatest", "home", "homeless", "i", "level", "love", "magic", "max",
    "my", "newbie", "no", "of", "only", "princess", "reader", "return", "school", "solo", "star", "the",
    "to", "up", "with", "world"
  ]);
  const commonHits = words.filter((word) => common.has(word)).length;
  const hasSpace = /\s/.test(text);
  const romanizationPenalty = words.filter((word) => ["na", "ni", "ga", "wa", "wo", "ui", "eopseo", "dake", "ken"].includes(word)).length;
  return commonHits * 3 + (hasSpace ? 1 : 0) + (text.length <= 34 ? 1 : 0) - romanizationPenalty * 2;
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

function daysSince(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Infinity;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function daysSinceDateObject(startDate) {
  const date = new Date(Date.UTC(startDate.year, (startDate.month || 1) - 1, startDate.day || 1));
  if (Number.isNaN(date.getTime())) return Infinity;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function getDateValue(startDate) {
  if (!startDate) return 0;
  return Number(`${startDate.year}${String(startDate.month || 1).padStart(2, "0")}${String(startDate.day || 1).padStart(2, "0")}`);
}

function matchesRange(value, min, max) {
  const number = Number(value || 0);
  const minNumber = min === "" || min === null || min === undefined ? -Infinity : Number(min);
  const maxNumber = max === "" || max === null || max === undefined ? Infinity : Number(max);
  return number >= minNumber && number <= maxNumber;
}

function containsEvery(values, selected) {
  if (!selected.length) return true;
  const normalized = new Set(values.map((value) => value.toLowerCase()));
  return selected.every((value) => normalized.has(value.toLowerCase()));
}

function containsAny(values, selected) {
  if (!selected.length) return false;
  const normalized = new Set(values.map((value) => value.toLowerCase()));
  return selected.some((value) => normalized.has(value.toLowerCase()));
}

function getSearchHaystack(entry) {
  return [
    entry.displayTitle,
    entry.romajiTitle,
    entry.englishTitle,
    entry.nativeTitle,
    ...entry.synonyms,
    ...entry.genres,
    ...entry.tags,
    entry.mediaId,
  ]
    .join(" ")
    .toLowerCase();
}

function toggleSaved(entry) {
  const key = String(entry.mediaId);
  if (state.savedIds.has(key)) {
    state.savedIds.delete(key);
  } else {
    state.savedIds.add(key);
  }
  localStorage.setItem(SAVED_KEY, JSON.stringify(Array.from(state.savedIds)));
  if (state.ui.page === "saved") applyFiltersAndRender();
}

function getCachedDetail(mediaId) {
  if (!mediaId) return null;
  if (state.detailMemoryCache.has(mediaId)) return state.detailMemoryCache.get(mediaId);

  try {
    const rawValue = localStorage.getItem(`${DETAIL_CACHE_PREFIX}${mediaId}`);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue);
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DETAIL_CACHE_TTL) {
      localStorage.removeItem(`${DETAIL_CACHE_PREFIX}${mediaId}`);
      return null;
    }
    state.detailMemoryCache.set(mediaId, parsed.detail);
    return parsed.detail;
  } catch {
    return null;
  }
}

function cacheDetail(mediaId, detail) {
  if (!mediaId || !detail) return;
  state.detailMemoryCache.set(mediaId, detail);
  try {
    localStorage.setItem(`${DETAIL_CACHE_PREFIX}${mediaId}`, JSON.stringify({ savedAt: Date.now(), detail }));
  } catch {
    // Browser storage can be full; memory cache still handles the current session.
  }
}

function loadUiState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return sanitizeUiState({ ...DEFAULT_UI, ...parsed });
  } catch {
    return { ...DEFAULT_UI };
  }
}

function sanitizeUiState(ui) {
  return {
    ...DEFAULT_UI,
    ...ui,
    includeGenres: Array.isArray(ui.includeGenres) ? ui.includeGenres : [],
    rejectGenres: Array.isArray(ui.rejectGenres) ? ui.rejectGenres : [],
    includeTags: Array.isArray(ui.includeTags) ? ui.includeTags : [],
    rejectTags: Array.isArray(ui.rejectTags) ? ui.rejectTags : [],
  };
}

function persistUi() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.ui));
}

function loadSavedIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.ui.theme === "noir" ? "" : state.ui.theme;
}

function makeChip(label, active) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `chip${active ? " is-active" : ""}`;
  button.textContent = label;
  return button;
}

function calculateFanFav(favourites, popularity) {
  if (!popularity) return 0;
  return (Number(favourites || 0) / Number(popularity)) * 100;
}

function compareDesc(left, right) {
  return (right || 0) - (left || 0);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseAniListId(url) {
  const match = String(url || "").match(/\/manga\/(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function compactNumber(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatSnapshotDate(value) {
  if (!value) return "...";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatStartDate(startDate, fallbackYear) {
  if (!startDate) return fallbackYear || "-";
  return [startDate.year, startDate.month, startDate.day].filter(Boolean).join("-");
}

function formatSynopsis(text) {
  const safe = escapeHtml(stripHtml(text));
  if (!safe) return "<p>No synopsis is available.</p>";
  return safe
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function stripHtml(value) {
  const parser = new DOMParser();
  return parser.parseFromString(String(value || ""), "text/html").body.textContent.trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
