const CATALOG_URL = "./data/catalog.json";
const PAGE_SIZE = 36;
const APP_STATE_KEY = "manhwalens-state-v1";
const DETAIL_CACHE_PREFIX = "manhwalens-detail-v1:";
const DETAIL_CACHE_TTL = 1000 * 60 * 60 * 24 * 7;

const DEFAULT_EXCLUDED_TAGS = ["Adult", "Boys' Love", "Yuri"];
const CONTENT_RESTRICTION_TAGS = ["Adult", "Boys' Love", "Yuri", "Hentai"];

const RELEASE_WINDOWS = [
  { key: "all", label: "All releases", days: Infinity },
  { key: "30d", label: "Last 30d", days: 30 },
  { key: "90d", label: "Last 90d", days: 90 },
  { key: "1y", label: "This year", mode: "year" },
  { key: "3y", label: "1-3 years", minYears: 1, maxYears: 3 },
  { key: "10y", label: "3-10 years", minYears: 3, maxYears: 10 },
  { key: "legacy", label: "10+ years", minYears: 10, maxYears: Infinity },
];

const GROWTH_WINDOWS = [
  { key: "1d", label: "Growth 1D" },
  { key: "3d", label: "Growth 3D" },
  { key: "7d", label: "Growth 1W" },
  { key: "14d", label: "Growth 2W" },
  { key: "30d", label: "Growth 1M" },
  { key: "90d", label: "Growth 3M" },
  { key: "365d", label: "Growth 1Y" },
];

const GROWTH_TYPES = [
  { key: "raw", label: "Raw Growth" },
  { key: "percentage", label: "Percentage Growth" },
  { key: "normalized", label: "Normalized Growth" },
  { key: "ageAdjusted", label: "Age-adjusted Growth" },
];

const SORT_OPTIONS = [
  { key: "fanFav", label: "Fan Fav %" },
  { key: "meanScore", label: "Mean Score" },
  { key: "popularity", label: "Popularity" },
  { key: "popGrowth", label: "Popularity Growth" },
  { key: "fanGrowth", label: "Fan Fav Growth" },
  { key: "meanGrowth", label: "Mean Growth" },
  { key: "favourites", label: "Favorites" },
  { key: "releaseDate", label: "Release Date" },
  { key: "chapters", label: "Chapter Count" },
];

const DEFAULT_FEEDS = [
  {
    id: "hidden-gems",
    name: "Hidden Gems",
    description: "",
    cover: "",
    criteria: {
      popularity: [100, 3000],
      meanScore: [75, 100],
      fanFav: [3, 100],
      favourites: [0, Infinity],
      releaseWindow: "90d",
      growthWindow: "7d",
      growthType: "raw",
      includeGenres: [],
      excludeGenres: [],
      includeTags: [],
      excludeTags: DEFAULT_EXCLUDED_TAGS,
      allowRestricted: false,
    },
    sort: { primary: "fanFav", secondary: "meanScore", direction: "desc" },
    labelId: "hidden-gem",
  },
  {
    id: "rising-fast",
    name: "Rising Fast",
    description: "",
    cover: "",
    criteria: {
      popularity: [100, 10000],
      meanScore: [65, 100],
      fanFav: [0, 100],
      favourites: [0, Infinity],
      releaseWindow: "all",
      growthWindow: "7d",
      growthType: "raw",
      includeGenres: [],
      excludeGenres: [],
      includeTags: [],
      excludeTags: DEFAULT_EXCLUDED_TAGS,
      allowRestricted: false,
    },
    sort: { primary: "popGrowth", secondary: "fanFav", direction: "desc" },
    labelId: "breakout",
  },
  {
    id: "fresh-finds",
    name: "Fresh Finds",
    description: "",
    cover: "",
    criteria: {
      popularity: [30, 3000],
      meanScore: [0, 100],
      fanFav: [0, 100],
      favourites: [0, Infinity],
      releaseWindow: "30d",
      growthWindow: "3d",
      growthType: "raw",
      includeGenres: [],
      excludeGenres: [],
      includeTags: [],
      excludeTags: DEFAULT_EXCLUDED_TAGS,
      allowRestricted: false,
    },
    sort: { primary: "releaseDate", secondary: "popularity", direction: "desc" },
    labelId: "fresh",
  },
  {
    id: "mainstream",
    name: "Mainstream",
    description: "",
    cover: "",
    criteria: {
      popularity: [10000, Infinity],
      meanScore: [65, 100],
      fanFav: [0, 100],
      favourites: [0, Infinity],
      releaseWindow: "all",
      growthWindow: "30d",
      growthType: "raw",
      includeGenres: [],
      excludeGenres: [],
      includeTags: [],
      excludeTags: DEFAULT_EXCLUDED_TAGS,
      allowRestricted: false,
    },
    sort: { primary: "meanScore", secondary: "fanFav", direction: "desc" },
    labelId: "mainstream",
  },
];

const DEFAULT_LABELS = [
  { id: "hidden-gem", name: "Hidden Gem", color: "#54d68a", icon: "Gem", criteria: "Pop 100-3000 / Mean 75+ / Fan Fav 3%+" },
  { id: "breakout", name: "Breakout", color: "#ffb65c", icon: "Rise", criteria: "Growth focused" },
  { id: "fresh", name: "Fresh", color: "#8f7cff", icon: "New", criteria: "Recent releases" },
  { id: "mainstream", name: "Mainstream", color: "#a6a6ad", icon: "Known", criteria: "Pop 10000+" },
];

const DEFAULT_VIBES = [
  { id: "atmospheric", name: "Atmospheric", color: "#8f7cff", icon: "Moon", mediaIds: [] },
  { id: "hype", name: "Hype", color: "#ffb65c", icon: "Bolt", mediaIds: [] },
  { id: "melancholic", name: "Melancholic", color: "#7aa2ff", icon: "Rain", mediaIds: [] },
];

