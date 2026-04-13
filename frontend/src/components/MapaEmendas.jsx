import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function fmtBRL(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Corrige ícones padrão do Leaflet em bundlers */
function useFixLeafletIcons() {
  useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
  }, []);
}

/**
 * @param {Array<{ lat: number, lng: number, valor?: number, municipio?: string, tipo?: string, tipoPix?: boolean }>} pontos
 */
export default function MapaEmendas({ pontos = [], emendasPix = 0, emendasProjeto = 0 }) {
  useFixLeafletIcons();

  const valid = pontos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (valid.length === 0) {
    return (
      <div
        style={{
          height: 200,
          borderRadius: 12,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748b",
          fontSize: 13,
          padding: 16,
          textAlign: "center",
        }}
      >
        Sem coordenadas para o mapa (municípios sem geocodificação nesta consulta).
      </div>
    );
  }

  const getColor = (p) => (p.tipoPix === true || String(p.tipo || "").toLowerCase().includes("pix") ? "#22c55e" : "#3b82f6");
  const center = valid.length === 1 ? [valid[0].lat, valid[0].lng] : [-15.78, -47.93];

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap", fontSize: 11, color: "#475569" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
          Pix / transf. especial ({emendasPix})
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} />
          Projeto definido ({emendasProjeto})
        </span>
      </div>
      <MapContainer center={center} zoom={valid.length === 1 ? 8 : 4} style={{ height: 380, width: "100%", borderRadius: 12, zIndex: 0 }}>
        <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {valid.map((emenda, i) => {
          const valor = Number(emenda.valor) || 0;
          const r = Math.max(6, Math.min(28, 6 + Math.log10(Math.max(valor, 1)) * 4));
          const col = getColor(emenda);
          return (
            <CircleMarker
              key={`${emenda.municipio}-${i}`}
              center={[emenda.lat, emenda.lng]}
              radius={r}
              pathOptions={{ fillColor: col, color: "#fff", weight: 1.5, fillOpacity: 0.85 }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                <strong>{emenda.municipio || "—"}</strong>
                <br />
                {fmtBRL(valor)}
              </Tooltip>
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <strong>{emenda.municipio || "—"}</strong>
                  <p style={{ margin: "6px 0" }}>
                    Valor: <strong>{fmtBRL(valor)}</strong>
                  </p>
                  <p style={{ margin: 0, fontSize: 12 }}>
                    {emenda.tipoPix ? "⚡ Transferência especial / Pix" : "🎯 Projeto definido / demais"}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 8 }}>
        Mapa © OpenStreetMap — posições aproximadas por município (Nominatim).
      </p>
    </div>
  );
}
