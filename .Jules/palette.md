## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.

## 2026-04-26 - Native Semantic Search Results and Redundant Announcements
**Learning:** In interactive search results where the person's name is the primary content, providing `alt={item.nome}` on their avatar creates redundant screen reader announcements. Additionally, using standard `<div>` elements for interactive list results breaks native keyboard navigation and focus management.
**Action:** Use native `<button>` or `<a>` elements for interactive lists with custom focus styles. Always set `alt=""` on avatars when the visual information is decorative or already described by adjacent text, and hide decorative emojis with `aria-hidden="true"`. Use `role="status"` to announce empty state search results.
