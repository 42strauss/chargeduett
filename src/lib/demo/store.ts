/**
 * Lokaler Zustand des Demo-Modus (nur im Browser/Gerät, fiktive Daten).
 * Wird – falls möglich – in localStorage gesichert, damit ein Neuladen nichts verliert.
 */
import type { AppMode, ConsentType, Gender, Message, Profile, UserVehicle, VehicleRating } from '../types';
import { MODELS } from './data';

export const ME = 'demo-me';
const KEY = 'chargeduett-demo-v1';

/** Feste Demo-Position: direkt an der Rastanlage Lindenhain Ost (fiktiv). */
export const DEMO_POSITION = { lat: 50.0501, lng: 8.6002 };

export interface DemoStation {
  id: number;
  name: string;
  operator: string;
  street: string;
  city: string;
  lat: number;
  lng: number;
  max_power_kw: number;
  num_points: number;
  is_highway: boolean;
}

export const STATIONS: DemoStation[] = [
  { id: 1, name: 'Rastanlage Lindenhain Ost (Demo)', operator: 'Demo-Laden GmbH', street: 'A 5', city: 'Lindenhain', lat: 50.05, lng: 8.6, max_power_kw: 400, num_points: 12, is_highway: true },
  { id: 2, name: 'Schnellladepark Birkenfeld (Demo)', operator: 'Demo-Laden GmbH', street: 'Gewerbering 4', city: 'Birkenfeld', lat: 50.07, lng: 8.68, max_power_kw: 300, num_points: 8, is_highway: false },
  { id: 3, name: 'Autohof Eichstetten (Demo)', operator: 'Beispiel Energie', street: 'Autohof 1', city: 'Eichstetten', lat: 50.12, lng: 8.83, max_power_kw: 150, num_points: 4, is_highway: true },
  { id: 4, name: 'Supermarkt Ahornplatz (Demo)', operator: 'Beispiel Energie', street: 'Ahornplatz 2', city: 'Ahornplatz', lat: 50.23, lng: 8.95, max_power_kw: 50, num_points: 2, is_highway: false },
  { id: 5, name: 'HPC Fichtenau (Demo)', operator: 'Demo-Laden GmbH', street: 'Fichtenweg 9', city: 'Fichtenau', lat: 50.058, lng: 8.61, max_power_kw: 350, num_points: 6, is_highway: false },
  { id: 6, name: 'Rastplatz Kastanienhöhe (Demo)', operator: 'Beispiel Energie', street: 'A 3', city: 'Kastanienhöhe', lat: 50.95, lng: 7.6, max_power_kw: 300, num_points: 10, is_highway: true },
  { id: 7, name: 'Ladepark Elbwiesen (Demo)', operator: 'Nordstrom Demo', street: 'Hafenkante 1', city: 'Hamburg', lat: 53.53, lng: 10.03, max_power_kw: 400, num_points: 16, is_highway: false },
  { id: 8, name: 'HPC Isarauen (Demo)', operator: 'Südlader Demo', street: 'Isarring 7', city: 'München', lat: 48.13, lng: 11.58, max_power_kw: 300, num_points: 8, is_highway: false },
  { id: 9, name: 'Schnelllader Spreebogen (Demo)', operator: 'Hauptstadtstrom Demo', street: 'Uferweg 3', city: 'Berlin', lat: 52.52, lng: 13.37, max_power_kw: 350, num_points: 12, is_highway: false },
];

