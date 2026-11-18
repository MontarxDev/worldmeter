# Worldmeter

Worldmeter is a live public-data board: earthquakes, disasters, markets, radiation, flights, and headlines on one page, with a globe, risk gauges, a news ticker, alert toasts, and honest source status.

It is a derivative of [Crucix](https://github.com/calesthio/Crucix) by calesthio, rebuilt for the Cloudflare Workers free plan. The interface is named **Worldmeter**. Crucix is credited in the footer and on this page. The license is the GNU AGPL v3 (see `LICENSE` and `NOTICE`).

The board sweeps **every 5 minutes**. That interval is the cron trigger in `wrangler.jsonc` and the copy in the UI.

## Run locally

Node.js 22 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars
npm test
npm run e2e
npm run dev
```

Open http://127.0.0.1:43123 . With no keys, the first request runs a sweep on the Worker. Sources that need a secret show **Not configured**. Sources that respond show **OK** only when the fetch returned items, plus the item count and the time of the last success. **Empty** means the request worked and the payload had nothing in it. **Error** means it failed, and the previous success time is kept.

`npm run e2e` builds the client and clicks the United States, Nigeria, Japan, and Australia on the globe and the flat map. It uses the Chrome binary at `/usr/bin/google-chrome`. The country outlines are `public/countries.geojson` (Natural Earth 110m, via world-atlas). The globe texture is `public/earth-day.jpg`. MapLibre’s worker is `public/maplibre-gl-worker.mjs` so the flat map does not need a tile key.

`npm run dev` builds the client, then starts Wrangler on port 43123. `.dev.vars` sets `SWEEP_INLINE=1` because Wrangler rewrites the local Host header to `news.montarx.com`, so the dev server cannot tell it is localhost from the request alone. That flag runs the sweep inside the page request. Do not set `SWEEP_INLINE` in production. The cron fans the work out so each invocation stays inside the free-plan CPU budget.

## Environment

Copy `.env.example` for the list. Local development reads [`.dev.vars`](https://developers.cloudflare.com/workers/configuration/secrets/). Production secrets are set with `wrangler secret put` and are not stored in `wrangler.jsonc`.

| Variable | Source | Signup |
| --- | --- | --- |
| `SWEEP_SECRET` | Shared secret for the cron fan-out. Any long random string. | — |
| `OPENSANCTIONS_API_KEY` | OpenSanctions search | https://www.opensanctions.org/api/ |
| `RELIEFWEB_APPNAME` | ReliefWeb **v2** appname. v1 is retired (HTTP 410). | https://apidoc.reliefweb.int/parameters#appname |
| `CLOUDFLARE_RADAR_TOKEN` | Radar outage annotations. Token permission: Account Analytics Read. | https://dash.cloudflare.com/profile/api-tokens |
| `ACLED_EMAIL`, `ACLED_PASSWORD` | ACLED OAuth password grant | https://acleddata.com/register/ |
| `FRED_API_KEY` | Optional FRED series (fed funds, CPI). The yield-curve and HY gauges use public CSVs and do not need this. | https://fred.stlouisfed.org/docs/api/api_key.html |
| `EIA_API_KEY` | Optional WTI spot | https://www.eia.gov/opendata/register.php |
| `FIRMS_MAP_KEY` | Optional NASA FIRMS thermal detections | https://firms.modaps.eosdis.nasa.gov/api/area/ |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | Optional r/worldnews listing | https://www.reddit.com/prefs/apps |

`SOURCE_REPO_URL` is a plain var in `wrangler.jsonc`, not a secret. It is set to `https://github.com/MontarxDev/worldmeter`, and the footer **Source code** link points there. Upstream Crucix remains linked either way.

Do not name the Radar token `CLOUDFLARE_API_TOKEN`. Wrangler uses that name for deploy credentials.

## What the gauges are

Each gauge is a 0–100 score from one named series. The formula is on the card.

| Gauge | Input | Score |
| --- | --- | --- |
| VIX | CBOE VIX last price from Yahoo Finance | `clamp(level / 40 × 100, 0, 100)` |
| 10Y–2Y Treasury | FRED `T10Y2Y` public CSV | `clamp((1.25 − spread) / 2.5 × 100, 0, 100)` |
| GSCPI | NY Fed Global Supply Chain Pressure Index, latest vintage | `clamp((value + 2) / 5 × 100, 0, 100)` |
| HY OAS | FRED `BAMLH0A0HYM2` public CSV | `clamp(oas / 8 × 100, 0, 100)` |
| USGS M4.5+ (24h) | Count of USGS events in the last 24 hours, cap 50 | `clamp(count / 25 × 100, 0, 100)` |

Market percents are `(last − prior session close) / prior session close`. The prior close is the previous daily bar, or last price minus Yahoo's session dollar change. It is never the first close in a multi-day chart (`chartPreviousClose`), which made VIX look like +45% when the session move was about +14%, and the S&P look like about −2.5% when the session move was about −1.2%.

## Alerts

- **Earthquakes.** USGS PAGER color and the tsunami flag decide the tier. An M6+ with a green PAGER is routine, not a flash. Red, or orange at M6.5+, or a tsunami flag at M7+, is a flash.
- **Radiation.** A flash or priority toast needs a real jump over that sensor's baseline (at least 3× and a minimum absolute rise, sample newer than 48 hours) **and** a nearby reading from the other network (Safecast and EPA RadNet within 800 km). One sensor is routine at most. Two Safecast sites do not corroborate each other.
- Toasts are only flash and priority. They sit in the page under the ticker, in a row on a wide screen and stacked on a phone, so they do not cover the header, the gauges, or the map.

EONET is labeled as events in the last 30 days, not as “open” incidents.

## Sources

| Source | Auth | Notes |
| --- | --- | --- |
| USGS earthquakes | None | M4.5+ for 24h, PAGER and tsunami flag. Global, including Africa. |
| NASA EONET | None | Events in the last 30 days. |
| GDACS | None | Current disaster list and alert color. |
| NOAA/NWS | None | Active alert count, extreme alerts plotted. |
| BBC World | None | RSS. |
| The Guardian | None | World RSS. |
| Al Jazeera | None | RSS. Added for coverage outside the US/UK wires. |
| WHO | None | English news RSS. |
| NYT World, Americas, Africa, Asia | None | New York Times RSS. |
| NPR | None | World feed, then the main news feed if that one fails. |
| BBC Tech, BBC Science | None | HTTPS RSS. |
| DW, DW Africa | None | Deutsche Welle English RSS. |
| France 24, Euronews, RFI | None | European and African English RSS. |
| Africa News | None | Africanews RSS. |
| SBS Australia, Indian Express, The Hindu, MercoPress | None | Regional RSS. |
| GDELT | None | DOC 2.0 article list, up to 20 articles. A 429 or timeout waits five seconds and retries once, in its own batch. |
| Yahoo Finance | None | Six symbols. Session change uses the prior close. |
| Frankfurter / ECB | None | USD crosses, including ZAR and NGN. |
| US Treasury debt | None | Debt to the penny. Shown as a figure, not a gauge. |
| FRED 10Y–2Y CSV | None | Public graph CSV. |
| FRED HY OAS CSV | None | Public graph CSV for BAMLH0A0HYM2. |
| NY Fed GSCPI | None | Latest vintage of the supply-chain index. |
| BLS unemployment | None | `LNS14000000` via the public API. |
| Open-Meteo | None | Eight cities, including Lagos, Nairobi, Johannesburg, and Cairo, so Africa is not an empty camera. |
| CISA KEV | None | Catalog header and the newest CVEs. The file is large; the Worker reads the head. |
| CelesTrak | None | Stations group (ISS and crew vehicles). |
| ISS position | None | wheretheiss.at. Added because a TLE list has no ground position. |
| NASA DONKI | None | Space-weather notices, NASA `DEMO_KEY`. |
| adsb.lol | None | Military sample plus Nairobi, Johannesburg, and Cairo. The name on the panel is adsb.lol, not ADS-B Exchange. |
| Safecast | None | Chernobyl, Zaporizhzhia, Los Angeles, and New York samples. |
| EPA RadNet | None | Near-real-time gamma dose from the official RadNet CSV for Los Angeles and New York. The Envirofacts table is gone. The Worker keeps the tail of the year file. |
| OFAC SDN | None | Official `SDN.XML`. The publication header (record count and publish date) is cached in the snapshot. The full file is tens of megabytes and is not parsed inside a free-plan invocation. |
| Bluesky | None | Public search. A 403 stays an error. |
| OpenSanctions | Key | Not configured until `OPENSANCTIONS_API_KEY` is set. |
| ReliefWeb v2 | Appname | Not configured until `RELIEFWEB_APPNAME` is set. |
| Cloudflare Radar | Token | Not configured until `CLOUDFLARE_RADAR_TOKEN` is set. |
| ACLED | OAuth | Not configured until email and password are set. |
| FRED API | Key | Optional. |
| EIA | Key | Optional. |
| NASA FIRMS | Key | Optional. NOAA-20 for Nigeria and southern California, then NOAA-21, then MODIS, when a feed is empty or errors. |
| Reddit | OAuth | Optional. |

### Added beyond a straight port, and why

- **CISA KEV** — exploited vulnerabilities, no key, small enough to summarize.
- **GDACS** — the same disasters newsrooms already watch, with a real alert color.
- **Cloudflare Radar** — outage annotations once a token exists.
- **NASA EONET, USGS, Frankfurter/ECB, BBC, Guardian** — named on their own rows instead of being folded into a bundle that shared one timestamp.
- **Open-Meteo** — no key, and it places real observations in Africa and South America.
- **Al Jazeera** — a non-Atlantic wire in the ticker.
- **Regional RSS** — NYT desks, NPR, BBC science and tech, DW, France 24, Euronews, RFI, Africa News, SBS, Indian Express, The Hindu, and MercoPress. Each feed is a short HTTPS request. Headlines that name a place are pinned on that place and say so. A feed that publishes coordinates uses those instead.
- **GDELT backoff** — one extra try after five seconds, only inside the GDELT batch, so a 429 does not stall the other feeds.
- **ISS position** — a single live lat/lon next to the CelesTrak element count.
- **FRED public CSVs** for the yield curve, high-yield spread, broad dollar, initial claims, 30-year mortgage, and M2. The FRED API remains a separate, optional source.
- **Oil-transit chokepoints** as fixed geography. They are not a vessel feed.

### Crucix views

Crucix is the upstream dashboard (`dashboard/public/jarvis.html`). Worldmeter keeps the behavior that can run on the Workers free plan with data this sweep already has, or with a free keyless request.

| Crucix view | Worldmeter |
| --- | --- |
| 3D globe, drag, zoom, markers | Board, 3D globe. three.js through globe.gl, with a NASA earth texture and Natural Earth country polygons. The globe code loads only when that view opens. |
| Flat map, pan, zoom | Board, Flat map. MapLibre draws the same country GeoJSON. No tile key. |
| Region filters | Region buttons. |
| News ticker | Ticker, up to 36 stories, doubled so the track can scroll. A click opens the detail card. |
| News list | News view, and the wire beside the markets. A country click filters both. |
| Risk gauges | Risk gauges, with the formula under each bar. |
| Markets | Markets, and the Macro view grouped into indexes, energy, metals, and crypto, with the daily sparkline. |
| Legend and layer toggles | Legend under the map. Each button uses the same icon and colour as the marker. |
| Sensor grid | Sensors view. |
| Nuclear watch | Nuclear view, from Safecast and EPA RadNet. |
| Space watch | Space view: ISS, the CelesTrak stations count, and DONKI. |
| Maritime chokepoints | Chokepoint markers. |
| Signal core counts | On the Sensors view. |
| Sweep delta | Delta view, and one line under the gauges. |
| Cross-source signals | Signals panel. Toasts sit under the ticker. |
| What signals mean | Glossary view. |
| Full / lite visuals | Full and Lite. Lite stops the ticker and the auto-rotate, and starts on the flat map. |
| Source list | Sources panel. |
| Click a marker or a card for detail | Detail card, with Open source. A located item turns the map to it. |

### Left out, and why

- **AISStream ship tracking.** It is a websocket. A free Worker invocation cannot hold that stream. The chokepoint markers are the static substitute, not live traffic.
- **KiwiSDR coverage.** Crucix scraped a page. There is no stable record.
- **Telegram OSINT channels and the OSINT map dots.** Those were scraped channel posts. They are not a feed with an item URL.
- **Animated flight corridors.** Crucix drew those from OpenSky theater totals. Invented arcs would show traffic that was not measured. Flight markers are the adsb.lol positions.
- **Starlink, OneWeb, and military satellite catalogs.** The files are megabytes. A free Worker has about 10 ms of CPU, so only the CelesTrak stations group is fetched.
- **USPTO / PatentsView.** The old open API now expects a key and is not a live situational feed.
- **ADS-B Exchange.** The flight layer is adsb.lol. The paid ADS-B Exchange API is not called.
- **OpenSky.** Anonymous access is heavily rate limited. adsb.lol covers flights.
- **UN Comtrade.** Monthly trade, and the current API is keyed. Not a 5-minute monitor.
- **LLM trade ideas and AI alert classification.** They need a model key and a long call. The rule-based signals stay.
- **Telegram bot and Discord bot.** They need long-lived credentials and are not a dashboard view.
- **Cinematic boot sequence.** It delayed the board without adding data.
- **“Wartime stagflation” chip.** Crucix hardcoded that sentence. It is not computed from a series.
- **IODA outage API.** It returned HTTP 500 during development, so it is not listed as a source.
- **A 15-minute sweep.** Worldmeter sweeps every 5 minutes. The Sources panel is the integrity list: status, count, and last success.

## Deploy on Cloudflare (free plan)

Do this from a machine logged into the Cloudflare account that already hosts `montarx.com`. This repo does not deploy itself, and it does not add GitHub Actions.

The Worker is static assets plus one script. A cron every 5 minutes (`*/5 * * * *`) POSTs to `/internal/sweep`, which fans out to batch routes. Each batch is its own invocation, because the free plan allows about **10 ms of CPU** and **50 external subrequests** per invocation. One KV write stores the merged snapshot: 288 writes a day, well under the free 1,000. A 2-minute cron was 720 writes a day and set off Cloudflare's 50% KV warning, so keep the interval at 5 minutes or longer on the free plan. Reads use the Cache API and a 60 second KV cache TTL so the board does not burn the 100,000 daily reads. Free accounts also allow only a handful of cron triggers per account; this Worker uses one.

`compatibility_flags` must include `global_fetch_strictly_public`. Without that flag the Worker cannot reach its own batch routes, and every source reports “Sweep did not report this source.”

```bash
npm install
npm test
npm run build
```

`kv_namespaces[0].id` is the live `SNAPSHOTS` namespace, `14d746f0087748b88fcfc21a8afbe585`. `vars.SOURCE_REPO_URL` is already `https://github.com/MontarxDev/worldmeter`. Keep both, and keep `global_fetch_strictly_public`, so a later `wrangler deploy` matches https://news.montarx.com.

Secrets, if you still need to set any:

```bash
npx wrangler secret put SWEEP_SECRET
npx wrangler secret put OPENSANCTIONS_API_KEY
npx wrangler secret put RELIEFWEB_APPNAME
npx wrangler secret put CLOUDFLARE_RADAR_TOKEN
npx wrangler secret put ACLED_EMAIL
npx wrangler secret put ACLED_PASSWORD
npx wrangler secret put FRED_API_KEY
npx wrangler secret put EIA_API_KEY
npx wrangler secret put FIRMS_MAP_KEY
npx wrangler secret put REDDIT_CLIENT_ID
npx wrangler secret put REDDIT_CLIENT_SECRET

npx wrangler deploy
```

`wrangler.jsonc` attaches the custom domain `news.montarx.com`. The zone for `montarx.com` has to be on the same account. `workers_dev` is off so the board is not also published on a `*.workers.dev` host. Skip any secret you do not have; that source stays **Not configured**. `SWEEP_SECRET` is the one the cron needs. Without it the scheduled sweep logs and exits, and the site keeps serving the last snapshot.

`wrangler secret put` deploys a new version. Set secrets before the first deploy if you want the first cron to succeed, or deploy first and put the secret immediately after.

Check it:

```bash
curl -s https://news.montarx.com/api/health
```

Logs and traces are enabled in the Wrangler config. Free-plan log volume is enough for a 5-minute cron.

## Tests

```bash
npm test
```

Covers prior-session market math (including the stale 5-day base), earthquake and radiation thresholds, per-source status (OK only with data, separate timestamps, not-configured keys), gauge formulas, African coordinates, the adsb.lol name, and that this README and the cron both say 5 minutes, and that the sweep stays under 500 KV writes a day.

## License

GNU AGPL v3. See `LICENSE`. A public network deployment must offer its source. Use the footer **Source code** link and `SOURCE_REPO_URL`.
