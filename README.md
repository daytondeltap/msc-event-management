# MSC Event Management

Frontend-first event planning for a Middle School Council, with a large visual planning canvas, calendar import, venue/budget tools and live shared-board collaboration.

## Current frontend

- Black minimal responsive UI that scales up on 1440p / 4K screens
- Visual **Plan** canvas with a 4600 × 3200 workspace
- Smooth `requestAnimationFrame` block dragging with lightweight realtime drag packets
- Space + drag or empty-canvas drag to pan
- Trackpad / two-axis scrolling
- Shift + wheel horizontal scroll
- Ctrl/Cmd + wheel zooms around the pointer position
- Double-click empty canvas to add a block
- Double-click a block to open its full event record
- Dependency connectors between events
- Color-coded approval states: Approved, Awaiting approval, Rejected, Not submitted, Not required
- Status flow: **Not started → Planning → Awaiting approval → Ready → Completed**
- Status board, calendar, venue manager and budget view
- `.ics` / `.ical` and JSON imports
- JSON export
- Local browser persistence

## Live collaboration

Shared boards use Supabase Realtime.

- Presence avatars
- Current page/view for each collaborator
- Current selected event
- Editing / moving / selected indicators
- Canva-style badges on blocks when another person is working on the same event
- Live cursors
- Live block movement
- Shared event/state updates
- Google account name/avatar used automatically after login
- Guest names still work if Google OAuth has not been configured yet

Presence is used only for slower-changing collaborator state. Cursor and drag movement use Realtime Broadcast so mouse movement does not flood Presence.

## Google sign-in setup

The frontend already calls Supabase Auth with `provider: 'google'`. **No Google client secret is stored in this repository.**

1. In Google Auth Platform, create a **Web application** OAuth client.
2. Add this authorized JavaScript origin:

   `https://daytondeltap.github.io`

3. Add the Supabase callback URL as an authorized redirect URI:

   `https://pmfsgdraazaaulgwlant.supabase.co/auth/v1/callback`

4. In Supabase Dashboard → Authentication → Providers → Google, enable Google and paste the **Client ID** and **Client Secret**.
5. In Supabase Dashboard → Authentication → URL Configuration, add the GitHub Pages application URL / redirect allow-list entry:

   `https://daytondeltap.github.io/msc-event-management/`

Once those settings are saved, the existing **Continue with Google** button works without another frontend code change.

## Google Maps setup

The Venues page uses the Google Maps JavaScript API and geocodes each event's **Map address** field.

1. In Google Cloud, enable **Maps JavaScript API** and billing.
2. Create a browser API key.
3. Restrict the key to the Maps JavaScript API.
4. Add an HTTP referrer restriction for:

   `https://daytondeltap.github.io/msc-event-management/*`

5. Either:
   - open **Venues → Configure Google Maps** and paste the key for that browser, or
   - put the key in `config.js` as `googleMapsApiKey` if you want the deployed site to use the same browser key for everyone.

A Maps browser key is visible to the browser by design, so the important protection is the API + HTTP-referrer restriction. **Do not put OAuth client secrets or Supabase service-role keys in `config.js`.**

## Frontend structure

The static app is split into small classic-script modules so it remains easy to deploy on GitHub Pages without a build system:

- `app-core.js` — data model, state, common rendering helpers
- `app-views.js` — Plan, Events, Status, Calendar, Venues and Budget UI
- `app-online.js` — Supabase Auth + Realtime Presence/Broadcast
- `app-integrations.js` — smooth block dragging, Maps, iCal/JSON import/export
- `app-bind.js` — pointer, keyboard, button and drag/drop bindings
- `config.js` — optional public/browser integration settings only

## Run locally

No build step is required.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

`.github/workflows/pages.yml` deploys the static frontend whenever `main` changes.
