## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.

## 2024-05-24 - Async Search Accessibility & Semantic Lists
**Learning:** For dynamic async searches, providing visual feedback isn't enough. Screen readers need a hidden live region (`role="status" aria-live="polite"`) to announce states like "Searching..." or the number of results. Also, interactive lists must use semantic `<ul role="list">` and `<li>` elements, with clickable areas wrapped in `<button>` to ensure correct focus management and keyboard operability. Adding `alt=""` to images inside these buttons prevents redundant text announcements.
**Action:** Always include a visually hidden live region for async loading states and use semantic HTML list structures for dynamic search results.
