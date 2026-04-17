# Manhwa Fan Fav Rankings

A public, mobile-first static site for exploring AniList manhwa rankings bucketed by popularity and ordered by Fan Fav percentage.

## What the site does

- Opens on the `5000plus` leaderboard by default.
- Keeps every popularity bucket separate so lower-popularity titles are not ranked directly against the biggest titles.
- Shows only `Fan Fav %` and `Mean Score` on the outside list.
- Fetches cover image, synopsis, genres, and tags live from AniList when a title is opened.
- Caches detail responses in-browser for a faster repeat experience.

## Data model

The static ranking buckets live in [`data/`](./data):

- `5000plus.json`
- `1000to5000.json`
- `500to1000.json`
- `200to500.json`
- `50to200.json`
- `snapshot-meta.json`

Each entry is stored in the source-friendly shape:

```json
{
  "Title": "Example Title",
  "FAN FAV": 12.34,
  "Mean Score": 87,
  "Status": "FINISHED",
  "Start Year": 2020,
  "Popularity": 7349,
  "Favourites": 1070,
  "AniList URL": "https://anilist.co/manga/123456"
}
```

## Weekly refresh

The scheduled workflow runs [`scripts/refresh-data.mjs`](./scripts/refresh-data.mjs) once a week. It:

1. Reads the current bucket files to collect the AniList media IDs.
2. Fetches fresh AniList ranking fields in batches.
3. Recalculates `Fan Fav %` as `(favourites / popularity) * 100`.
4. Rebuilds the bucket files based on the latest popularity.
5. Writes a fresh `snapshot-meta.json`.
6. Commits the refreshed snapshot and deploys the site.

Manual commands:

```bash
npm run prepare:data
npm run refresh:data
```

## Hosting

- [`deploy-pages.yml`](./.github/workflows/deploy-pages.yml) deploys the static site to GitHub Pages on push to `main`.
- [`weekly-refresh.yml`](./.github/workflows/weekly-refresh.yml) performs the weekly refresh and deploys the updated snapshot.

Once GitHub Pages is enabled for the repository, the expected public URL is:

`https://zerodox9000-eng.github.io/manhwa-fanfav-rankings/`
