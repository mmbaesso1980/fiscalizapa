import { initializeApp } from "firebase/app";
import { getFunctions } from "firebase/functions";

// Usa variáveis de ambiente .env import.meta
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY || "dummy",
  projectId:         import.meta.env.VITE_PROJECT_ID || "fiscallizapa",
};

// Evita crashs durante testes e builds caso as keys não sejam providas
const app = initializeApp(firebaseConfig);

// Resolução da Sincronia de Geopolítica de Dados: estritamente us-central1
export const functions = getFunctions(app, "us-central1");