const state = {
  catalog: [],
  meta: null,
  view: "home",
  activeFeedId: "hidden-gems",
  renderLimit: PAGE_SIZE,
  searchQuery: "",
  feeds: structuredClone(DEFAULT_FEEDS),
  labels: structuredClone(DEFAULT_LABELS),
  vibes: structuredClone(DEFAULT_VIBES),
  library: [],
  builder: null,
  builderStep: 0,
  scrollY: 0,
  activeSheet: null,
  detailCache: new Map(),
};

const els = {
  body: document.body,
  activeFeedName: document.getElementById("active-feed-name"),
  feedTitle: document.getElementById("feed-title"),
  feedDescription: document.getElementById("feed-description"),
  feedSelect: document.getElementById("feed-select"),
  feedMenu: document.getElementById("feed-menu"),
  searchOpen: document.getElementById("search-open"),
  quickControls: document.getElementById("quick-controls"),
  ruleRow: document.getElementById("rule-row"),
  feedList: document.getElementById("feed-list"),
  loadMore: document.getElementById("load-more"),
  navButtons: document.querySelectorAll(".nav-btn[data-view]"),
  createFeed: document.getElementById("create-feed"),
  backdrop: document.getElementById("backdrop"),
  detailSheet: document.getElementById("detail-sheet"),
  detailContent: document.getElementById("detail-content"),
  pickerSheet: document.getElementById("picker-sheet"),
  pickerContent: document.getElementById("picker-content"),
  feedFlow: document.getElementById("feed-flow"),
  flowClose: document.getElementById("flow-close"),
  flowTitle: document.getElementById("flow-title"),
  flowSave: document.getElementById("flow-save"),
  flowSteps: document.getElementById("flow-steps"),
  flowBody: document.getElementById("flow-body"),
  entryTemplate: document.getElementById("entry-template"),
};

init();

async function init() {
  restoreState();
  bindGlobalEvents();
  renderLoading();

  try {
    const response = await fetch(CATALOG_URL, { cache: "no-store" });
    const catalog = await response.json();
    state.meta = catalog.meta || null;
    state.catalog = (catalog.entries || []).map(normalizeEntry);
    render();
  } catch (error) {
    renderEmpty(`Catalog could not load. ${error instanceof Error ? error.message : ""}`);
  }
}

function bindGlobalEvents() {
  els.feedSelect.addEventListener("click", () => openFeedPicker());
  els.feedMenu.addEventListener("click", () => openFeedActions());
  els.searchOpen.addEventListener("click", () => openSearch());
  els.loadMore.addEventListener("click", () => {
    state.renderLimit += PAGE_SIZE;
    renderFeedList();
  });
  els.createFeed.addEventListener("click", () => startFeedFlow());
  els.backdrop.addEventListener("click", closeSheet);
  els.flowClose.addEventListener("click", closeFeedFlow);
  els.flowSave.addEventListener("click", saveBuilderFeed);

  for (const button of els.navButtons) {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.renderLimit = PAGE_SIZE;
      persistState();
      render();
    });
  }

  setupSheetGesture(els.detailSheet);
  setupSheetGesture(els.pickerSheet);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!els.feedFlow.classList.contains("hidden")) closeFeedFlow();
      closeSheet();
    }
  });
}

function render() {
  updateNav();
  const feed = getActiveFeed();
  els.activeFeedName.textContent = feed.name;
  els.feedTitle.textContent = state.view === "home" ? feed.name : titleForView(state.view);
  els.feedDescription.textContent = state.view === "home" ? feed.description || "" : "";
  els.feedMenu.classList.toggle("hidden", state.view !== "home");
  renderRules(feed);
  renderQuickControls(feed);
  renderFeedList();
}

function updateNav() {
  for (const button of els.navButtons) {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  }
}

function titleForView(view) {
  return {
    feeds: "Feeds",
    library: "Library",
    search: "Search",
  }[view] || getActiveFeed().name;
}

function getActiveFeed() {
  return state.feeds.find((feed) => feed.id === state.activeFeedId) || state.feeds[0] || DEFAULT_FEEDS[0];
}

function renderRules(feed) {
  const criteria = feed.criteria;
  const rules = [
    `Pop ${formatRange(criteria.popularity)}`,
    `Mean ${criteria.meanScore[0]}+`,
    `Fan Fav ${criteria.fanFav[0]}%+`,
    getReleaseWindow(criteria.releaseWindow).label,
  ];
  els.ruleRow.innerHTML = rules.map((rule) => `<span class="pill">${escapeHtml(rule)}</span>`).join("");
}

function renderQuickControls(feed) {
  const criteria = feed.criteria;
  const controls = [
    { label: getReleaseWindow(criteria.releaseWindow).label, action: () => openQuickPicker("Release Window", RELEASE_WINDOWS, criteria.releaseWindow, (value) => updateActiveFeed({ releaseWindow: value })) },
    { label: getGrowthWindow(criteria.growthWindow).label, action: () => openQuickPicker("Growth Window", GROWTH_WINDOWS, criteria.growthWindow, (value) => updateActiveFeed({ growthWindow: value })) },
    { label: `Sort ${getSort(feed.sort.primary).label}`, action: () => openQuickPicker("Sort By", SORT_OPTIONS, feed.sort.primary, (value) => updateActiveFeedSort(value)) },
  ];

  els.quickControls.innerHTML = "";
  for (const control of controls) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pill is-active";
    button.textContent = control.label;
    button.addEventListener("click", control.action);
    els.quickControls.appendChild(button);
  }
}

function renderFeedList() {
  if (state.view === "feeds") {
    renderFeedManager();
    return;
  }
  if (state.view === "library") {
    renderLibrary();
    return;
  }
  if (state.view === "search") {
    renderSearchView();
    return;
  }

  const feed = getActiveFeed();
  const entries = getFeedEntries(feed);
  renderEntryList(entries);
}

function renderEntryList(entries) {
  els.feedList.innerHTML = "";
  els.loadMore.classList.toggle("hidden", entries.length <= state.renderLimit);

  if (!entries.length) {
    renderEmpty("Nothing matches this feed. Edit the rules or loosen a range.");
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of entries.slice(0, state.renderLimit)) {
    fragment.appendChild(renderEntryCard(entry));
  }
  els.feedList.appendChild(fragment);
}

