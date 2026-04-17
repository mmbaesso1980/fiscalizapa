import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Dossie from './pages/Dossie';
import Mapa from './pages/Mapa';

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-satoshi">
      <header className="bg-slate-900 text-white p-4 font-cabinet">
        <h1 className="text-xl font-bold">TransparênciaBR</h1>
      </header>
      <main className="p-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dossie/:id" element={<Dossie />} />
          <Route path="/mapa" element={<Mapa />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
