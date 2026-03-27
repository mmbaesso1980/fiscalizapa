import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDuII-aOUbsrVv3H-Qb_0XSe1XLV97Da24",
  authDomain: "fiscallizapa.firebaseapp.com",
  projectId: "fiscallizapa",
  storageBucket: "fiscallizapa.firebasestorage.app",
  messagingSenderId: "993207283220",
  appId: "1:993207283220:web:b58b551b41104a3ada0101",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
export const db = getFirestore(app);
export const functions = getFunctions(app, "southamerica-east1");
