# Capitol Website API (v1) Reference

API spec source: `src/data/v1.json` (OpenAPI 3.0.4)

Base URL: `https://www.capitol.hawaii.gov/api`

## Authentication

| Step | Detail |
|------|--------|
| Request credentials | `POST /api/v1/access-requests` with org name, contact, email, intended use |
| Get token | `POST /connect/token` with `grant_type=client_credentials`, `scope=api` |
| Use token | `Authorization: Bearer <JWT>` header on all requests |

---

## Endpoint Groups

### 1. Hearing Notices

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/hearings/upcoming` | Upcoming hearings, ordered by date ascending |
| `GET /api/v1/hearings/upcoming?chamber=Senate` | Filter by chamber (`House` or `Senate`) |
| `GET /api/v1/hearings/upcoming?committee=AGR` | Filter by committee acronym |
| `GET /api/v1/hearings/by-date/{date}` | Hearings on a specific day (`yyyy-MM-dd` or `today`) |
| `GET /api/v1/hearings/measures-by-date/{date}` | Bills scheduled for hearings on a date |
| `GET /api/v1/hearings/by-measure/{billType}/{billNumber}` | Hearings linked to a specific bill (e.g. `HB/1000`) |
| `GET /api/v1/hearings/committees` | All committee acronyms (for dropdown filters) |

**Response shape** (HearingNoticeFileDto):
```json
{
  "comm": "AGR",
  "timedate": "2025-02-10T09:30:00",
  "room": "325",
  "streamUrl": "...",
  "chamber": "House",
  "htmlLink": "...",
  "pdfLink": "..."
}
```

---

### 2. Measure Detail (single bill lookup)

```
GET /api/v1/sessions/{sessionYear}/measures/{billType}/{billNumber}
    ?specialSession=1  (optional, for special session bills)
