# Peakhwa Discovery

A public smartphone-first AniList manhwa discovery app powered by Fan Fav %, mean score, daily snapshots, and growth history.

## What the site does

- Opens on `Discovery -> Most Relevant -> 7 Days`.
- Uses a premium glass/OLED mobile interface with bottom navigation.
- Shows dense cover cards with title, Fan Fav %, mean score, popularity lane, and discovery badges.
- Supports `Discovery`, `Top Lists`, `New`, `Saved`, and an advanced filter sheet.
- Saves theme, filters, search, sort, selected page, and saved titles in browser storage.
- Uses English AniList titles first, then English-looking synonyms, then romaji fallback.
- Opens a detail sheet with full uncropped cover, synopsis, genres, tags, stats, and AniList link.

## Data model

The main app reads [`data/catalog.json`](./data/catalog.json). The legacy bucket files are still regenerated for compatibility, but the UI now uses the catalog.

Each catalog entry includes:

- `displayTitle`, `englishTitle`, `romajiTitle`, `synonyms`
- `coverImage`, `coverImageSmall`, `bannerImage`
- `genres`, spoiler-safe `tags`
- `fanFav`, `meanScore`, `popularity`, `favourites`
- `status`, `startDate`, `chapters`, `volumes`
- `firstSeen`, `lastUpdated`, and per-window `growth`

## Daily refresh

The scheduled workflow runs [`scripts/refresh-data.mjs`](./scripts/refresh-data.mjs) every day. It:

1. Refreshes all known AniList media in batches.
2. Searches AniList for recent Korean manga/manhwa releases from the last 45 days.
3. Adds newly discovered entries to the catalog.
4. Recalculates `Fan Fav %` as `(favourites / popularity) * 100`.
5. Stores dated history snapshots under `data/history/`.
6. Computes growth windows for 1 day, 3 days, 7 days, 14 days, 30 days, 90 days, 180 days, 1 year, and all time.
7. Commits refreshed data and deploys GitHub Pages.

Manual commands:

```bash
npm run prepare:data
npm run refresh:data
```

## Hosting

- [`deploy-pages.yml`](./.github/workflows/deploy-pages.yml) deploys the static site to GitHub Pages on push to `main`.
- [`daily-refresh.yml`](./.github/workflows/daily-refresh.yml) refreshes data daily and deploys the updated catalog.

Public URL:

`https://zerodox9000-eng.github.io/manhwa-fanfav-rankings/`
