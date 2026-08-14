# MSC Event Management

Frontend-first event planning for a Middle School Council. The app keeps the everyday views compact while every event can still hold the full MSC planning record.

## Current frontend

- Black minimal UI built for desktop first, with responsive mobile navigation
- Visual **Plan** canvas with draggable event blocks
- Two-axis scrolling and background drag-to-pan
- Shift + mouse wheel for horizontal scrolling
- Ctrl/Cmd + wheel and toolbar controls for zoom
- Double-click anywhere on the canvas to create an event block in place
- Dependency lines between event blocks when a dependency matches another event name
- Event detail drawer for objective, people, venue, materials, budget, approval, deadline, dependencies, backup plan and feedback
- Status flow: **Not started → Planning → Awaiting approval → Ready → Completed**
- Drag-and-drop status board
- Dense events table and filters
- Month calendar
- Venue usage and venue-conflict detection
- Imported-school-calendar overlap warnings
- Budget overview with editable annual budget
- `.ics` / `.ical` import with review before saving
- JSON calendar import with review before saving
- Duplicate import protection
- JSON export
- Local persistence through `localStorage`

## Planner controls

- **Drag a block handle** to move the block
- **Drag empty canvas space** to pan
- **Scroll / trackpad** for normal two-axis navigation
- **Shift + wheel** to force horizontal scroll with a mouse
- **Ctrl/Cmd + wheel** to zoom around the center of the viewport
- **Double-click empty canvas** to create an event block at that location
- **N** creates a new event (quick block on the Plan view)
- **/** focuses global search

## Run locally

This is a static frontend with no build step.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## JSON import

The importer accepts either a plain array or an object containing `events` or `items`.

```json
{
  "events": [
    {
      "title": "School Assembly",
      "start": "2026-09-04T09:00:00+07:00",
      "end": "2026-09-04T10:00:00+07:00",
      "location": "Auditorium",
      "description": "Monthly middle school assembly"
    }
  ]
}
```

Common MSC-specific fields such as `lead`, `supportingMembers`, `materialsRequired`, `budget`, `deadline`, `approvalRequired`, `dependencies`, `backupPlan`, and `postEventFeedback` are also recognized.

## GitHub Pages

`.github/workflows/pages.yml` deploys the static frontend whenever `main` changes. For a brand-new repository, enable **Settings → Pages → Source → GitHub Actions** once. Subsequent commits deploy automatically.

## Later backend / collaboration

The event state is intentionally plain JSON. A later backend can replace local persistence with workspaces, authentication, live collaboration, comments, version history, shared approvals and server-side PDF/calendar parsing without rebuilding the frontend model.
