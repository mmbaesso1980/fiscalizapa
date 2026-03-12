import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../lib/firebase";

const DEPUTADOS = [
  "Igor Normando","Eraldo Pimenta","Carlos Bordalo","Dirceu Ten Caten","Cilene Couto",
  "Ana Cunha","Fábio Freitas","Miro Sanova","Ozorio Juvenil","Chicão",
  "Eliel Faustino","Thiago Araujo","Felipe Souza","Luiz Moura","Luth Rebelo",
  "Gustavo Sefer","Delegado Caveira","Josué Caminhoneiro","Rogério Barra","Daniel Vilar",
  "Dra. Heloisa","Chamonzinho","Wanderlan Quaresma","Renilce Nicodemos","Michele Begot",
  "Toni Cunha","Adjuto Afonso","Amilton Neto","Jaques Neves","Nilse Pinheiro",
  "Antonio Tonheiro","Dra. Adriana","Carlos Augusto","Gerson Peres","Tavares Neto",
  "Fábio Filgueiras","Professor Lemos","Roberto Melo","Raimundo Santos","Iran Lima","Tiago Araujo"
];

export default function DashboardPage({ user }) {
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "credit_wallets", user.uid)).then(s => {
      if (s.exists()) setWallet(s.data());
    });
  }, [user]);

  if (!user) return <div className="p-8 text-center text-lg">Faca login para acessar o dashboard.</div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Dashboard</h2>
      {wallet && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6 flex gap-6 flex-wrap">
          <div><span className="text-sm text-gray-500">Creditos Usados Hoje</span><div className="text-xl font-bold text-indigo-700">{wallet.daily_free_used} / {wallet.daily_free_total}</div></div>
          <div><span className="text-sm text-gray-500">Extras</span><div className="text-xl font-bold text-green-600">{wallet.extra_credits_balance}</div></div>
        </div>
      )}
      <h3 className="text-lg font-semibold mb-3 text-gray-700">Deputados Estaduais do Para (41)</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {DEPUTADOS.map((name, i) => (
          <Link key={i} to={"/deputado/" + encodeURIComponent(name)} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-indigo-300 transition-all">
            <div className="font-medium text-gray-800">{name}</div>
            <div className="text-xs text-gray-400 mt-1">Ver perfil</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
