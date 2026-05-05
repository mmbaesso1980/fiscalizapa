import { Routes, Route } from 'react-router-dom';
import GlobalSearch from './components/GlobalSearch';
import Home from './pages/Home';
import Dossie from './pages/Dossie';
import Mapa from './pages/Mapa';
import DossieGroundedPage from './pages/DossieGroundedPage';

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-satoshi">
      <header className="bg-slate-900 text-white p-4 font-cabinet flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-bold shrink-0">TransparênciaBR</h1>
        <div className="flex-1 max-w-2xl flex justify-center min-w-[200px]">
          <GlobalSearch />
        </div>
      </header>
      <main className="p-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dossie/:id" element={<Dossie />} />
          <Route path="/politica/dossie/:nome" element={<DossieGroundedPage />} />
          <Route path="/mapa" element={<Mapa />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
