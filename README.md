# CyberPulse News Radar

Multi-page cybersecurity intelligence site with a dashboard, threat intel feed, and a recent CVE tracker backed by SQLite and live APIs.

## Sources

- CISA cybersecurity advisories
- CISA alerts
- NCSC UK advisories
- Cisco Talos intelligence
- Palo Alto Unit 42 intelligence
- CrowdStrike intelligence
- Microsoft Security response and research
- Google Threat Analysis Group

## Stack

- Node.js + Express API
- SQLite via better-sqlite3
- RSS ingestion via rss-parser
- Static frontend (vanilla JS/CSS)

## Features

- Fast feed aggregation from trusted sources
- Historical archive (all ingested stories persist in `data/news.db`)
- Filter by source and date range
- Daily archive pulse for last 30 days
- Embedded live threat map widget from Kaspersky
- Multi-page navigation with a dashboard, threat intel page, and CVE page
- Manual refresh button + automatic background refresh every 30 minutes

## Run

```bash
npm install
npm start
```

Open: `http://localhost:4000`

## Pages

- `http://localhost:4000/` - Dashboard
- `http://localhost:4000/threat-intel` - Threat intel feed and map
- `http://localhost:4000/cves` - Recent CVEs and vulnerabilities
- `http://localhost:4000/kev` - Known exploited vulnerabilities / exploit watch
- `http://localhost:4000/forecast` - Cyber weather forecast and anticipated threats

## Easy start/stop commands

Run the app in the background as a local service:

```bash
npm run start:service
```

Stop it:

```bash
npm run stop:service
```

Check status:

```bash
npm run status:service
```

Restart it:

```bash
npm run restart:service
```

Watch logs:

```bash
npm run logs:service
```

## Manual ingestion

```bash
npm run ingest
```

## API

- `GET /api/news?source=&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=80&offset=0`
- `GET /api/meta`
- `POST /api/refresh`
- `GET /api/cves`
- `GET /api/kev`
- `GET /api/forecast`

## CVE ranking

The CVE page pulls the latest public vulnerabilities from NVD for the last 14 days and ranks them by a blended impact score that favors higher CVSS values and broader affected product scope.

## Exploit Watch / KEV ranking

The KEV page pulls CISA's Known Exploited Vulnerabilities feed, scopes to entries added in the current or previous year, and sorts by remediation urgency with emphasis on overdue deadlines and near-term due dates.

## Notes

- This app uses RSS feeds and stores snapshots for historical browsing.
- If a source changes feed format or URL, update `src/sources.js`.
