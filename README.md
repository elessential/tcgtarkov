# Tarkov TCG

A local, single-player trading-card companion for Escape from Tarkov. Convert manually entered raid XP to coins, open trader packs, collect cards, craft missing cards with duplicate scrap, and send pack reveals to a transparent OBS browser source.

> Tarkov TCG is an independent fan project and is not affiliated with or endorsed by Battlestate Games. Item names and artwork belong to their respective owners. This project is for non-commercial fan use.

## Requirements

- Node.js 20.19+ (Node 24 recommended)
- npm
- Network access to `https://json.tarkov.dev` for the item-data spike and seed

## Run locally

```cmd
copy .env.example .env
npm install
npm run db:generate
npm run db:push
npm run spike
npm run seed
npm run dev
```

Open `http://localhost:5173`. The Express API uses port 3000 and the Vite dev server proxies API requests to it. The SQLite database is local and is not committed.

To run the Playwright smoke test, install its browser once with `npx playwright install chromium`.

The seeder uses tarkov.dev's public JSON endpoints for trader inventories and item data, plus the `_en` endpoint for English names. If the upstream API is unavailable, `npm run spike` and `npm run seed` fail with an explicit error rather than writing fabricated data. The spike report is written to `reports/m0-data-spike-<mode>.json` when the service responds.

Set `TARKOV_GAME_MODE=pve` in `.env` before running `npm run spike` and `npm run seed` to seed a separate PvE pool. Both modes can be kept in the same database. The selected mode in Settings scopes collection, ledger, pity, and pack history.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API and Vite development server |
| `npm run build` | Type-check and create the production client bundle |
| `npm start` | Start the production API and serve `dist/` if it exists |
| `npm test` | Run deterministic game-logic tests |
| `npm run test:e2e` | Run the Playwright OBS-overlay smoke test (requires Chromium and a pushed local database) |
| `npm run spike` | Query trader data and write the M0 pool report |
| `npm run seed` | Upsert trader pools and cache item images locally |
| `npm run simulate` | Monte Carlo pool completion, Legendary, and duplicate-value estimates |

Pool blocklist and item-specific rarity overrides live in `src/server/pool-config.ts`. The seeder only downloads images; opening packs uses SQLite and cached images and does not call external services.

Settings includes item-class toggles, including ammunition/bullets. Disabled classes are excluded from pack draws and hidden from the active collection, but owned cards are preserved and return when re-enabled. Items tagged with multiple classes are excluded if any tagged class is disabled.

## OBS

1. Start the app and add an OBS **Browser Source**.
2. During `npm run dev`, use `http://localhost:5173/overlay?hud=true`; after a production build and `npm start`, use `http://localhost:3000/overlay?hud=true`. Set the source to 1920 × 1080.
3. Keep the background transparent. Enable **Shutdown source when not visible** and **Refresh browser when scene becomes active**.
4. Use **Test Overlay** in Settings. Set `overlayMode` to **synced** to reveal cards only as they are flipped in the dashboard.

For local use, Settings can generate a per-overlay token and show the URL once; regenerate it if it is exposed. For hosted deployments, set a long random `OVERLAY_TOKEN` and use `?key=<token>` in the overlay URL. Keep the token private. The API is designed for local single-user operation and does not provide multi-user authentication.

## Notes

- Pack RNG, balance changes, crafting and pity updates are server-side.
- The ledger is append-only during normal use; undo creates reversal entries. Pack undo is limited to the newest pack.
- XP input is manual. No game client integration is used.
- No marketplace, real-money purchases, or third-party trades are included.
