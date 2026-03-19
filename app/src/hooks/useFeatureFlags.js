import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

// Default flags - all new features OFF by default
const DEFAULT_FLAGS = {
  nepotismo: false,
  emendas: false,
  rankingNepotismo: false,
  rankingEmendas: false,
};

export default function useFeatureFlags() {
  const [flags, setFlags] = useState(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to Firestore doc config/features for real-time flag updates
    const unsub = onSnapshot(
      doc(db, "config", "features"),
      (snap) => {
        if (snap.exists()) {
          setFlags({ ...DEFAULT_FLAGS, ...snap.data() });
        }
        setLoading(false);
      },
      (err) => {
        console.log("Feature flags not found, using defaults");
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  return { flags, loading };
}