function renderEntryCard(entry) {
  const node = els.entryTemplate.content.cloneNode(true);
  const card = node.querySelector(".entry-card");
  const cover = node.querySelector(".entry-card__cover");
  const rank = node.querySelector(".entry-card__rank");
  const label = node.querySelector(".entry-card__label");
  const save = node.querySelector(".entry-card__save");
  const title = node.querySelector("h3");
  const meta = node.querySelector(".entry-card__meta");

  cover.innerHTML = entry.coverImageSmall
    ? `<img src="${escapeAttr(entry.coverImageSmall)}" alt="${escapeAttr(entry.displayTitle)} cover" loading="lazy" decoding="async" width="184" height="276" />`
    : "<span>No cover</span>";
  rank.textContent = entry.feedRank ? String(entry.feedRank) : "";
  title.textContent = entry.displayTitle;
  meta.textContent = compactMeta(entry);
  node.querySelector(".metric-mean").textContent = entry.meanScore || "-";
  node.querySelector(".metric-fan").textContent = `${formatNumber(entry.fanFav)}%`;
  node.querySelector(".metric-pop").textContent = compactNumber(entry.popularity);
  save.textContent = state.library.includes(entry.id) ? "Saved" : "";

  const labelMatch = getLabelForEntry(entry);
  if (labelMatch) {
    label.textContent = labelMatch.name;
    label.classList.remove("hidden");
  }

  card.addEventListener("click", () => openDetail(entry));
  return node;
}

function getFeedEntries(feed) {
  const criteria = feed.criteria;
  const entries = state.catalog
    .filter((entry) => matchesFeed(entry, feed))
    .map((entry) => ({ ...entry, feedReasons: reasonsForEntry(entry, feed) }))
    .sort((a, b) => compareByFeed(a, b, feed))
    .map((entry, index) => ({ ...entry, feedRank: index + 1 }));
  return entries;
}

function matchesFeed(entry, feed) {
  const c = feed.criteria;
  if (!between(entry.popularity, c.popularity)) return false;
  if (!between(entry.meanScore || 0, c.meanScore)) return false;
  if (!between(entry.fanFav || 0, c.fanFav)) return false;
  if (!between(entry.favourites || 0, c.favourites)) return false;
  if (!matchesRelease(entry, c.releaseWindow)) return false;
  if (!c.allowRestricted && containsAny([...entry.genres, ...entry.tags], CONTENT_RESTRICTION_TAGS)) return false;
  if (!containsEvery(entry.genres, c.includeGenres)) return false;
  if (containsAny(entry.genres, c.excludeGenres)) return false;
  if (!containsEvery(entry.tags, c.includeTags)) return false;
  if (containsAny(entry.tags, c.excludeTags)) return false;
  return true;
}

function compareByFeed(a, b, feed) {
  const direction = feed.sort.direction === "asc" ? 1 : -1;
  const primary = compareMetric(a, b, feed.sort.primary) * direction;
  if (primary) return primary;
  const secondary = compareMetric(a, b, feed.sort.secondary || "meanScore") * direction;
  if (secondary) return secondary;
  return b.popularity - a.popularity || a.displayTitle.localeCompare(b.displayTitle);
}

function compareMetric(a, b, metric) {
  return metricValue(a, metric, getActiveFeed()) - metricValue(b, metric, getActiveFeed());
}

function metricValue(entry, metric, feed) {
  if (metric === "fanFav") return entry.fanFav || 0;
  if (metric === "meanScore") return entry.meanScore || 0;
  if (metric === "popularity") return entry.popularity || 0;
  if (metric === "popGrowth") return growth(entry, "popularity", feed.criteria.growthWindow);
  if (metric === "fanGrowth") return growth(entry, "fanFav", feed.criteria.growthWindow);
  if (metric === "meanGrowth") return growth(entry, "meanScore", feed.criteria.growthWindow);
  if (metric === "favourites") return entry.favourites || 0;
  if (metric === "releaseDate") return dateValue(entry.startDate);
  if (metric === "chapters") return entry.chapters || 0;
  return 0;
}

function renderFeedManager() {
  els.ruleRow.innerHTML = "";
  els.quickControls.innerHTML = `<button class="pill is-active" type="button" id="new-feed-inline">Create Feed</button>`;
  document.getElementById("new-feed-inline")?.addEventListener("click", () => startFeedFlow());

  els.feedList.innerHTML = `<div class="feed-manager"></div>`;
  const manager = els.feedList.querySelector(".feed-manager");
  for (const feed of state.feeds) {
    const row = document.createElement("div");
    row.className = "feed-row";
    row.innerHTML = `<div><strong>${escapeHtml(feed.name)}</strong><small>${escapeHtml(summaryForFeed(feed))}</small></div><button class="ghost-btn" type="button">Open</button>`;
    row.querySelector("button").addEventListener("click", () => {
      state.activeFeedId = feed.id;
      state.view = "home";
      persistState();
      render();
    });
    row.addEventListener("dblclick", () => startFeedFlow(feed));
    manager.appendChild(row);
  }
  els.loadMore.classList.add("hidden");
}

function renderLibrary() {
  els.ruleRow.innerHTML = "";
  els.quickControls.innerHTML = "";
  const entries = state.catalog.filter((entry) => state.library.includes(entry.id)).map((entry, index) => ({ ...entry, feedRank: index + 1 }));
  renderEntryList(entries);
}

function renderSearchView() {
  els.ruleRow.innerHTML = "";
  els.quickControls.innerHTML = `
    <input class="search-input" id="search-input" value="${escapeAttr(state.searchQuery)}" placeholder="Search titles, genres, tags" />
  `;
  const input = document.getElementById("search-input");
  input?.addEventListener("input", () => {
    state.searchQuery = input.value.trim();
    persistState();
    renderSearchView();
  });
  const query = state.searchQuery.toLowerCase();
  const entries = query
    ? state.catalog
        .filter((entry) => searchText(entry).includes(query))
        .sort((a, b) => b.popularity - a.popularity)
        .map((entry, index) => ({ ...entry, feedRank: index + 1 }))
    : [];
  renderEntryList(entries);
  if (!query) renderEmpty("Search by title, genre, tag, or AniList ID.");
}

