## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.

## 2024-05-24 - Accessible Global Search and Interactive Lists
**Learning:** In the `GlobalSearch` component, interactive list items were implemented using `div` elements with `onClick` handlers, which breaks native focus management and keyboard accessibility. Furthermore, avatar images used redundant `alt` text (repeating the user's name already present in the list item), and the search interface lacked a `role="status"` empty state to announce "no results" to screen readers.
**Action:** Always use semantic elements like `<button type="button">` or `<a>` for interactive lists. Ensure `alt=""` is used for decorative images or when the information is already conveyed in adjacent text. Apply `role="status"` to dynamically updated areas (like empty search results) to provide feedback to assistive technologies.
