import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { normalizeUF } from "./SocialContext";
import { anosCeapLegislaturaAtual } from "../utils/legislatura";

const UF_VALIDAS = new Set(["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]);

const FORCED_UF_BY_TEXTO = [
  ["MATO GROSSO DO SUL", "MS"],
  ["MATO GROSSO", "MT"],
  ["MARANHAO", "MA"],
];

function safeUF(uf, estadoNome, municipioNome) {
  const blob = [estadoNome, municipioNome, uf].filter(Boolean).join(" ").toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");
  for (const [needle, sig] of FORCED_UF_BY_TEXTO) {
    if (blob.includes(needle)) return sig;
  }
  if (!uf) return "";
  const up = String(uf).toUpperCase().trim();
  if (UF_VALIDAS.has(up)) return up;
  const n = normalizeUF(up, estadoNome);
  return n !== "–" ? n : (up.length >= 2 ? up.slice(0, 2) : "");
}

function fmt(v) {
  const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", "."));
  if (isNaN(n) || n === 0) return "–";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function safeNum(v) {
  const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function faseResumo(porFase) {
  if (!porFase || typeof porFase !== "object") return "";
  return Object.entries(porFase)
    .map(([k, v]) => `${k}: ${v}`)
    .slice(0, 6)
    .join(" · ");
}

/**
 * @param {object} props
 * @param {string} props.deputadoId
 * @param {string} props.colecao
 * @param {string} props.nomeDeputado
 * @param {Array|null} props.emendasOverride — quando definido (ex.: vindo do Portal via CF), não relê a coleção inteira
 */
export default function EmendasAba({ deputadoId, nomeDeputado, emendasOverride }) {
  const [firestoreEmendas, setFirestoreEmendas] = useState([]);
  const [loadingRemote, setLoadingRemote] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [rastreamento, setRastreamento] = useState({});

  const emendas = emendasOverride != null ? emendasOverride : firestoreEmendas;
  const loading = emendasOverride != null ? false : loadingRemote;

  useEffect(() => {
    if (emendasOverride != null) return;
    if (!deputadoId) return;
    async function load() {
      setLoadingRemote(true);
      try {
        const snap = await getDocs(collection(db, "emendas"));
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const mine = all.filter(e => e.parlamentarId === deputadoId || e.autorId === deputadoId);
        mine.sort((a, b) => (b.valorEmpenhado || b.valor || 0) - (a.valorEmpenhado || a.valor || 0));
        setFirestoreEmendas(mine);
      } catch {
        setFirestoreEmendas([]);
      }
      setLoadingRemote(false);
    }
    load();
  }, [deputadoId, emendasOverride]);

  async function loadRastreamento(emendaId) {
    if (rastreamento[emendaId]) {
      setExpanded(expanded === emendaId ? null : emendaId);
      return;
    }
    try {
      const cSnap = await getDocs(collection(db, "municipio_compras"));
      const compras = cSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.emendaId === emendaId);
      const fSnap = await getDocs(collection(db, "relacoes_parlamentar_fornecedor"));
      const fornRel = fSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => f.emendaId === emendaId);
      setRastreamento(prev => ({ ...prev, [emendaId]: { compras, fornRel } }));
    } catch {
      setRastreamento(prev => ({ ...prev, [emendaId]: { compras: [], fornRel: [] } }));
    }
    setExpanded(emendaId);
  }

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>Carregando emendas parlamentares...</div>;
  }

  const anosTxt = anosCeapLegislaturaAtual().join(", ");

  if (emendas.length === 0) {
    return (
      <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>Nenhuma emenda retornada para este deputado.</p>
        <p style={{ fontSize: '11px', marginTop: '8px' }}>Dados agregados do Portal da Transparência (API) para os anos {anosTxt} quando você estiver logado.</p>
        {nomeDeputado && (
          <a href={`https://portaldatransparencia.gov.br/emendas/consulta?de=01%2F01%2F2023&ate=31%2F12%2F2026&autor=${encodeURIComponent(nomeDeputado)}`}
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: '12px', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: 'var(--accent-green)', color: '#fff', textDecoration: 'none' }}>
            Consultar no Portal da Transparência
          </a>
        )}
      </div>
    );
  }

  const totalEmpenhado = emendas.reduce((s, e) => s + safeNum(e.valorEmpenhado ?? e.valor), 0);
  const totalPago      = emendas.reduce((s, e) => s + safeNum(e.valorPago), 0);
  const totalLiq       = emendas.reduce((s, e) => s + safeNum(e.valorLiquidado), 0);
  const municipios = [...new Set(emendas.map(e => e.municipioNome || e.municipio).filter(Boolean))];

  return (
    <div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
        Fonte:{" "}
        <a href="https://api.portaldatransparencia.gov.br/" target="_blank" rel="noopener noreferrer" style={{ color: "#15803d", textDecoration: "underline" }}>
          API Portal da Transparência
        </a>
        {" "}· anos {anosTxt} · valores empenhado / liquidado / pago · documentos por fase (execução) nos primeiros itens.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginBottom: '20px' }}>
        <div style={{ minWidth: 0, padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-gold)' }}>{emendas.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>EMENDAS</div>
        </div>
        <div style={{ minWidth: 0, padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-orange)' }}>{fmt(totalEmpenhado)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>EMPENHADO</div>
        </div>
        <div style={{ minWidth: 0, padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#0d9488' }}>{fmt(totalLiq)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>LIQUIDADO</div>
        </div>
        <div style={{ minWidth: 0, padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-green)' }}>{fmt(totalPago)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>PAGO</div>
        </div>
      </div>
      {municipios.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 12 }}>
          Municípios distintos: <strong>{municipios.length}</strong>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {emendas.map(e => {
          const isExpanded = expanded === e.id;
          const rast = rastreamento[e.id];
          const ufLabel = safeUF(e.uf, e.estado || e.estadoNome, e.municipioNome);
          const portalUrl = e.linkPortal || e.urlPortal;
          const taxa = e.taxaExecucao != null ? `${Number(e.taxaExecucao).toFixed(1)}%` : null;
          const docLine = faseResumo(e.documentosPorFase);
          const timeline = Array.isArray(e.documentosTimeline) ? e.documentosTimeline : [];

          return (
            <div key={e.id} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
              <div
                onClick={() => loadRastreamento(e.id)}
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg-secondary)'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>
                    {e.municipioNome || e.municipio || e.localidade || 'Município não informado'}
                    {ufLabel ? ` — ${ufLabel}` : ''}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    <span style={{ fontWeight: 600 }}>{e.codigo || e.id}</span>
                    {e.tipo ? ` · ${e.tipo}` : ''}
                    {e.ano ? ` · ${e.ano}` : ''}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                    {e.objetoResumo || [e.funcao, e.subfuncao].filter(Boolean).join(" · ") || ""}
                  </p>
                  {docLine && (
                    <p style={{ fontSize: '10px', color: '#57534e', margin: '6px 0 0', lineHeight: 1.4 }}>
                      <strong>Execução (documentos):</strong> {docLine}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-gold)', fontSize: '15px' }}>{fmt(e.valorEmpenhado ?? e.valor)}</span>
                  {safeNum(e.valorLiquidado) > 0 && (
                    <p style={{ fontSize: '11px', color: '#0d9488', margin: '2px 0 0' }}>Liq.: {fmt(e.valorLiquidado)}</p>
                  )}
                  {safeNum(e.valorPago) > 0 && <p style={{ fontSize: '11px', color: 'var(--accent-green)', margin: '2px 0 0' }}>Pago: {fmt(e.valorPago)}</p>}
                  {taxa && <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Taxa pago/emp.: {taxa}</p>}
                  {portalUrl && (
                    <a href={portalUrl} target="_blank" rel="noopener noreferrer"
                      onClick={(ev) => ev.stopPropagation()}
                      style={{ fontSize: '10px', fontWeight: 700, color: '#fff', background: '#15803d', padding: '4px 10px', borderRadius: 6, display: 'inline-block', marginTop: 6, textDecoration: 'none' }}>
                      Emenda no Portal ↗
                    </a>
                  )}
                </div>
              </div>

              {timeline.length > 0 && (
                <div style={{ padding: "0 16px 12px", borderTop: "1px solid var(--border-light)", background: "#fafafa" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", margin: "10px 0 6px" }}>
                    Linha do tempo (amostra — empenho → pagamento)
                  </p>
                  <div style={{ maxHeight: 160, overflowY: "auto" }}>
                    {timeline.slice(0, 12).map((d, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10, padding: "4px 0", borderBottom: "1px solid #eee" }}>
                        <span style={{ color: "var(--text-secondary)" }}>{d.data} · <strong>{d.fase}</strong></span>
                        {d.linkConsultaDocumento ? (
                          <a href={d.linkConsultaDocumento} target="_blank" rel="noopener noreferrer" style={{ color: "#15803d", fontWeight: 600, flexShrink: 0 }}>
                            doc ↗
                          </a>
                        ) : (
                          <span style={{ color: "#ccc" }}>—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isExpanded && rast && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-light)', background: 'var(--bg-secondary)' }}>
                  {rast.compras.length === 0 && rast.fornRel.length === 0 && (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sem compras municipais extras vinculadas no Firestore.</p>
                  )}
                  {rast.compras.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Compras Municipais Vinculadas:</p>
                      {rast.compras.map((c, i) => (
                        <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 0', borderBottom: '1px solid var(--border-light)' }}>
                          {c.fornecedor || c.empresa || 'N/A'} - {fmt(c.valor)} {c.cnpj ? `| CNPJ: ${c.cnpj}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  {rast.fornRel.length > 0 && (
                    <div>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-red)', marginBottom: '6px' }}>Relações Fornecedor-Parlamentar:</p>
                      {rast.fornRel.map((f, i) => (
                        <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '4px 0' }}>
                          {f.fornecedorNome || f.cnpj || 'N/A'} - {f.tipo || 'vínculo detectado'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
