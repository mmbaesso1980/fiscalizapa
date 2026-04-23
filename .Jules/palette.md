## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.

## 2026-04-23 - Accessible Async Search Results
**Learning:** When implementing asynchronous searches with a dropdown of results, interactive list items need semantic `<button>` or `<a>` elements for native focus management. Also, empty states when a search yields no results need `role="status"` so that screen readers correctly announce the failure state to the user without losing focus.
**Action:** Use semantic interactive tags for search result items and apply `role="status"` to zero-result empty states in dynamic search interfaces.
