# MSC Event Management

MSC Event Management is a browser-based Middle School Council planning workspace. It combines a spatial event plan, calendar import, approval workflow, contacts/email automation, venue mapping, budgets, persistent boards and live collaboration.

**Current stability baseline: v26.** v25 remains the stable functional core; v26 is a visual-only Aero/control polish layer. Optional server-backed features are still lazy-loaded only when opened.

## Feature stability matrix

| Area | Feature | Runtime owner | Status | Notes |
|---|---|---|---|---|
| Core | Overview dashboard | `app-core.js`, `app-v23-page-kernel.js` | Stable | Upcoming events, approval/issue summaries and budget metrics. |
| Core | Events table | `app-v23-page-kernel.js` | Stable | Paginates large schedules instead of building an unlimited table. |
| Core | Status workflow | `app-views.js` | Stable | Not started → Planning → Awaiting approval → Ready → Completed. |
| Core | Budget | `app-views.js` | Stable | Planned/actual totals and event records. |
| Plan | Pan canvas | `app-bind.js` | Stable | Mouse drag, Space + drag, trackpad/two-axis scroll and Shift + wheel. |
| Plan | Zoom | `app-bind.js`, `app-integrations.js` | Stable | Buttons and Ctrl/Cmd + wheel around the pointer. |
| Plan | Drag event blocks | `app-bind.js`, `app-integrations.js` | Stable | Buttons inside the block handle no longer accidentally start a drag. |
| Plan | Inline event editing | `app-v23-page-kernel.js` | Stable | Quick edit plus full event drawer. |
| Plan | Connections | `app-v24-safe-planner.js` | Stable | Click `＋`, then another event. No prompt-based connection flow. |
| Plan | Connection node editor | `app-v24-safe-planner.js` | Stable | One editor only: label, solid/dashed, color, branch, auto route, reverse and delete. |
| Plan | Movable connection nodes | `app-v24-safe-planner.js` | Stable | Nodes avoid event cards/other visible nodes and save manual routing. |
| Plan | Large-board virtualization | `app-v23-page-kernel.js` | Stable | Auto at 20+ events; only nearby cards are rendered. Can be changed in Options. |
| Calendar | ICS / iCal import | `app-integrations.js`, `app-v21-large-import.js` | Stable | Large previews are paginated 60 rows at a time. |
| Calendar | JSON import/export | `app-integrations.js` | Stable | Import common event JSON shapes and export the complete board state. |
| Calendar | PDF calendar import | `app-v8-pdf.js` | Stable for text PDFs | Uses PDF.js text extraction. Scanned/image-only PDFs are not OCR'd. |
| Calendar | Bulk import pipeline | `app-v21-large-import.js` | Stable | Bulk insert, one local snapshot, browser yields, then deferred online sync. |
| Calendar | Month chunks | `app-v24-safe-planner.js`, `app-v23-page-kernel.js` | Stable | Imported events auto-sort by month once and get a visible month box. |
| Calendar | Chunk controls | `app-v25-contacts-settings.js` | Stable | Toggle boxes, auto-sort, cards-per-row and manual re-sort in Options. |
| Contacts | Add/edit/delete contacts | `app-v25-contacts-settings.js` | Stable | Button-driven; no native form reload. Roles update event approval selectors immediately. |
| Email | Built-in email presets | `app-v25-contacts-settings.js` | Stable | Approval request, Event reminder and Budget review. |
| Email | Custom presets | `app-v25-contacts-settings.js` | Stable | Create, edit, duplicate, delete and select a default preset without reloading. |
| Email | Explicit recipient selection | `app-v25-contacts-settings.js` | Stable | Event approval role, a specific contact, or any contact with a selected role. |
| Email | Event variables | `app-v25-contacts-settings.js` | Stable | `{event_name}`, `{date}`, `{date_short}`, `{venue}`, `{lead}`, `{budget}`, `{deadline}`, `{objective}`, `{status}`, `{approval_status}`, `{contact_name}`, `{contact_role}`, `{board_url}`. |
| Email | Manual event composer | `app-v25-contacts-settings.js` | Stable | Pick event + preset, edit rendered subject/body, then send. |
| Email | Awaiting-approval automation | `app-v25-contacts-settings.js` | Stable | Optional per-preset auto trigger when an event enters Awaiting approval. Deduplicates repeated sends. |
| Email | Per-user Email API config | `app-v25-contacts-settings.js` + Supabase `email-config` | Server-backed | Resend sender/API key/domain allowlist is account-specific. Secret is stored encrypted server-side and is never returned to the browser. |
| Email | Server send | Supabase `send-approval-email` | Server-backed | Signed-in JWT required; user sender config is checked before default server config. |
| Boards | Create/open board | `app-v10-boards.js` | Lazy / stable | Loaded only when Boards or Share is opened. |
| Boards | Autosave + history | `app-v9-persistence.js`, `app-v10-boards.js` | Lazy / stable | Persistent snapshots and recovery checkpoints. |
| Boards | Rename/delete/remove | `app-v10-boards.js`, `app-v11-sharing-fixed.js` | Lazy / stable | Rename uses the board-first flow rather than the old prompt route. |
| Share | Board-first sharing | `app-v11-sharing-fixed.js` | Lazy / stable | Share belongs to the current board. Owner controls “Anyone with link can join.” |
| Collaboration | Realtime presence/cursors/moves | `app-online.js`, Supabase Realtime | Server-backed | Local mode still works if online services fail. |
| Account | Google sign-in | `app-online.js` | Config-dependent | Requires Google provider credentials in Supabase Auth. |
| Account | Switch account | `app-v25-contacts-settings.js` | Stable | Local-scope sign-out followed by Google account chooser. |
| Venues | OpenStreetMap | `app-osm.js` | Lazy / stable | Loaded only when Venues is opened. |
| Venues | Venue search | `app-v8-osm-search.js` | Lazy / stable | Explicit Nominatim search with throttling/cache; no Google Maps key required. |
| Appearance | Dark / Light / System | `app-v25-contacts-settings.js` | Stable | Saved per browser. |
| Appearance | Frutiger Aero Easter egg | `app-v25-contacts-settings.js` + `features-v17.css`–`features-v26.css` | Stable | Unlock with five clicks on the small ✦ in Appearance. |
| Appearance | Frutiger Aero wallpaper | `assets/aero-wallpaper-v26.jpg`, `features-v26.css` | Stable | Uses the v26 attached grass/city wallpaper, scaled to cover with the same minor blur and no tint/brightness/saturation change. |
| Appearance | Aero typography | `features-v17.css` | Stable | Helvetica Neue/Helvetica/Arial; bold Aero UI typography and no black/dark Aero text. |
| Accessibility | Reduce motion | `app-v25-contacts-settings.js`, `features-v25.css`, `features-v26.css` | Stable | Disables non-essential animation/transitions; v26 polish respects the same setting. |
| Help | Onboarding tutorial | `app-v25-contacts-settings.js` | Stable | Uses the actual running UI, a website cursor overlay, and lazy live UI captures when html2canvas is available. |
| Audio | Aero soundtrack URL player | `app-v26-aero-polish.js`, `MSC_CONFIG.aeroTracks` | Ready for authorized audio | Restored glossy previous/play/next/volume player appears in Aero mode and automatically uses configured authorized server URLs. Copyrighted uploaded tracks are not bundled into the public repo. |

