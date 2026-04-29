## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.

## 2026-04-29 - Accessible Interactive Lists and Decorative Elements
**Learning:** In interactive lists with complex content (like avatars, names, and scores), using semantic `<button>` elements is crucial for keyboard navigation. Additionally, redundant `alt` text on avatars where the name is already in the button text creates noise, and decorative emojis must be hidden with `aria-hidden='true'`.
**Action:** When creating interactive list items, use semantic buttons with clear focus states. Set empty `alt` tags for decorative/redundant avatars, and always hide decorative emojis from screen readers.
