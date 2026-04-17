/**
 * Placeholder leve durante code-splitting (React.lazy).
 */
export default function PageSkeleton() {
  return (
    <div
      className="min-h-[50vh] w-full max-w-6xl mx-auto px-4 py-8 space-y-4"
      aria-busy="true"
      aria-label="Carregando página"
    >
      <div className="h-9 w-1/3 max-w-xs rounded-md bg-[var(--border-light)] animate-pulse" />
      <div className="h-3 w-full rounded bg-[var(--border-light)] animate-pulse" />
      <div className="h-3 w-4/5 rounded bg-[var(--border-light)] animate-pulse" />
      <div className="h-64 w-full rounded-[var(--radius-lg)] bg-[var(--border-light)] animate-pulse mt-6" />
    </div>
  );
}
