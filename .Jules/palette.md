## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.
## 2024-05-18 - Semantic Focus for Custom List Items
**Learning:** Interactive list items must use semantic `<button type="button">` or `<a>` elements for native focus management, and async searches must use `role="status"` for empty/loading states.
**Action:** Always convert generic interactive `<div>` items to proper semantic tags to ensure full keyboard navigation and screen reader support without custom JS events.
