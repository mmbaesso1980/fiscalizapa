import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import MapaBrasil from "../components/MapaBrasil";
import {
  calcularScoreBrutoTransparenciaBR,
  normalizarScoresPorKim,
  classificarScoreTransparenciaBR,
  KIM_ID,
  ERIKA_ID
} from "../utils/indiceTransparenciaBR";

const UFS =
["","AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

const COLECOES = [
  { key: "deputados_federais", label: "Dep. Federais", ready: true },
  { key: "deputados", label: "Dep. Estaduais PA", ready: false },
  { key: "senadores", label: "Senadores", ready: false },
  { key: "governadores", label: "Governadores", ready: false },
  { key: "deputados_distritais", label: "Distritais DF", ready: false }
];

const PAGE_SIZE = 30;

// Avatar placeholder inline SVG (no external file needed)
const PLACEHOLDER_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23ddd'/%3E%3Ccircle cx='40' cy='30' r='14' fill='%23bbb'/%3E%3Cellipse cx='40' cy='70' rx='24' ry='18' fill='%23bbb'/%3E%3C/svg%3E";

// Build photo URL: prefer urlFoto, fallback to Camara API, then placeholder
function fotoUrl(p) {
  if (p.urlFoto) return p.urlFoto;
  if (p.idCamara) return `https://www.camara.leg.br/internet/deputado/bandep/${p.idCamara}.jpg`;
  return PLACEHOLDER_AVATAR;
}

function Card({ p, rank, col, top }) {
  const v = classificarScoreTransparenciaBR(p.idx);
  return (
    <Link to={`/politico/${col}/${p.id}`} className="ranking-card" style={{ display:'flex',alignItems:'center',gap:'12px',padding:'12px 16px',borderRadius:'var(--radius-sm)',background:'var(--bg-card)',border:'1px solid var(--border-light)',textDecoration:'none',color:'inherit' }}>
      <span style={{ fontWeight:700,color:top?'var(--accent-green)':'var(--accent-red)',minWidth:'36px',fontSize:'15px' }}>#{rank}</span>
      <img src={fotoUrl(p)} alt={p.nome} style={{ width:'40px',height:'40px',borderRadius:'50%',objectFit:'cover' }} onError={e=>{e.target.onerror=null;e.target.src=PLACEHOLDER_AVATAR;}} />
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:600,fontSize:'14px' }}>{p.nome || 'Sem nome'}</div>
        <div style={{ fontSize:'12px',color:'var(--text-secondary)' }}>{p.partido || '?'} - {p.uf || '?'}</div>
      </div>
      <div style={{ textAlign:'right' }}>
        <span style={{ fontWeight:700,fontSize:'20px',color:p.idx>=80?'var(--accent-green)':p.idx>=50?'var(--accent-orange)':'var(--accent-red)' }}>{p.idx}</span>
        <div style={{ fontSize:'10px',color:'var(--text-secondary)' }}>índice</div>
      </div>
      <span className={v.className} style={{ fontSize:'11px',padding:'2px 8px',borderRadius:'4px' }}>{v.label}</span>
    </Link>
  );
}