function renderEmpty(message) {
  els.feedList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  els.loadMore.classList.add("hidden");
}

function renderLoading() {
  els.feedList.innerHTML = `<div class="empty-state">Loading discovery catalog...</div>`;
}

function openDetail(entry) {
  const feed = getActiveFeed();
  const reasons = entry.feedReasons || reasonsForEntry(entry, feed);
  openSheet(els.detailSheet, els.detailContent);
  renderDetail(entry, reasons);
  hydrateDetail(entry.id, entry);
}

function renderDetail(entry, reasons, detail = null) {
  const title = detail?.displayTitle || entry.displayTitle;
  const cover = detail?.coverImage || entry.coverImage || entry.coverImageSmall;
  const genres = detail?.genres?.length ? detail.genres : entry.genres;
  const tags = detail?.tags?.length ? detail.tags : entry.tags;
  const saved = state.library.includes(entry.id);

  els.detailContent.innerHTML = `
    <section class="detail-hero">
      <div class="detail-cover">${cover ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(title)} cover" decoding="async" />` : "No cover"}</div>
      <div class="detail-title">
        <p class="detail-kicker">${escapeHtml(compactMeta(entry))}</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
    </section>
    <section class="metric-grid">
      ${metricBox("Mean", entry.meanScore || "-")}
      ${metricBox("Fan Fav", `${formatNumber(entry.fanFav)}%`)}
      ${metricBox("Popularity", compactNumber(entry.popularity))}
      ${metricBox("Favorites", compactNumber(entry.favourites))}
    </section>
    <section class="detail-section">
      <h3>Why this appeared</h3>
      <div class="reason-list">${reasons.map((reason) => `<div class="reason-item">${escapeHtml(reason)}</div>`).join("") || `<div class="reason-item">Matches the active feed rules.</div>`}</div>
    </section>
    <section class="detail-section"><h3>Synopsis</h3><div class="detail-text">${formatSynopsis(detail?.description || "Open AniList for the full synopsis while live details load.")}</div></section>
    <section class="detail-section"><h3>Genres</h3><div class="tag-cloud">${renderTags(genres)}</div></section>
    <section class="detail-section"><h3>Tags</h3><div class="tag-cloud">${renderTags(tags.slice(0, 18))}</div></section>
    <section class="detail-section"><h3>Release Info</h3><p class="detail-text">${escapeHtml(formatRelease(entry))}</p></section>
    <section class="detail-section"><h3>Chapter Info</h3><p class="detail-text">${escapeHtml(`${entry.chapters || "-"} chapters / ${entry.volumes || "-"} volumes`)}</p></section>
    <section class="detail-section"><h3>User Vibes</h3><div class="tag-cloud">${renderVibes(entry)}</div></section>
    <div class="detail-actions">
      <button class="action-btn" id="toggle-library" type="button">${saved ? "Saved" : "Add to Library"}</button>
      <button class="action-btn" id="add-vibe" type="button">Vibe</button>
      <a class="action-btn action-btn--primary" href="${escapeAttr(entry.aniListUrl)}" target="_blank" rel="noreferrer">AniList</a>
    </div>
  `;

  document.getElementById("toggle-library")?.addEventListener("click", () => {
    toggleLibrary(entry.id);
    renderDetail(entry, reasons, detail);
  });
  document.getElementById("add-vibe")?.addEventListener("click", () => openVibePicker(entry));
}

async function hydrateDetail(mediaId, fallbackEntry) {
  const cached = getCachedDetail(mediaId);
  if (cached) {
    renderDetail(fallbackEntry, reasonsForEntry(fallbackEntry, getActiveFeed()), cached);
    return;
  }

  try {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: MANGA) {
          id siteUrl description
          title { english romaji userPreferred native }
          synonyms
          coverImage { extraLarge large medium }
          genres
          tags { name rank isMediaSpoiler }
          chapters volumes
        }
      }
    `;
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { id: Number(mediaId) } }),
    });
    const payload = await response.json();
    const media = payload.data?.Media;
    if (!media) return;
    const detail = {
      displayTitle: chooseTitle(media, fallbackEntry),
      description: stripHtml(media.description || ""),
      coverImage: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || "",
      genres: media.genres || [],
      tags: (media.tags || []).filter((tag) => !tag.isMediaSpoiler).sort((a, b) => (b.rank || 0) - (a.rank || 0)).map((tag) => tag.name),
    };
    cacheDetail(mediaId, detail);
    renderDetail(fallbackEntry, reasonsForEntry(fallbackEntry, getActiveFeed()), detail);
  } catch {
    // Detail enrichment is optional; the snapshot card remains usable.
  }
}

function openFeedPicker() {
  openSheet(els.pickerSheet, els.pickerContent);
  els.pickerContent.innerHTML = `
    <h2 class="picker-title">Choose Feed</h2>
    <div class="feed-strip">${state.feeds.map((feed) => `<button class="pill ${feed.id === state.activeFeedId ? "is-active" : ""}" data-feed="${feed.id}" type="button">${escapeHtml(feed.name)}</button>`).join("")}</div>
    <div class="detail-actions"><button class="action-btn action-btn--primary" id="picker-create" type="button">Create Feed</button></div>
  `;
  els.pickerContent.querySelectorAll("[data-feed]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeFeedId = button.dataset.feed;
      state.view = "home";
      closeSheet();
      persistState();
      render();
    });
  });
  document.getElementById("picker-create")?.addEventListener("click", () => {
    closeSheet();
    startFeedFlow();
  });
}

