## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.
## 2025-05-05 - Accessible Interactive Search Lists
**Learning:** Interactive list results (like async search drops) must be structured using `ul role="list"` and `li` tags, and clickable areas should be semantic `<button type="button">` to ensure proper screen reader announcements and keyboard focus (`focus-visible`). Additionally, dynamic loading states for search must use a visually hidden live region (`sr-only` + `role="status"`/`aria-live="polite"`) to announce the activity.
**Action:** Always refactor `div`-based list items with `onClick` to accessible lists (`ul` > `li` > `button`) and always include `aria-live` regions for async states.
