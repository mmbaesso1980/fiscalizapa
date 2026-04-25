## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.
## 2025-04-25 - [Accessible Search Pattern]
**Learning:** In asynchronous global search components, mapping results to standard `<div>` elements breaks native keyboard navigation and screen reader semantics. Additionally, avatars inside interactive items with `alt={item.name}` cause redundant screen reader announcements when the name is already displayed in text within the same focusable element.
**Action:** Always use `<button type="button">` with `w-full text-left` for interactive list items to handle `space/enter` and focus naturally. Use `alt=""` for images within text-rich buttons. Provide an empty state container with `role="status"` to announce "No results found" natively during async searches.