function openFeedActions() {
  const feed = getActiveFeed();
  openSheet(els.pickerSheet, els.pickerContent);
  els.pickerContent.innerHTML = `
    <h2 class="picker-title">${escapeHtml(feed.name)}</h2>
    <div class="picker-list">
      <button class="action-btn" id="edit-feed" type="button">Edit Feed</button>
      <button class="action-btn" id="duplicate-feed" type="button">Duplicate Feed</button>
      <button class="action-btn" id="delete-feed" type="button">Delete Custom Feed</button>
    </div>
  `;
  document.getElementById("edit-feed")?.addEventListener("click", () => {
    closeSheet();
    startFeedFlow(feed);
  });
  document.getElementById("duplicate-feed")?.addEventListener("click", () => {
    const copy = structuredClone(feed);
    copy.id = createId(copy.name);
    copy.name = `${copy.name} Copy`;
    state.feeds.push(copy);
    state.activeFeedId = copy.id;
    closeSheet();
    persistState();
    render();
  });
  document.getElementById("delete-feed")?.addEventListener("click", () => {
    if (DEFAULT_FEEDS.some((item) => item.id === feed.id)) return;
    state.feeds = state.feeds.filter((item) => item.id !== feed.id);
    state.activeFeedId = state.feeds[0].id;
    closeSheet();
    persistState();
    render();
  });
}

function openSearch() {
  state.view = "search";
  persistState();
  render();
  setTimeout(() => document.getElementById("search-input")?.focus(), 0);
}

function openQuickPicker(title, options, active, onPick) {
  openSheet(els.pickerSheet, els.pickerContent);
  els.pickerContent.innerHTML = `<h2 class="picker-title">${escapeHtml(title)}</h2><div class="picker-list"></div>`;
  const list = els.pickerContent.querySelector(".picker-list");
  for (const option of options) {
    const row = document.createElement("button");
    row.className = "feed-row";
    row.type = "button";
    row.innerHTML = `<strong>${escapeHtml(option.label)}</strong>${option.key === active ? "<small>Selected</small>" : ""}`;
    row.addEventListener("click", () => {
      onPick(option.key);
      closeSheet();
    });
    list.appendChild(row);
  }
}

function openVibePicker(entry) {
  openSheet(els.pickerSheet, els.pickerContent);
  els.pickerContent.innerHTML = `<h2 class="picker-title">Vibes</h2><div class="chip-grid">${state.vibes.map((vibe) => `<button class="choice-chip ${vibe.mediaIds.includes(entry.id) ? "is-active" : ""}" data-vibe="${vibe.id}" type="button">${escapeHtml(vibe.icon)} ${escapeHtml(vibe.name)}</button>`).join("")}</div>`;
  els.pickerContent.querySelectorAll("[data-vibe]").forEach((button) => {
    button.addEventListener("click", () => {
      const vibe = state.vibes.find((item) => item.id === button.dataset.vibe);
      if (!vibe) return;
      vibe.mediaIds = toggleArray(vibe.mediaIds, entry.id);
      persistState();
      renderDetail(entry, reasonsForEntry(entry, getActiveFeed()));
    });
  });
}

function openSheet(sheet, scroller) {
  if (state.activeSheet) closeSheet(false);
  state.scrollY = window.scrollY;
  document.body.style.top = `-${state.scrollY}px`;
  document.body.classList.add("sheet-open");
  els.backdrop.classList.remove("hidden");
  state.activeSheet = sheet;
  scroller.scrollTop = 0;
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
}

function closeSheet(restore = true) {
  if (!state.activeSheet) return;
  state.activeSheet.classList.remove("is-open", "is-dragging");
  state.activeSheet.style.transform = "";
  state.activeSheet.setAttribute("aria-hidden", "true");
  els.backdrop.classList.add("hidden");
  state.activeSheet = null;
  document.body.classList.remove("sheet-open");
  const top = Math.abs(parseInt(document.body.style.top || "0", 10)) || state.scrollY;
  document.body.style.top = "";
  if (restore) window.scrollTo(0, top);
}

function setupSheetGesture(sheet) {
  const grabber = sheet.querySelector(".sheet__grabber");
  let startY = 0;
  let currentY = 0;
  let dragging = false;
  let moved = false;

  grabber.addEventListener("pointerdown", (event) => {
    dragging = true;
    moved = false;
    startY = event.clientY;
    currentY = 0;
    sheet.classList.add("is-dragging");
    grabber.setPointerCapture(event.pointerId);
  });

  grabber.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    currentY = Math.max(0, event.clientY - startY);
    if (currentY > 8) moved = true;
    sheet.style.transform = `translate(-50%, ${currentY}px)`;
  });

  grabber.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove("is-dragging");
    if (!moved || currentY > 90) closeSheet();
    else sheet.style.transform = "";
  });
}

function startFeedFlow(feed = null) {
  state.builder = structuredClone(feed || DEFAULT_FEEDS[0]);
  if (!feed) {
    state.builder.id = createId("Custom Feed");
    state.builder.name = "Custom Feed";
  }
  state.builderStep = 0;
  document.body.classList.add("flow-open");
  els.feedFlow.classList.remove("hidden");
  els.feedFlow.setAttribute("aria-hidden", "false");
  renderFlow();
}

function closeFeedFlow() {
  state.builder = null;
  document.body.classList.remove("flow-open");
  els.feedFlow.classList.add("hidden");
  els.feedFlow.setAttribute("aria-hidden", "true");
}

function renderFlow() {
  const steps = ["Basics", "Criteria", "Content", "Sorting", "Preview"];
  els.flowTitle.textContent = state.builder?.id && state.feeds.some((feed) => feed.id === state.builder.id) ? "Edit Feed" : "Create Feed";
  els.flowSteps.innerHTML = steps.map((step, index) => `<button class="pill ${index === state.builderStep ? "is-active" : ""}" data-step="${index}" type="button">${index + 1}. ${step}</button>`).join("");
  els.flowSteps.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => {
    syncBuilderFromDom();
    state.builderStep = Number(button.dataset.step);
    renderFlow();
  }));

  els.flowBody.innerHTML = renderFlowStep();
  bindFlowStep();
}

