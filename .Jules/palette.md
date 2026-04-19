## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.

## 2026-04-19 - Keyboard Accessible Custom List Items & Async Empty States
**Learning:** In React components like `GlobalSearch`, interactive result items constructed with `<div>` elements are inaccessible to keyboard users and screen readers. Additionally, async searches without an explicit empty state (`role="status"`) leave users confused when no results match.
**Action:** Always use semantic `<button>` or `<a>` elements for interactive list items to inherit native focus management (`Tab`/`Enter`). Explicitly handle the empty state with a helpful message once the query is completed and no results are found.