function avatar(initial: string, a: string, b: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 42 56"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="42" height="56" fill="url(#g)"/><circle cx="21" cy="22" r="10" fill="rgba(255,255,255,.88)"/><path d="M3 56c0-12 8-20 18-20s18 8 18 20z" fill="rgba(255,255,255,.88)"/><text x="21" y="26" font-size="10" text-anchor="middle" fill="${a}" font-family="Arial, sans-serif" font-weight="900">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const modelId = (make: string, model: string, variant = '') =>
  MODELS.find((m) => m.make === make && m.model === model && m.variant === variant)?.id ?? MODELS[0].id;

export interface DemoPerson {
  id: string;
  display_name: string;
  age: number;
  gender: Gender;
  bio: string;
  occupation: string;
  photos: string[];
  modes: AppMode[];
  dating_genders: Gender[];
  station_id: number;
  model_id: number;
  nickname: string;
  /** In diesen Modi hat die Person "mich" bereits geliked → Match beim Like */
  likes_me: AppMode[];
  replies: string[];
}

export const PEOPLE: DemoPerson[] = [
  {
    id: 'p-lena', display_name: 'Lena', age: 31, gender: 'female', occupation: 'UX-Designerin', station_id: 1,
    bio: 'Roadtrips, Hörbücher und die Suche nach dem besten Raststätten-Croissant.', photos: [avatar('L', '#ff7a59', '#ffc400')],
    modes: ['friendship', 'dating'], dating_genders: ['male'], model_id: modelId('Tesla', 'Model Y', 'Long Range'), nickname: 'Polarstern',
    likes_me: ['friendship', 'dating'],
    replies: ['Hi! Ja, ich steh an Säule 4 😄', 'Kaffee klingt gut – ich hab noch ca. 20 Minuten.', 'Bis gleich am Eingang vom Rasthaus!'],
  },
  {
    id: 'p-sophie', display_name: 'Sophie', age: 29, gender: 'female', occupation: 'Tierärztin', station_id: 1,
    bio: 'Hundemensch 🐕 Lädt am liebsten mit Aussicht.', photos: [avatar('S', '#e5484d', '#ff9ec7')],
    modes: ['friendship', 'dating'], dating_genders: ['male'], model_id: modelId('Hyundai', 'Ioniq 5', '84 kWh'), nickname: 'Pixel',
    likes_me: [], replies: ['Hallo 👋', 'Mein Hund wartet im Auto, aber kurz quatschen geht!'],
  },
  {
    id: 'p-jonas', display_name: 'Jonas', age: 38, gender: 'male', occupation: 'Key Account Manager', station_id: 2,
    bio: 'Vertrieb Erneuerbare. Immer offen für einen Austausch übers Laden.', photos: [avatar('J', '#6f42c1', '#1f6feb')],
    modes: ['friendship', 'networking'], dating_genders: [], model_id: modelId('Kia', 'EV6', '84 kWh'), nickname: 'Blauer Blitz',
    likes_me: ['networking'], replies: ['Servus! Was machst du beruflich?', 'Lass uns gern auf LinkedIn connecten.'],
  },
  {
    id: 'p-kemal', display_name: 'Kemal', age: 45, gender: 'male', occupation: 'Geschäftsführer', station_id: 3,
    bio: 'Unternehmer, viel unterwegs zwischen Rhein und Main.', photos: [avatar('K', '#111111', '#fcc400')],
    modes: ['friendship', 'networking'], dating_genders: [], model_id: modelId('BMW', 'i4', 'eDrive40'), nickname: 'Graphit',
    likes_me: [], replies: ['Hallo, freut mich!'],
  },
  {
    id: 'p-anja', display_name: 'Anja', age: 52, gender: 'female', occupation: 'Ingenieurin', station_id: 4,
    bio: 'Wandern, Jazz, E-Auto seit 2019.', photos: [avatar('A', '#2da44e', '#bfe8c8')],
    modes: ['friendship', 'networking'], dating_genders: [], model_id: modelId('Škoda', 'Enyaq', '85'), nickname: 'Waldfee',
    likes_me: [], replies: ['Hallo!'],
  },
  {
    id: 'p-tobias', display_name: 'Tobias', age: 34, gender: 'male', occupation: 'Lehrer', station_id: 6,
    bio: 'Fährt jeden Freitag zu den Eltern ins Sauerland.', photos: [avatar('T', '#1f6feb', '#00b3c7')],
    modes: ['friendship'], dating_genders: [], model_id: modelId('Volkswagen', 'ID.3', 'Pro S'), nickname: 'Kiste',
    likes_me: [], replies: ['Hey!'],
  },
  {
    id: 'p-paula', display_name: 'Paula', age: 27, gender: 'female', occupation: 'Journalistin', station_id: 8,
    bio: 'Schreibt über Mobilität. Sammle gute Ladestories 🎙️', photos: [avatar('P', '#ff1a1a', '#fcc400')],
    modes: ['friendship', 'networking'], dating_genders: [], model_id: modelId('Renault', 'R5 E-Tech', '52 kWh'), nickname: 'Zitrone',
    likes_me: ['friendship', 'networking'],
    replies: ['Hi aus München! Wo lädst du gerade?', 'Hörst du eigentlich Auto Duett? 😉'],
  },
  {
    id: 'p-deniz', display_name: 'Deniz', age: 41, gender: 'diverse', occupation: 'Softwareentwickler:in', station_id: 9,
    bio: 'Baut Lade-Apps und testet sie live.', photos: [avatar('D', '#8250df', '#ff7a59')],
    modes: ['friendship', 'networking', 'dating'], dating_genders: ['female', 'male', 'diverse'], model_id: modelId('Polestar', '2', 'Long Range'), nickname: 'Nordlicht',
    likes_me: [], replies: ['Moin aus Berlin!'],
  },
  {
    id: 'p-finn', display_name: 'Finn', age: 36, gender: 'male', occupation: 'Pilot', station_id: 7,
    bio: 'Zwischen zwei Flügen laden – Hamburg ist mein Hafen.', photos: [avatar('F', '#0e7c86', '#7ee0c3')],
    modes: ['friendship', 'dating'], dating_genders: ['female'], model_id: modelId('BYD', 'Seal'), nickname: 'Möwe',
    likes_me: [], replies: ['Moin!'],
  },
];

export interface DemoMatch {
  id: string;
  partner: string;
  mode: AppMode;
  created_at: string;
  unmatched: boolean;
}

export interface DemoState {
  signedIn: boolean;
  email: string | null;
  profile: Profile | null;
  consents: Record<ConsentType, boolean>;
  vehicles: UserVehicle[];
  ratings: VehicleRating[];
  session: { session_id: string; station_id: number; vehicle_id: string | null; started_at: string; expires_at: string } | null;
  swipes: { target: string; mode: AppMode; direction: 'like' | 'pass' }[];
  matches: DemoMatch[];
  messages: Message[];
  blocked: string[];
  reports: { target: string; reason: string; details?: string; at: string }[];
  notifications: { matches: boolean; messages: boolean; message_preview: boolean; station_activity: boolean };
  seq: number;
}

const fresh = (): DemoState => ({
  signedIn: false,
  email: null,
  profile: null,
  consents: { terms: false, privacy: false, location: false, data_sharing: false, ads_personalization: false },
  vehicles: [],
  ratings: [],
  session: null,
  swipes: [],
  matches: [],
  messages: [],
  blocked: [],
  reports: [],
  notifications: { matches: true, messages: true, message_preview: false, station_activity: false },
  seq: 1,
});

function load(): DemoState {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as DemoState) };
  } catch {
    /* Speicher nicht verfügbar */
  }
  return fresh();
}

