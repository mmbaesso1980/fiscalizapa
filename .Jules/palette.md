## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.

## 2024-05-25 - Search and Interactive Lists Accessibility
**Learning:** For interactive search result lists, using `<button type="button">` instead of `<div>` ensures native focus management and keyboard accessibility. Inputs without visible labels need `aria-label`, and empty states should use `role="status"` to announce to screen readers. For decorative/redundant avatars, `alt=""` and `aria-hidden="true"` prevent redundant announcements.
**Action:** Always use semantic buttons for clickable list items, add ARIA attributes to inputs without visual labels, include status roles for empty states, and hide decorative elements from screen readers.