## v26 stability rules

The earlier app accumulated many enhancement layers that independently replaced `render()`, `plan()`, `setView()` and `save()`. That made unrelated features capable of breaking one another. v26 keeps the v25 functional architecture and follows these rules:

1. **One owner per core interaction.** `app-bind.js` owns canvas/event pointer input, the v23 kernel owns Plan rendering/virtualization, and `app-v24-safe-planner.js` owns graph connections.
2. **No body-wide MutationObserver in the core runtime.** Legacy body-wide observers are blocked when the remaining lazy sharing module loads. The only observer used by the v25 loader is scoped to the Boards view.
3. **Optional services cannot block startup.** Boards/Share and OSM load only when requested. A map/server failure does not prevent local planning.
4. **Native form navigation is avoided for app editors.** Contact and preset saves use normal buttons and in-place state updates.
5. **Large imports are transactions.** Parse/review, bulk add, month arrange, local save, draw, then delayed online sync.
6. **Large Plan DOM is bounded.** With optimization enabled, only events near the viewport are mounted; graph repaint during drag is limited to those rendered cards.

## Smoke-test checklist

Run this after changes that touch startup, Plan, Contacts, import, or lazy feature loading:

- [ ] Page reaches an interactive Plan without a loading loop.
- [ ] Empty-canvas drag pans the Plan.
- [ ] Space + drag pans; trackpad/wheel scroll still works.
- [ ] Dragging an event changes its saved world position.
- [ ] Clicking a block edit/connect button does not start a drag.
- [ ] `＋` → another event creates one connection.
- [ ] Clicking a connection node opens exactly one node editor.
- [ ] Node drag saves manual routing.
- [ ] Import button opens the import modal.
- [ ] 100+ ICS items show a paginated preview and import without blocking the UI.
- [ ] Imported events are grouped into month chunks when enabled.
- [ ] Contacts opens; Save contact updates the list and approval-role selectors without navigation.
- [ ] The three built-in email presets appear.
- [ ] Save preset does not reload/navigate and retains its recipient target.
- [ ] Manual composer resolves the selected contact/role.
- [ ] Options opens and large-calendar controls update state.
- [ ] Five ✦ clicks unlock Frutiger Aero; Aero displays the v26 grass/city wallpaper and Aero typography/colors.
- [ ] The glossy Aero soundtrack player appears in Frutiger Aero mode.
- [ ] Boards opens on demand; create/open/history controls render.
- [ ] Share opens the board-first sharing UI.
- [ ] Venues loads OSM on demand and a map failure does not break other views.

