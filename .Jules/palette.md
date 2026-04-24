## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.

## 2024-05-24 - Semantic Search Dropdowns
**Learning:** Using `<div>` for interactive list items in search results breaks keyboard navigation. Furthermore, screen readers announce image `alt` text redundantly if the text is also in the button payload.
**Action:** Always use `<button type="button">` or `<a>` for interactive dropdown items, set `alt=""` on avatars inside text-rich buttons, and add `role="status"` to empty search results.
