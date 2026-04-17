import { useId } from "react";

/** Marca orbe — gradientes com IDs únicos por instância (evita colisão SVG na página). */
export default function LogoOrb({ size = 32 }) {
  const uid = useId().replace(/:/g, "");
  const ga = `orbA-${uid}`;
  const gb = `orbB-${uid}`;
  const gc = `orbC-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <defs>
        <linearGradient id={ga} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FBD87F" />
          <stop offset="35%" stopColor="#F7B98B" />
          <stop offset="65%" stopColor="#A8D8B0" />
          <stop offset="100%" stopColor="#9ECFE8" />
        </linearGradient>
        <linearGradient id={gb} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FBD87F" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#F7B98B" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#9ECFE8" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id={gc} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#A8D8B0" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#F7B98B" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <path d="M50 8 A42 42 0 1 1 49.9 8" stroke={`url(#${ga})`} strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d="M50 16 A34 34 0 1 0 49.9 16" stroke={`url(#${gb})`} strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M50 26 A24 24 0 1 1 49.9 26" stroke={`url(#${gc})`} strokeWidth="7" fill="none" strokeLinecap="round" />
    </svg>
  );
}