### Large-board browser test baseline

The v25 browser smoke harness was run with synthetic imported schedules after the consolidation:

| Events in board | Plan render call | Event cards mounted | Month boxes |
|---:|---:|---:|---:|
| 100 | ~5.4 ms | 60 | 12 |
| 300 | ~4.1 ms | 59 | 12 |
| 1,000 | ~7.4 ms | 70 | 12 |

These numbers are diagnostic baselines from the automated headless Chromium test environment, not guaranteed end-user timings. The important invariant is that DOM card count stays bounded rather than growing linearly with the full calendar.

## Architecture

### Always-loaded core

- `app-core.js` — state/data model and common helpers.
- `app-views.js` — base Overview/Events/Status/Calendar/Venues/Budget renderers and event drawer.
- `app-online.js` — Supabase Auth + Realtime primitives.
- `app-integrations.js` — block movement, zoom, base ICS/JSON import/export.
- `app-v23-page-kernel.js` — active-view rendering, Plan virtualization and large Events pagination.
- `app-v24-page-controller.js` — deterministic navigation; prevents legacy wrapper chains from owning page changes.
- `app-v24-safe-planner.js` — graph connections, node editor and month arrangement.
- `app-v8-pdf.js` — PDF import integration.
- `app-v21-large-import.js` — non-blocking bulk import pipeline.
- `app-bind.js` — core event/pointer/keyboard bindings; all optional-element bindings must be null-safe.
- `app-v25-contacts-settings.js` — stable Contacts, email presets, Options/themes, Email API UI and tutorial.
- `app-v26-aero-polish.js` — Aero soundtrack UI only; no render/save/setView wrappers.

### Lazy-loaded features

`app-v25-feature-loader.js` loads only:

- Boards/Share: `app-v9-persistence.js`, `app-v10-boards.js`, guarded `app-v11-sharing-fixed.js`.
- Venues map: Leaflet, `app-osm.js`, `app-v8-osm-search.js`.

Old v8/v9 planner wrappers and old v14–v19 Contacts/Aero controller chains remain in repository history/files for reference but are **not part of the v26 startup runtime**.

## Local development

There is no build step.

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

For local testing, use a normal HTTP server rather than opening `index.html` through `file://`, because browser storage, module imports and external libraries have different security rules on opaque file origins.

## Online service setup

### Google sign-in

The frontend uses Supabase Auth with Google. Configure the Google provider in Supabase; never put a Google OAuth client secret in this repository.

The deployed app origin is `https://daytondeltap.github.io` and the application path is `/msc-event-management/`. Supabase's auth callback is the project `/auth/v1/callback` URL.

### Email API

Signed-in users configure their sender in **Options → Email API**. The browser sends the configuration to the authenticated Supabase `email-config` function. The API key is encrypted server-side. `send-approval-email` enforces authenticated sending and recipient-domain restrictions.

### OpenStreetMap

Venues uses Leaflet/OpenStreetMap. Search uses Nominatim only after an explicit user search and should retain request throttling/cache behavior.

## Known limitations

- Text-based PDF calendars are supported; scanned/image-only PDF calendars need OCR and are not parsed automatically.
- Google OAuth still depends on provider credentials configured outside the repository.
- Aero soundtrack server URLs must point to audio the site is authorized to distribute. The public repository does not bundle the previously supplied copyrighted MP3 files.
- GitHub Pages is a static host; persistent boards/email settings/sending depend on the existing Supabase backend.

## Deployment

`.github/workflows/pages.yml` deploys the static site from `main` to GitHub Pages. Cache-bust the entry resources when shipping a runtime fix so an older broken script cannot remain active after deployment.
