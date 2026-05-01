## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.

## 2024-05-24 - Accessible Autocomplete Dropdowns
**Learning:** For dynamic search dropdowns, list items must be semantic `<button>` tags for proper keyboard focus, empty states must use `role="status"`, and decorative icons/emojis must have `aria-hidden="true"`.
**Action:** Apply these patterns to all future custom dropdown or typeahead components to ensure screen reader and keyboard accessibility.
