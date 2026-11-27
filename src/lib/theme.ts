/**
 * Farbwelt im Stil des Podcasts "Auto Duett": Gelb, Rot, Schwarz.
 * Bewusst immer dunkel – Gelb hat auf Weiß zu wenig Kontrast für Text und Icons.
 */
const brand = {
  bg: '#0E0E0E',
  card: '#1B1B1B',
  text: '#FFFFFF',
  muted: '#A8A8A8',
  border: '#2E2E2E',
  primary: '#FCC400',      // Auto-Duett-Gelb
  primaryText: '#111111',
  accent: '#FF1A1A',       // Auto-Duett-Rot
  danger: '#E50000',
  like: '#FCC400',
  pass: '#8C8C8C',
  overlay: 'rgba(0,0,0,0.7)',
  chipBg: '#2A2A2A',
};

export type Theme = typeof brand;

export function useTheme(): Theme {
  return brand;
}

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 };
export const space = (n: number) => n * 4;