function renderFlowStep() {
  const b = state.builder;
  if (state.builderStep === 0) {
    return `
      <section class="form-section">
        <h3>Feed Basics</h3>
        ${field("Feed Name", "name", b.name)}
        ${textarea("Description", "description", b.description || "")}
        ${field("Cover / background image URL", "cover", b.cover || "")}
      </section>
      ${builderNav()}
    `;
  }
  if (state.builderStep === 1) {
    return `
      <section class="form-section">
        <h3>Discovery Criteria</h3>
        ${rangeControl("Popularity Range", "popularity", b.criteria.popularity, 0, 10000, 100)}
        ${rangeControl("Mean Score", "meanScore", b.criteria.meanScore, 0, 100, 1)}
        ${rangeControl("Fan Fav %", "fanFav", b.criteria.fanFav, 0, 20, 0.1)}
        ${rangeControl("Favorites", "favourites", b.criteria.favourites, 0, 10000, 50)}
        ${selectField("Release Period", "releaseWindow", RELEASE_WINDOWS, b.criteria.releaseWindow)}
        ${selectField("Growth Window", "growthWindow", GROWTH_WINDOWS, b.criteria.growthWindow)}
        ${selectField("Growth Type", "growthType", GROWTH_TYPES, b.criteria.growthType)}
      </section>
      ${builderNav()}
    `;
  }
  if (state.builderStep === 2) {
    const genres = state.meta?.indexes?.genres || [];
    const tags = state.meta?.indexes?.tags || [];
    return `
      <section class="form-section">
        <h3>Content Filters</h3>
        <p class="form-hint">Tap once to include, twice to exclude, third tap clears.</p>
        <h3>Genres</h3>
        <div class="chip-grid">${genres.map((value) => ruleChip("genre", value)).join("")}</div>
        <h3>Tags</h3>
        <div class="chip-grid">${tags.slice(0, 64).map((value) => ruleChip("tag", value)).join("")}</div>
        <div class="field"><label><input id="allowRestricted" type="checkbox" ${b.criteria.allowRestricted ? "checked" : ""} /> Allow Adult / BL / Yuri</label></div>
      </section>
      ${builderNav()}
    `;
  }
  if (state.builderStep === 3) {
    return `
      <section class="form-section">
        <h3>Sorting</h3>
        ${selectField("Primary Sort", "primary", SORT_OPTIONS, b.sort.primary)}
        ${selectField("Secondary Sort", "secondary", SORT_OPTIONS, b.sort.secondary || "meanScore")}
        ${selectField("Order", "direction", [{ key: "desc", label: "Descending" }, { key: "asc", label: "Ascending" }], b.sort.direction)}
      </section>
      ${builderNav()}
    `;
  }
  const preview = getFeedEntries(b).slice(0, 6);
  return `
    <section class="form-section">
      <h3>Preview</h3>
      <p class="form-hint">${getFeedEntries(b).length} matching titles</p>
      <div class="picker-list">${preview.map((entry) => `<div class="feed-row"><div><strong>${escapeHtml(entry.displayTitle)}</strong><small>Mean ${entry.meanScore || "-"} / Fan Fav ${formatNumber(entry.fanFav)}% / Pop ${compactNumber(entry.popularity)}</small></div></div>`).join("") || `<p class="form-hint">No matches yet.</p>`}</div>
    </section>
    ${builderNav("Save Feed")}
  `;
}

function bindFlowStep() {
  els.flowBody.querySelectorAll("[data-input]").forEach((input) => input.addEventListener("input", syncBuilderFromDom));
  els.flowBody.querySelectorAll("[data-select]").forEach((input) => input.addEventListener("change", syncBuilderFromDom));
  els.flowBody.querySelectorAll("[data-rule]").forEach((button) => {
    button.addEventListener("click", () => {
      cycleBuilderRule(button.dataset.kind, button.dataset.value);
      renderFlow();
    });
  });
  document.getElementById("allowRestricted")?.addEventListener("change", syncBuilderFromDom);
  els.flowBody.querySelector("[data-prev]")?.addEventListener("click", () => {
    syncBuilderFromDom();
    state.builderStep = Math.max(0, state.builderStep - 1);
    renderFlow();
  });
  els.flowBody.querySelector("[data-next]")?.addEventListener("click", () => {
    syncBuilderFromDom();
    if (state.builderStep >= 4) saveBuilderFeed();
    else {
      state.builderStep += 1;
      renderFlow();
    }
  });
}

function syncBuilderFromDom() {
  if (!state.builder) return;
  const b = state.builder;
  els.flowBody.querySelectorAll("[data-input]").forEach((input) => {
    if (input.dataset.input === "name") b.name = input.value.trim() || "Untitled Feed";
    if (input.dataset.input === "description") b.description = input.value.trim();
    if (input.dataset.input === "cover") b.cover = input.value.trim();
  });
  els.flowBody.querySelectorAll("[data-range]").forEach((input) => {
    const [key, index] = input.dataset.range.split(":");
    const next = [...b.criteria[key]];
    next[Number(index)] = input.value === "" ? Infinity : Number(input.value);
    b.criteria[key] = next;
  });
  els.flowBody.querySelectorAll("[data-select]").forEach((input) => {
    const key = input.dataset.select;
    if (key in b.criteria) b.criteria[key] = input.value;
    if (key in b.sort) b.sort[key] = input.value;
  });
  const allowRestricted = document.getElementById("allowRestricted");
  if (allowRestricted) {
    b.criteria.allowRestricted = allowRestricted.checked;
  }
}

function saveBuilderFeed() {
  syncBuilderFromDom();
  const existingIndex = state.feeds.findIndex((feed) => feed.id === state.builder.id);
  if (existingIndex >= 0) state.feeds[existingIndex] = state.builder;
  else state.feeds.push(state.builder);
  state.activeFeedId = state.builder.id;
  state.view = "home";
  closeFeedFlow();
  persistState();
  render();
}

