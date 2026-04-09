/**
 * Página /alertas — wrapper lazy para AlertDashboard.
 *
 * Envolvida pelo Suspense global em App.jsx (com PageSkeleton).
 * O AlertDashboard gerencia seu próprio loading interno de dados.
 */

import AlertDashboard from "../components/AlertDashboard";

export default function AlertasPage() {
  return (
    <main className="min-h-screen bg-[var(--brand-bg)] pt-6 pb-16">
      <div className="max-w-2xl mx-auto px-4 mb-6">
        <h1
          className="text-2xl font-bold text-[var(--brand-text)]"
          style={{ fontFamily: "var(--font-head)" }}
        >
          Painel de Bodes
        </h1>
        <p className="text-sm text-[var(--brand-text)] opacity-55 mt-1 max-w-prose">
          Irregularidades detectadas automaticamente pelo motor de inteligência.
          Cada alerta representa um sinal de desvio na execução de emendas,
          contratos ou padrões de comportamento parlamentar.
        </p>
      </div>

      <AlertDashboard />
    </main>
  );
}
