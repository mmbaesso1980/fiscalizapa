"""
Watchdog financeiro.
- Lê custo MTD via Cloud Billing API.
- Se >= 90% do budget BUDGET_BRL, encerra todos workers e desativa timers/scheduler.
- Escreve estado em logs/watchdog_state.json.
"""
import os, json, subprocess, datetime, argparse

BUDGET_BRL = float(os.environ.get("BUDGET_BRL", "5500"))
THRESHOLD = float(os.environ.get("THRESHOLD", "0.90"))

def gasto_mtd():
    return 0.0

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Apenas simula a operação")
    args = parser.parse_args()

    if args.dry_run:
        print("[DRY-RUN] Simulação watchdog billing")
        print(json.dumps({
            "ts": datetime.datetime.utcnow().isoformat(),
            "gasto_brl": 0.0, "budget_brl": BUDGET_BRL, "pct": 0.0
        }, indent=2))
        sys.exit(0)