function updateActiveFeed(patch) {
  const feed = getActiveFeed();
  Object.assign(feed.criteria, patch);
  persistState();
  render();
}

function updateActiveFeedSort(primary) {
  getActiveFeed().sort.primary = primary;
  persistState();
  render();
}

function field(label, key, value) {
  return `<div class="field"><label>${escapeHtml(label)}</label><input data-input="${key}" value="${escapeAttr(value)}" /></div>`;
}

function textarea(label, key, value) {
  return `<div class="field"><label>${escapeHtml(label)}</label><textarea data-input="${key}">${escapeHtml(value)}</textarea></div>`;
}

function rangeControl(label, key, value, min, max, step) {
  const high = Number.isFinite(value[1]) ? value[1] : "";
  return `
    <div class="range-control">
      <span class="mini-label">${escapeHtml(label)}</span>
      <div class="range-pair">
        <input data-range="${key}:0" type="number" step="${step}" min="${min}" max="${max}" value="${escapeAttr(value[0])}" />
        <input data-range="${key}:1" type="number" step="${step}" min="${min}" max="${max}" value="${escapeAttr(high)}" placeholder="Max" />
      </div>
      <div class="slider-pair">
        <input data-range="${key}:0" type="range" step="${step}" min="${min}" max="${max}" value="${escapeAttr(value[0])}" />
        <input data-range="${key}:1" type="range" step="${step}" min="${min}" max="${max}" value="${escapeAttr(high || max)}" />
      </div>
    </div>
  `;
}

function selectField(label, key, options, active) {
  return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <select data-select="${key}">
        ${options.map((option) => `<option value="${escapeAttr(option.key)}" ${option.key === active ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
      </select>
    </div>
  `;
}

function builderNav(finalLabel = "Next") {
  return `
    <div class="builder-actions">
      <button class="builder-btn" data-prev type="button">Back</button>
      <button class="builder-btn builder-btn--primary" data-next type="button">${escapeHtml(state.builderStep >= 4 ? finalLabel : "Next")}</button>
    </div>
  `;
}

function ruleChip(kind, value) {
  const b = state.builder;
  const includeKey = kind === "genre" ? "includeGenres" : "includeTags";
  const excludeKey = kind === "genre" ? "excludeGenres" : "excludeTags";
  const active = b.criteria[includeKey].includes(value);
  const excluded = b.criteria[excludeKey].includes(value);
  return `<button class="choice-chip ${active ? "is-active" : ""} ${excluded ? "is-excluded" : ""}" data-rule data-kind="${kind}" data-value="${escapeAttr(value)}" type="button">${escapeHtml(value)}</button>`;
}

function cycleBuilderRule(kind, value) {
  const c = state.builder.criteria;
  const includeKey = kind === "genre" ? "includeGenres" : "includeTags";
  const excludeKey = kind === "genre" ? "excludeGenres" : "excludeTags";
  if (!c[includeKey].includes(value) && !c[excludeKey].includes(value)) c[includeKey].push(value);
  else if (c[includeKey].includes(value)) {
    c[includeKey] = c[includeKey].filter((item) => item !== value);
    c[excludeKey].push(value);
  } else {
    c[excludeKey] = c[excludeKey].filter((item) => item !== value);
  }
}

function reasonsForEntry(entry, feed) {
  const c = feed.criteria;
  const reasons = [];
  if (between(entry.popularity, c.popularity)) reasons.push(`Popularity between ${formatRange(c.popularity)}`);
  if (entry.meanScore >= c.meanScore[0]) reasons.push(`Mean Score is ${entry.meanScore}, above ${c.meanScore[0]}`);
  if (entry.fanFav >= c.fanFav[0]) reasons.push(`Fan Fav is ${formatNumber(entry.fanFav)}%, above ${c.fanFav[0]}%`);
  if (matchesRelease(entry, c.releaseWindow)) reasons.push(`Matches ${getReleaseWindow(c.releaseWindow).label}`);
  const popGrowth = growth(entry, "popularity", c.growthWindow);
  if (popGrowth > 0) reasons.push(`Popularity grew by ${compactNumber(popGrowth)} in ${getGrowthWindow(c.growthWindow).label.replace("Growth ", "")}`);
  return reasons.slice(0, 5);
}

function getLabelForEntry(entry) {
  if (entry.popularity >= 100 && entry.popularity <= 3000 && entry.meanScore >= 75 && entry.fanFav >= 3) return state.labels.find((label) => label.id === "hidden-gem");
  if (growth(entry, "popularity", getActiveFeed().criteria.growthWindow) >= 100) return state.labels.find((label) => label.id === "breakout");
  return null;
}

function renderTags(values) {
  return values.length ? values.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("") : `<span class="tag">None</span>`;
}

function renderVibes(entry) {
  const active = state.vibes.filter((vibe) => vibe.mediaIds.includes(entry.id));
  return active.length ? active.map((vibe) => `<span class="tag">${escapeHtml(vibe.icon)} ${escapeHtml(vibe.name)}</span>`).join("") : `<span class="tag">No vibes yet</span>`;
}

function metricBox(label, value) {
  return `<span class="metric-box"><b>${escapeHtml(String(value))}</b><small>${escapeHtml(label)}</small></span>`;
}

function normalizeEntry(raw) {
  return {
    ...raw,
    id: String(raw.mediaId),
    displayTitle: raw.displayTitle || raw.englishTitle || raw.romajiTitle || "Untitled",
    genres: Array.isArray(raw.genres) ? raw.genres : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    synonyms: Array.isArray(raw.synonyms) ? raw.synonyms : [],
    meanScore: Number(raw.meanScore || 0),
    fanFav: Number(raw.fanFav || 0),
    popularity: Number(raw.popularity || 0),
    favourites: Number(raw.favourites || 0),
    chapters: Number(raw.chapters || 0),
    volumes: Number(raw.volumes || 0),
  };
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(APP_STATE_KEY) || "{}");
    state.view = saved.view || state.view;
    state.activeFeedId = saved.activeFeedId || state.activeFeedId;
    state.feeds = Array.isArray(saved.feeds) && saved.feeds.length ? saved.feeds : structuredClone(DEFAULT_FEEDS);
    state.labels = Array.isArray(saved.labels) && saved.labels.length ? saved.labels : structuredClone(DEFAULT_LABELS);
    state.vibes = Array.isArray(saved.vibes) && saved.vibes.length ? saved.vibes : structuredClone(DEFAULT_VIBES);
    state.library = Array.isArray(saved.library) ? saved.library : [];
    state.searchQuery = saved.searchQuery || "";
  } catch {
    persistState();
  }
}