export const state: DemoState = load();

export function save() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignorieren */
  }
}

export function reset() {
  Object.assign(state, fresh());
  save();
}

export function nextId(prefix: string) {
  state.seq += 1;
  return `${prefix}-${state.seq}-${Date.now().toString(36)}`;
}

/** Fertiges Demo-Profil "Max" mit Auto, damit man direkt loslegen kann. */
export function loadPresetProfile() {
  state.profile = {
    id: ME,
    display_name: 'Max',
    birthdate: '1992-03-14',
    gender: 'male',
    bio: 'Fahre jede Woche Frankfurt–Köln. Kaffee an der Säule? Immer.',
    occupation: 'Produktmanager',
    modes: ['friendship', 'networking', 'dating'],
    dating_genders: ['female'],
    age_min: 25,
    age_max: 45,
    photos: [avatar('M', '#fcc400', '#ff1a1a')],
    locale: 'de',
    is_banned: false,
  };
  state.consents = { terms: true, privacy: true, location: true, data_sharing: false, ads_personalization: false };
  state.vehicles = [
    {
      id: nextId('veh'),
      user_id: ME,
      model_id: modelId('Volkswagen', 'ID.7 Tourer', 'Pro'),
      nickname: 'Silberpfeil',
      description: 'Silber, Anhängerkupplung, Fahrradträger',
      model_year: 2024,
      is_primary: true,
    },
  ];
}

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
