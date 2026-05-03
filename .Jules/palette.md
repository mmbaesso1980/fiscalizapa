## 2024-05-24 - Accessible Off-Canvas Drawers
**Learning:** Using `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` ensures that screen readers properly interpret side drawers (like ForensicPanel) as modal dialogs.
**Action:** Always apply these modal ARIA attributes when implementing off-canvas UI or side panels that act as a focused overlay.

## 2024-05-03 - Accessible Global Search Patterns
**Learning:** In the TransparênciaBR app's `GlobalSearch` component, custom `div`-based list items prevent native keyboard navigation and focus management, and async debounced searches happen silently in the background, making it impossible for screen reader users to know if a search is in progress, failed, or succeeded.
**Action:** Always use semantic interactive elements like `<button type="button">` or `<a>` for search result dropdowns. For asynchronous search inputs, always implement a visually hidden live region (`role="status" aria-live="polite" className="sr-only"`) to announce the dynamic states ("Buscando...", "Encontrados X resultados", "Nenhum resultado encontrado") without cluttering the visual UI.