function persistState() {
  localStorage.setItem(APP_STATE_KEY, JSON.stringify({
    view: state.view,
    activeFeedId: state.activeFeedId,
    feeds: state.feeds,
    labels: state.labels,
    vibes: state.vibes,
    library: state.library,
    searchQuery: state.searchQuery,
  }));
}

function toggleLibrary(id) {
  state.library = toggleArray(state.library, id);
  persistState();
  render();
}

function toggleArray(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function between(value, range) {
  const max = Number.isFinite(range[1]) ? range[1] : Infinity;
  return value >= range[0] && value <= max;
}

function matchesRelease(entry, releaseWindowKey) {
  const option = getReleaseWindow(releaseWindowKey);
  if (option.key === "all") return true;
  if (!entry.startDate && !entry.startYear) return false;
  const years = entry.startYear ? new Date().getFullYear() - entry.startYear : Infinity;
  if (option.mode === "year") return entry.startYear === new Date().getFullYear();
  if (Number.isFinite(option.days)) {
    const age = daysSinceStart(entry.startDate);
    return age >= -14 && age <= option.days;
  }
  return years >= option.minYears && years <= option.maxYears;
}

function containsEvery(values, selected) {
  if (!selected.length) return true;
  const normalized = new Set(values.map((value) => value.toLowerCase()));
  return selected.every((value) => normalized.has(value.toLowerCase()));
}

function containsAny(values, selected) {
  const normalized = new Set(values.map((value) => value.toLowerCase()));
  return selected.some((value) => normalized.has(value.toLowerCase()));
}

function growth(entry, metric, windowKey) {
  return Number(entry.growth?.[windowKey]?.[metric] || 0);
}

function dateValue(date) {
  if (!date) return 0;
  return Number(`${date.year || 0}${String(date.month || 1).padStart(2, "0")}${String(date.day || 1).padStart(2, "0")}`);
}

function daysSinceStart(date) {
  if (!date?.year) return Infinity;
  const start = new Date(Date.UTC(date.year, (date.month || 1) - 1, date.day || 1));
  return Math.floor((Date.now() - start.getTime()) / 86400000);
}

function compactMeta(entry) {
  return [entry.statusLabel || statusLabel(entry.status), entry.startYear || "", exposureStage(entry.popularity)].filter(Boolean).join(" / ");
}

function formatRelease(entry) {
  return `${statusLabel(entry.status)} / ${entry.startYear || "Unknown year"} / ${exposureStage(entry.popularity)}`;
}

function exposureStage(popularity) {
  if (popularity < 100) return "Unstable";
  if (popularity < 300) return "Hidden";
  if (popularity < 1000) return "Emerging";
  if (popularity < 3000) return "Breakout";
  if (popularity < 10000) return "Established";
  return "Mainstream";
}

function statusLabel(status) {
  return String(status || "Unknown").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function getReleaseWindow(key) {
  return RELEASE_WINDOWS.find((item) => item.key === key) || RELEASE_WINDOWS[0];
}

function getGrowthWindow(key) {
  return GROWTH_WINDOWS.find((item) => item.key === key) || GROWTH_WINDOWS[2];
}

function getSort(key) {
  return SORT_OPTIONS.find((item) => item.key === key) || SORT_OPTIONS[0];
}

function formatRange(range) {
  return `${compactNumber(range[0])}-${Number.isFinite(range[1]) ? compactNumber(range[1]) : "Max"}`;
}

function summaryForFeed(feed) {
  return `Pop ${formatRange(feed.criteria.popularity)} / Mean ${feed.criteria.meanScore[0]}+ / Fan Fav ${feed.criteria.fanFav[0]}%+`;
}

function searchText(entry) {
  return [entry.displayTitle, entry.romajiTitle, entry.englishTitle, entry.nativeTitle, entry.mediaId, ...entry.synonyms, ...entry.genres, ...entry.tags].join(" ").toLowerCase();
}

function chooseTitle(media, fallback) {
  return media.title?.english || chooseEnglishSynonym(media.synonyms || []) || fallback.displayTitle || media.title?.romaji || media.title?.userPreferred || "Untitled";
}

function chooseEnglishSynonym(values) {
  return values.find((value) => /^[\x00-\x7F]+$/.test(value) && /[a-z]/i.test(value)) || "";
}

function getCachedDetail(id) {
  if (state.detailCache.has(id)) return state.detailCache.get(id);
  try {
    const parsed = JSON.parse(localStorage.getItem(`${DETAIL_CACHE_PREFIX}${id}`) || "null");
    if (!parsed || Date.now() - parsed.savedAt > DETAIL_CACHE_TTL) return null;
    state.detailCache.set(id, parsed.detail);
    return parsed.detail;
  } catch {
    return null;
  }
}

function cacheDetail(id, detail) {
  state.detailCache.set(id, detail);
  try {
    localStorage.setItem(`${DETAIL_CACHE_PREFIX}${id}`, JSON.stringify({ savedAt: Date.now(), detail }));
  } catch {
    // Cache is best-effort.
  }
}

function createId(name) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
}

function compactNumber(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatNumber(value) {
  return Number(value || 0).toFixed(1).replace(/\.0$/, "");
}

function formatSynopsis(text) {
  const clean = escapeHtml(stripHtml(text || ""));
  if (!clean) return "No synopsis available.";
  return clean.split(/\n{2,}/).map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`).join("");
}

function stripHtml(value) {
  return String(value).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
