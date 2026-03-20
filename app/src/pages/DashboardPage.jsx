import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import MapaBrasil from "../components/MapaBrasil";
const UFS = ["","AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
const COLECOES = [
  { key: "deputados_federais", label: "Dep. Federais", ready: true },
  { key: "deputados", label: "Dep. Estaduais PA", ready: false },
  { key: "senadores", label: "Senadores", ready: false },
  { key: "governadores", label: "Governadores", ready: false },
  { key: "deputados_distritais", label: "Distritais DF", ready: false }
];
const KIM_ID = 204536;
const ERIKA_ID = 220645;
function calcScore(p) {
  const g = p.totalGastos || 0;
  const d = p.totalDespesas || 0;
  const r = p.score || p.riskScore || 0;
  if (g === 0 && d === 0 && r === 0) return 25;
  const eco = Math.max(0, 100 - (g / 5000) * 1);
  const risk = Math.max(0, 100 - r * 1.8);
  const pres = p.presencaScore || p.presenca || 50;
  const prop = p.proposicoesScore || (d > 20 ? 40 : d > 0 ? 20 : 5);
  const def = p.defesasPlenarioScore || 30;
  return Math.round((eco * 0.40) + (risk * 0.25) + (pres * 0.20) + (prop * 0.10) + (def * 0.05));
}
function normalize(list) {
  const kim = list.find(p => Number(p.idCamara) === KIM_ID);
  const kimRaw = kim ? calcScore(kim) : 70;
  const f = kimRaw > 0 ? 100 / kimRaw : 1;
  return list.map(p => {
    if (Number(p.idCamara) === KIM_ID) return { ...p, idx: 100 };
    const raw = calcScore(p);
    return { ...p, idx: Math.min(Math.round(raw * f), 99) };
  });
}
function lvl(s) {
  if (s >= 80) return { l: "Otimo", c: "risk-badge-low" };
  if (s >= 50) return { l: "Regular", c: "risk-badge-medium" };
  return { l: "Ruim", c: "risk-badge-high" };
}
function Card({ p, rank, col, top }) {
  const v = lvl(p.idx);
  return (
    <Link to={`/politico/${col}/${p.id}`} style={{ display:'flex',alignItems:'center',gap:'10px',padding:'10px 14px',background:'var(--bg-card)',borderRadius:'var(--radius-sm)',marginBottom:'6px',border:top?'1px solid rgba(74,144,101,0.3)':'1px solid rgba(200,50,50,0.2)',textDecoration:'none',color:'inherit' }}>
      <span style={{ fontSize:'13px',fontWeight:700,color:top?'var(--accent-green)':'var(--accent-red)',minWidth:'28px' }}>#{rank}</span>
      <img src={p.foto||p.urlFoto||p.fotoUrl||'/placeholder-avatar.png'} alt={p.nome} style={{ width:36,height:36,borderRadius:'50%',objectFit:'cover' }} onError={e=>{e.target.src='/placeholder-avatar.png';}} />
      <div style={{ flex:1 }}>
        <p style={{ fontWeight:600,fontSize:'14px',color:'var(--text-primary)' }}>{p.nome}</p>
        <p style={{ fontSize:'11px',color:'var(--text-muted)' }}>{p.partido} - {p.uf}</p>
      </div>
      <div style={{ textAlign:'center',minWidth:'44px' }}>
        <p style={{ fontSize:'18px',fontWeight:700,fontFamily:'Space Grotesk',color:top?'var(--accent-green)':'var(--accent-red)' }}>{p.idx}</p>
        <p style={{ fontSize:'9px',color:'var(--text-muted)' }}>indice</p>
      </div>
      <span className={v.c} style={{ padding:'3px 8px',borderRadius:'10px',fontSize:'10px',fontWeight:600 }}>{v.l}</span>
    </Link>
  );
}
export default function DashboardPage({ user }) {
  const [colecao, setColecao] = useState("deputados_federais");
  const [pols, setPols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("");
  const [showMap, setShowMap] = useState(false);
  const cur = COLECOES.find(c => c.key === colecao);
  const ok = cur?.ready !== false;
  useEffect(() => {
    if (!ok) { setLoading(false); setPols([]); return; }
    setLoading(true);
    getDocs(collection(db, colecao)).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const n = normalize(list);
      n.sort((a, b) => (b.idx || 0) - (a.idx || 0));
      setPols(n);
      setLoading(false);
    });
  }, [colecao, ok]);
  const filt = pols.filter(p => {
    if (busca && !p.nome?.toLowerCase().includes(busca.toLowerCase())) return false;
    if (uf && p.uf !== uf) return false;
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
    const c = {}; pols.forEach(p => { if (p.uf) c[p.uf] = (c[p.uf]||0)+1; }); return c;
  }, [pols]);
  return (
    <div className="page-container" style={{ maxWidth:900,margin:'0 auto',padding:'20px' }}>
      <div style={{ marginBottom:'24px' }}>
        <h1 style={{ fontSize:'28px',fontWeight:800,color:'var(--text-primary)',fontFamily:'Space Grotesk' }}>Painel de Fiscalizacao</h1>
        <p style={{ color:'var(--text-muted)',fontSize:'14px' }}>{ok?`${filt.length} politicos`:''} · Indice TransparenciaBR (Kim Kataguiri = 100)</p>
      </div>
      <div style={{ display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'16px' }}>
        {COLECOES.map(c => (
          <button key={c.key} onClick={()=>setColecao(c.key)} style={{ padding:'8px 16px',borderRadius:'6px',fontSize:'13px',fontWeight:500,border:colecao===c.key?'1px solid var(--accent-green)':'1px solid var(--border-light)',background:colecao===c.key?'var(--accent-green)':'var(--bg-card)',color:colecao===c.key?'#fff':'var(--text-secondary)',cursor:'pointer' }}>
            {c.label}
            {!c.ready && <span style={{ marginLeft:'6px',padding:'1px 6px',borderRadius:'8px',fontSize:'9px',fontWeight:700,background:'rgba(255,193,7,0.2)',color:'#b8860b',verticalAlign:'super' }}>EM BREVE</span>}
          </button>
        ))}
      </div>
      {!ok ? (
        <div style={{ textAlign:'center',padding:'60px 20px',background:'var(--bg-card)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-light)' }}>
          <h2 style={{ fontSize:'22px',fontWeight:700,marginBottom:'8px' }}>Em Breve</h2>
          <p style={{ fontSize:'15px',color:'var(--text-secondary)',maxWidth:500,margin:'0 auto 16px' }}>Coletando dados de <strong>{cur?.label}</strong>.</p>
          <button onClick={()=>setColecao('deputados_federais')} style={{ padding:'10px 24px',borderRadius:'8px',fontSize:'14px',fontWeight:600,background:'var(--accent-green)',color:'#fff',border:'none',cursor:'pointer' }}>Ver Deputados Federais</button>
        </div>
      ) : (
        <>
          <div style={{ padding:'12px 16px',background:'rgba(74,144,101,0.08)',borderRadius:'var(--radius-sm)',marginBottom:'20px',border:'1px solid rgba(74,144,101,0.2)' }}>
            <p style={{ fontSize:'11px',color:'var(--text-secondary)',lineHeight:1.5 }}><strong>Base legal:</strong> Art. 37 CF/88, Lei 12.527/2011 (LAI). Dados publicos da Camara. Indice apartidario: economia (40%), processos (25%), presenca (20%), proposicoes (10%), defesas (5%).</p>
          </div>
          {!loading && top10.length > 0 && (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(380px, 1fr))',gap:'20px',marginBottom:'32px' }}>
              <div>
                <h2 style={{ fontSize:'18px',fontWeight:700,color:'var(--accent-green)',marginBottom:'12px',fontFamily:'Space Grotesk' }}>Top 10 — Melhores Indices</h2>
                <p style={{ fontSize:'11px',color:'var(--text-muted)',marginBottom:'10px' }}>Maior indice de transparencia, economia e atividade parlamentar.</p>
                {top10.map((p,i) => <Card key={p.id} p={p} rank={i+1} col={colecao} top={true} />)}
              </div>
              <div>
                <h2 style={{ fontSize:'18px',fontWeight:700,color:'var(--accent-red)',marginBottom:'12px',fontFamily:'Space Grotesk' }}>Bottom 10 — Piores Indices</h2>
                <p style={{ fontSize:'11px',color:'var(--text-muted)',marginBottom:'10px' }}>Menor indice. Dados publicos oficiais, sem juizo de valor.</p>
                {bottom10.map((p,i) => <Card key={p.id} p={p} rank={i+1} col={colecao} top={false} />)}
              </div>
            </div>
          )}
          <div style={{ display:'flex',gap:'12px',marginBottom:'16px',flexWrap:'wrap',alignItems:'center' }}>
            <input placeholder="Buscar politico..." value={busca} onChange={e=>setBusca(e.target.value)} style={{ flex:1,padding:'10px 14px',fontSize:'14px',minWidth:'180px' }} />
            <select value={uf} onChange={e=>setUf(e.target.value)} style={{ padding:'10px 14px',fontSize:'14px',minWidth:'100px' }}>
              <option value="">Todos UFs</option>
              {UFS.filter(Boolean).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <button onClick={()=>setShowMap(v=>!v)} style={{ padding:'10px 16px',fontSize:'13px',fontWeight:500,border:showMap?'1px solid var(--accent-green)':'1px solid var(--border-light)',borderRadius:'var(--radius-sm)',cursor:'pointer',background:showMap?'var(--accent-green)':'var(--bg-card)',color:showMap?'#fff':'var(--text-secondary)' }}>Mapa</button>
          </div>
          {showMap && <MapaBrasil onSelectEstado={s=>setUf(s||"")} politicoCounts={counts} />}
          <h2 style={{ fontSize:'18px',fontWeight:700,color:'var(--text-primary)',marginBottom:'12px',fontFamily:'Space Grotesk' }}>Ranking Completo</h2>
          {loading ? <div style={{ textAlign:'center',padding:'40px' }}><p style={{ color:'var(--text-muted)' }}>Carregando...</p></div> : (
            <div>{filt.slice(0,100).map((p,i) => {
              const v = lvl(p.idx);
              return (
                <Link to={`/politico/${colecao}/${p.id}`} key={p.id} style={{ display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',background:'var(--bg-card)',borderRadius:'var(--radius-sm)',marginBottom:'8px',border:'1px solid var(--border-light)',textDecoration:'none',color:'inherit' }}>
                  <span style={{ fontSize:'14px',fontWeight:600,color:'var(--text-muted)',minWidth:'30px' }}>#{i+1}</span>
                  <img src={p.foto||p.urlFoto||p.fotoUrl||'/placeholder-avatar.png'} alt={p.nome} style={{ width:44,height:44,borderRadius:'50%',objectFit:'cover' }} onError={e=>{e.target.src='/placeholder-avatar.png';}} />
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:600,fontSize:'15px',color:'var(--text-primary)' }}>{p.nome}</p>
                    <p style={{ fontSize:'12px',color:'var(--text-muted)' }}>{p.partido} - {p.uf} | {p.cargo||'Deputado Federal'}</p>
                  </div>
                  {p.idx!=null && <div style={{ textAlign:'center',minWidth:'50px' }}>
                    <p style={{ fontSize:'20px',fontWeight:700,fontFamily:'Space Grotesk',color:p.idx>=80?'var(--accent-green)':p.idx>=50?'var(--accent-orange)':'var(--accent-red)' }}>{p.idx}</p>
                    <p style={{ fontSize:'10px',color:'var(--text-muted)' }}>indice</p>
                  </div>}
                  {p.idx!=null && <span className={v.c} style={{ padding:'4px 10px',borderRadius:'10px',fontSize:'11px',fontWeight:600 }}>{v.l}</span>}
                  <span style={{ color:'var(--text-muted)',fontSize:'18px' }}>›</span>
                </Link>);
            })}</div>
          )}
        </>
      )}
    </div>
  );
}