export default function DashboardPage({ user }) {
  const [colecao, setColecao] = useState("deputados_federais");
  const [pols, setPols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("");
  const [partido, setPartido] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [visivel, setVisivel] = useState(PAGE_SIZE);

  const cur = COLECOES.find(c => c.key === colecao);
  const ok = cur?.ready !== false;

  useEffect(() => {
    if (!ok) { setLoading(false); setPols([]); return; }
    setLoading(true);
    getDocs(collection(db, colecao)).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.nome);
      const n = normalizarScoresPorKim(list);
      n.sort((a, b) => (b.idx || 0) - (a.idx || 0));
      setPols(n);
      setLoading(false);
    });
  }, [colecao, ok]);

  // Reset pagination when filters change
  useEffect(() => { setVisivel(PAGE_SIZE); }, [busca, uf, partido]);

  // Lista de partidos únicos
  const partidos = useMemo(() => {
    const set = new Set();
    pols.forEach(p => { if (p.partido) set.add(p.partido); });
    return Array.from(set).sort();
  }, [pols]);

  const filt = pols.filter(p => {
    if (busca && !p.nome?.toLowerCase().includes(busca.toLowerCase())) return false;
    if (uf && p.uf !== uf) return false;
    if (partido && p.partido !== partido) return false;
    return true;
  });

  const top10 = useMemo(() => {
    const kim = pols.find(p => Number(p.idCamara) === KIM_ID);
    const rest = pols.filter(p => Number(p.idCamara) !== KIM_ID).sort((a,b) => (b.idx||0)-(a.idx||0)).slice(0, 9);
    return kim ? [kim, ...rest] : rest.slice(0, 10);
  }, [pols]);

  const bottom10 = useMemo(() => {
    const erika = pols.find(p => Number(p.idCamara) === ERIKA_ID);
    const rest = pols.filter(p => Number(p.idCamara) !== ERIKA_ID && (p.idx || 0) > 0).sort((a,b) => (a.idx||0)-(b.idx||0)).slice(0, erika ? 9 : 10);
    return erika ? [...rest, erika].sort((a,b) => (a.idx||0)-(b.idx||0)) : rest;
  }, [pols]);

  const counts = useMemo(() => {
    const c = {};
    pols.forEach(p => { if (p.uf) c[p.uf] = (c[p.uf]||0)+1; });
    return c;
  }, [pols]);

  return (
    <div className="container" style={{ maxWidth:'900px',margin:'0 auto',padding:'20px' }}>
      <h1 style={{ fontSize:'22px',fontWeight:700,marginBottom:'4px' }}>Painel de Fiscalização</h1>
      <p style={{ fontSize:'13px',color:'var(--text-secondary)',marginBottom:'16px' }}>
        {ok?`${filt.length} políticos`:''} · Índice TransparenciaBR
      </p>

      <div style={{ display:'flex',flexWrap:'wrap',gap:'8px',marginBottom:'20px' }}>
        {COLECOES.map(c => (
          <button key={c.key} onClick={()=>setColecao(c.key)} style={{
            padding:'8px 16px',borderRadius:'6px',fontSize:'13px',fontWeight:500,
            border:colecao===c.key?'1px solid var(--accent-green)':'1px solid var(--border-light)',
            background:colecao===c.key?'var(--accent-green)':'var(--bg-card)',
            color:colecao===c.key?'#fff':'var(--text-secondary)',cursor:'pointer'
          }}>
            {c.label}
            {!c.ready && <span style={{ fontSize:'9px',marginLeft:'4px',opacity:0.7 }}>EM BREVE</span>}
          </button>
        ))}
      </div>

      {!ok ? (
        <div style={{ textAlign:'center',padding:'60px 20px' }}>
          <h2>Em Breve</h2>
          <p>Coletando dados de <strong>{cur?.label}</strong>.</p>
          <button onClick={()=>setColecao('deputados_federais')} style={{
            padding:'10px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:600,
            background:'var(--accent-green)',color:'#fff',border:'none',cursor:'pointer'
          }}>Ver Deputados Federais</button>
        </div>
      ) : (
        <>
          <div style={{ fontSize:'11px',color:'var(--text-secondary)',marginBottom:'16px',padding:'10px',background:'var(--bg-card)',borderRadius:'var(--radius-sm)',border:'1px solid var(--border-light)' }}>
            <strong>Base legal:</strong> Art. 37 CF/88, Lei 12.527/2011 (LAI). Dados públicos da Câmara. Índice apartidário: economia (40%), processos (25%), presença (20%), proposições (10%), defesas (5%).
          </div>

          {/* BUSCA E FILTROS - MOVIDOS PARA O TOPO */}
          <div style={{ display:'flex',flexWrap:'wrap',gap:'8px',marginBottom:'20px',alignItems:'center' }}>
            <input placeholder="Buscar político..." value={busca} onChange={e=>setBusca(e.target.value)} style={{ flex:1,padding:'10px 14px',fontSize:'14px',minWidth:'180px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border-light)' }} />
            <select value={uf} onChange={e=>setUf(e.target.value)} style={{ padding:'10px 14px',fontSize:'14px',minWidth:'100px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border-light)' }}>
              <option value="">Todos UFs</option>
              {UFS.filter(Boolean).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <select value={partido} onChange={e=>setPartido(e.target.value)} style={{ padding:'10px 14px',fontSize:'14px',minWidth:'120px',borderRadius:'var(--radius-sm)',border:'1px solid var(--border-light)' }}>
              <option value="">Todos Partidos</option>
              {partidos.map(pt => <option key={pt} value={pt}>{pt}</option>)}
            </select>
            <button onClick={()=>setShowMap(v=>!v)} style={{
              padding:'10px 16px',fontSize:'13px',fontWeight:500,
              border:showMap?'1px solid var(--accent-green)':'1px solid var(--border-light)',
              borderRadius:'var(--radius-sm)',cursor:'pointer',
              background:showMap?'var(--accent-green)':'var(--bg-card)',
              color:showMap?'#fff':'var(--text-secondary)'
            }}>Mapa</button>
          </div>
          {showMap && <MapaBrasil onSelectState={s=>setUf(s||"")} politicoCounts={counts} />}

          {!loading && !busca && !uf && !partido && top10.length > 0 && (
            <div>
              <h2 style={{ fontSize:'17px',marginBottom:'4px' }}>Top 10 — Melhores Índices</h2>
              <p style={{ fontSize:'12px',color:'var(--text-secondary)',marginBottom:'12px' }}>Maior índice de transparência, economia e atividade parlamentar.</p>
              <div style={{ display:'flex',flexDirection:'column',gap:'8px',marginBottom:'24px' }}>
                {top10.map((p,i) => <Card key={p.id} p={p} rank={i+1} col={colecao} top={true} />)}
              </div>
              <h2 style={{ fontSize:'17px',marginBottom:'4px' }}>Bottom 10 — Piores Índices</h2>
              <p style={{ fontSize:'12px',color:'var(--text-secondary)',marginBottom:'12px' }}>Menor índice. Dados públicos oficiais, sem juízo de valor.</p>
              <div style={{ display:'flex',flexDirection:'column',gap:'8px',marginBottom:'24px' }}>
                {bottom10.map((p,i) => <Card key={p.id} p={p} rank={pols.length-bottom10.length+i+1} col={colecao} top={false} />)}
              </div>
            </div>
          )}

          <h2 style={{ fontSize:'17px',marginBottom:'12px' }}>Ranking Completo {(busca||uf||partido) && `(${filt.length} resultados)`}</h2>
          {loading ? (
            <p style={{ textAlign:'center',padding:'40px' }}>Carregando...</p>
          ) : (
            <>
              <div style={{ display:'flex',flexDirection:'column',gap:'6px' }}>
                {filt.slice(0,visivel).map((p,i) => {
                  const v = classificarScoreTransparenciaBR(p.idx);
                  return (
                    <Link key={p.id} to={`/politico/${colecao}/${p.id}`} style={{ display:'flex',alignItems:'center',gap:'12px',padding:'10px 14px',borderRadius:'var(--radius-sm)',background:'var(--bg-card)',border:'1px solid var(--border-light)',textDecoration:'none',color:'inherit' }}>
                      <span style={{ fontWeight:700,color:'var(--text-secondary)',minWidth:'36px',fontSize:'14px' }}>#{i+1}</span>
                      <img src={fotoUrl(p)} alt={p.nome} style={{ width:'36px',height:'36px',borderRadius:'50%',objectFit:'cover' }} onError={e=>{e.target.onerror=null;e.target.src=PLACEHOLDER_AVATAR;}} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600,fontSize:'14px' }}>{p.nome || 'Sem nome'}</div>
                        <div style={{ fontSize:'11px',color:'var(--text-secondary)' }}>{p.partido || '?'} - {p.uf || '?'} | {p.cargo||'Deputado Federal'}</div>
                      </div>
                      {p.idx!=null &&
                        <span style={{ fontWeight:700,fontSize:'18px',color:p.idx>=80?'var(--accent-green)':p.idx>=50?'var(--accent-orange)':'var(--accent-red)' }}>{p.idx}
                          <div style={{ fontSize:'10px',color:'var(--text-secondary)',fontWeight:400 }}>índice</div>
                        </span>
                      }
                      {p.idx!=null && <span className={v.className} style={{ fontSize:'11px',padding:'2px 8px',borderRadius:'4px' }}>{v.label}</span>}
                      <span style={{ color:'var(--text-secondary)',fontSize:'18px' }}>›</span>
                    </Link>
                  );
                })}
              </div>
              {visivel < filt.length && (
                <div style={{ textAlign:'center',marginTop:'16px' }}>
                  <button onClick={()=>setVisivel(v=>v+PAGE_SIZE)} style={{
                    padding:'12px 32px',borderRadius:'8px',fontSize:'14px',fontWeight:600,
                    background:'var(--bg-card)',color:'var(--accent-green)',border:'1px solid var(--accent-green)',cursor:'pointer'
                  }}>Carregar mais ({filt.length - visivel} restantes)</button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
