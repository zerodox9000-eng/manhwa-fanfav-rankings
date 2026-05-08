# ManhwaLens

A calm mobile-first AniList manhwa discovery app focused on customizable feeds, comparative ranking, Fan Fav %, mean score, popularity, and growth history.

## Product shape

- Opens on the `Hidden Gems` feed.
- Uses bottom navigation only: `Home`, `Feeds`, `Library`, `Search`.
- Feed cards show only cover, title, metadata, Mean, Fan Fav %, and Popularity.
- Genres, tags, vibes, reasons, synopsis, release info, and chapter info live inside the detail sheet.
- Users can create, edit, duplicate, and save local custom feeds.
- Feeds support popularity, mean score, Fan Fav %, favorites, release period, growth window, growth type, include/exclude genres and tags, and sort rules.
- Local library, vibes, custom feeds, and preferences are stored in browser storage.

## Data model

The app reads [`data/catalog.json`](./data/catalog.json), generated from AniList and refreshed daily.

Each catalog entry includes:

- title fields and synonyms
- cover images
- genres and spoiler-safe tags
- Fan Fav %, mean score, popularity, favorites
- status, release date, chapters, volumes
- first-seen date and growth windows

## Daily refresh

[`scripts/refresh-data.mjs`](./scripts/refresh-data.mjs) refreshes known entries, searches recent Korean manga/manhwa additions, recalculates Fan Fav %, stores history snapshots, and updates the catalog.

Manual commands:

```bash
npm run prepare:data
npm run refresh:data
```

## Hosting

- [`deploy-pages.yml`](./.github/workflows/deploy-pages.yml) deploys the static app to GitHub Pages.
- [`daily-refresh.yml`](./.github/workflows/daily-refresh.yml) refreshes AniList data daily.

Public URL:

`https://zerodox9000-eng.github.io/manhwa-fanfav-rankings/`
