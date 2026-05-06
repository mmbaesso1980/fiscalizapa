## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.

## 2024-05-06 - Semantic Search Results for Progressive Disclosure
**Learning:** Interactive list results (like in GlobalSearch) frequently use bare `<div>` elements with `onClick` handlers. While this looks correct visually, it severely degrades the keyboard navigation experience and screen reader semantics, hiding the progressive disclosure entry point from power users. Additionally, avatar images inside these actionable text nodes cause redundant and verbose screen reader announcements if their `alt` text duplicates the node's textual label.
**Action:** Always wrap search results dropdowns in a `<ul role="list">` with `<li>` children. Wrap the interactive hit area inside each `<li>` with a `<button type="button">` styled with `w-full text-left`. Ensure decorative avatars inside these buttons use `alt=""` or `aria-hidden="true"`.
