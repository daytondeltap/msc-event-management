# v31 bug sweep

This branch is a no-feature-change regression hardening pass.

Validated areas are derived from the README feature matrix: core views, Plan interactions/connections, event editing, Calendar/import, Budget, Status, Contacts/presets, Options/themes, Boards/Share lazy loading, Venues/OpenStreetMap lazy loading, Google account entry, Supabase Auth health, persistent-board CORS, and JWT protection on user Edge Functions.

Confirmed fixes in this branch:
- Google sign-in waits for Supabase initialization and uses a deterministic redirect target while preserving the original board URL for return.
- Lazy Boards/Share and OpenStreetMap failures can be retried instead of permanently caching a failed promise.
- Mobile dialogs/drawers/settings stay above the bottom navigation and no longer lose taps to it.
- Small landscape topbar controls are kept inside the viewport.
- Pointer cancellation/window blur cannot leave Plan dragging stuck.
- Selecting the same import file again still triggers import.
- Large cloud snapshots no longer force an oversized `keepalive` request on page hide.
- Cross-device tests use unambiguous navigation selectors and verify actual overlay reachability.
