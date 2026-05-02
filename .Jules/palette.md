## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.
## 2024-05-02 - Live Regions for Search Autocomplete
**Learning:** React state updates for loading spinners (like `isSearching`) are visible to sighted users but missed by screen readers if not announced.
**Action:** Always include a `<div aria-live="polite" aria-atomic="true" className="sr-only" role="status">` that reads the state value (e.g. 'Searching...') to properly announce async progress.