```

**Examples:** `/api/v1/sessions/2025/measures/HB/1000`, `/api/v1/sessions/2026/measures/SB/3335`

**Response** (MeasureDetailResponse):

| Field | Type | Contents |
|-------|------|----------|
| `measureInfo` | object | Bill type/number, title, report title, description, introducer, current referral, companion bills, package, act number, PDF/HTML/RSS URLs |
| `statusHistory` | array | `{ statusDate, statusText }` — chronological status updates |
| `committeeReports` | array | `{ fileName, linkHtml, linkPdf }` |
| `testimony` | array | `{ testimonyFilename, displayName, url }` |
| `hearingNotices` | array | `{ committee, timeDate, room, streamUrl, agendaUrl }` |
| `measureVersions` | object | `{ filesUnavailable, versions: [{ name, htmlUrl, pdfUrl, modified }] }` |
| `otherDocuments` | array | `{ name, pdfUrl }` |

This is the richest endpoint — gives you everything about a bill in one call.

---

### 3. Legacy Website Reports

All under `/api/v1/sessions/{sessionYear}/reports/legacy/...`

#### Discovery

| Endpoint | Description |
|----------|-------------|
| `GET .../catalog` | Lists all available report slugs, titles, categories, and required query params |
| `GET .../catalog?category=deadline` | Filter catalog by category |

**Categories:** `deadline`, `conference`, `appropriations`, `pending_actions`, `standing_committee`, `hearing_notices`, `carryover`, `resolutions_adopted`, `advise_consent`, `committee_referral`, `introducer`, `package`, `subject_search`

#### Key Reports (no query params needed)

| Slug | What it returns |
|------|-----------------|
| `acts` | Acts of the session |
| `billssignedbygovernor` | Bills signed by the Governor |
| `billsvetoedbygovernor` | Bills vetoed |
| `billspendinggovernorsaction` | Bills awaiting Governor action |
| `billsthatbecamelawwithoutgovernorsignature` | Self-explanatory |
| `governorsintenttoveto` | Governor's intent to veto |
| `governorsmessages` | Governor's messages |
| `listofvetooverrides` | Veto overrides |
| `billspassedlegislature` | All bills passed legislature |
| `resolutionsadopted` | Resolutions adopted |
| `carryoverhouse` / `carryoversenate` | Carryover measures |
| `housebillsincludingpriorbiennium` | House bills (current + prior year) |
| `senatebillsincludingpriorbiennium` | Senate bills (current + prior year) |
| `housebillswithactiontakenonly` | House bills with action in current year only |
| `senatebillswithactiontakenonly` | Senate bills with action in current year only |

#### Pending / Reading Status

| Slug | Description |
|------|-------------|
| `pendingsecondreadinghouse` / `pendingsecondreadingsenate` | Pending 2nd reading |
| `pendingthirdreadinghouse` / `pendingthirdreadingsenate` | Pending 3rd reading |
| `pendingfinalreadinghouse` / `pendingfinalreadingsenate` | Pending final reading |
| `pendingconcurrencehouse` / `pendingconcurrencesenate` | Pending concurrence |
| `measurespassedfinalreadinghouse` / `measurespassedfinalreadingsenate` | Passed final reading |

#### Crossover / Deadlines

| Slug | Description |
|------|-------------|
| `housebillscrossedoversenateincludingpriorbiennium` | HBs crossed to Senate |
| `senatebillscrossedoverhouseincludingpriorbiennium` | SBs crossed to House |
| `allbillsfirstlateraldeadline` | Bills past 1st lateral deadline |
| `allbillssecondlateraldeadline` | Bills past 2nd lateral deadline |
| `allbillspassedlegislatureordeckedfinalreading` | Passed or decked for final |
| `allbillssecondcrossoveramended` | Passed 3rd reading, amended by other chamber |
| `allbillssecondcrossoverunamended` | Passed 3rd reading, unamended |

#### Conference Committee

| Slug | Description |
|------|-------------|
| `conferencemeasuresallinconference` | All measures in conference |
| `conferencehearingsall` / `conferencehearingsfuture` / `conferencehearingspast` / `conferencehearingstoday` | Conference notices by timeframe |
| `conferencecommitteereportnumbers` | Conference committee report listing |
| `conferenceactionsheethouse` / `conferenceactionsheetsenate` | Action on measures with drafts |

#### Parameterized Reports

| Slug | Query Params | Description |
|------|-------------|-------------|
| `committeereferral` | `committee`, `committeeChamber`, `reportType` | Measures by committee. `reportType`: `all`, `pend`, `reported`, `recom`, `all_refer`, `fref_flat`, `fref_slat`, `wait_fdeck`, `wait_sdeck` |
| `introducerprimary` | `legislator` | Measures with legislator as primary introducer |
| `introducerfirstprimary` | `legislator` | First primary introducer |
| `introducerbyrequestprimary` | `legislator` | Primary introducer, by request |
| `introducercosponsor` | `legislator` | Co-sponsor |
| `introducerbyrequestcosponsor` | `legislator` | Co-sponsor, by request |
| `packagereport` | `packageKey` | Measures by package |
| `subjectsearch` | `q` | Text search across bill subjects |
| `adviseconsentreferredtocommittee` | `committee` | A&C measures referred to committee |
| `adviseconsentrecommittedtocommittee` | `committee` | A&C measures recommitted |
| `adviseconsentpendingincommittee` | `committee` | A&C measures pending |
| `conferenceassignmentslegislator` | `legislator` | Conference assignments for a legislator |
| `conferencehearingslegislator` | `legislator`, `timeFrame` | Conference notices for legislator (`all`, `today`, `past`, `future`) |
| `conferencemeasuresincommitteereferred` | `committee` | Conference measures referred to committee |
| `conferencehearingsforcommittee` | `committee` | Conference notices for committee |

---

### 4. Special Session Measures

```
GET /api/v1/sessions/{sessionYear}/special-sessions/{specialSession}/measures
```

Returns all bills for a special session with bill info, referral, introducer, and PDF links.

---

## Data Schemas (Key Types)

### MeasureInfoDto
```
billType, billNumber, year, measureTitle, reportTitle, description,
companion, companionLinks[], packageName, currentReferral, introducer,
pdfUrl, htmlUrl, rssUrl, actNo, actPdfUrl
```

### StatusHistoryDto
```
statusDate (datetime), statusText
```

### HearingNoticeFileDto
```
comm, timedate (datetime), room, streamUrl, chamber, htmlLink, pdfLink
```

### HearingNoticeWithMeasureDto
```
comm, timedate, room, streamUrl, billType, billNumber,
measureTitle, fullMeasureLabel, sessionType, htmlLink, pdfLink
```

### SpecialSessionMeasureSummaryDto
```
billType, billNumber, displayName, measureTitle, reportTitle,
description, companion, packageName, currentReferral, introducer,
pdfUrl, measureDetailUrl
```

---

## Useful Combos for Food+

| Use Case | Endpoint(s) |
|----------|-------------|
| Get full bill details + status history | `GET /sessions/{year}/measures/{type}/{num}` |
| Find upcoming hearings for tracked bills | `GET /hearings/by-measure/{type}/{num}` per bill |
| Monitor today's hearings | `GET /hearings/by-date/today` |
| Search for food-related bills | `GET /sessions/{year}/reports/legacy/subjectsearch?q=food` |
| Track bills through readings | Pending 2nd/3rd/final reading endpoints |
| See what crossed over | Crossover endpoints (house/senate) |
| Check governor actions | Signed/vetoed/pending governor endpoints |
| Get committee referral status | `committeereferral?committee=AGR&reportType=pend` |
| Find bills by legislator | `introducerprimary?legislator=DECOITE` |

---

## Notes

- Most legacy report endpoints return HTML (not JSON) — the catalog endpoint returns JSON.
- The measure detail endpoint is the most useful for Food+ since it returns structured JSON with status history, testimony, and hearing info.
- Bill types: `HB` (House Bill), `SB` (Senate Bill), `HR`, `SR`, `HCR`, `SCR`, `GM` (Governor's Message).
- Session years follow the biennium pattern: 2025/2026 are the current pair.
- Some endpoints reference "prior biennium" data (e.g., `housebillsincludingpriorbiennium` covers both 2025 and 2026).
