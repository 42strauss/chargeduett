/**
 * Demo-Backend: bildet die Supabase-RPCs lokal nach (gleiche Regeln wie
 * supabase/migrations/*_functions.sql, aber mit fiktiven Personen).
 * Wird nur benutzt, wenn EXPO_PUBLIC_DEMO=1 gesetzt ist.
 */
import type * as real from '../api.real';
import type {
  ActiveSession,
  AppMode,
  Candidate,
  ConsentType,
  DistanceBucket,
  MatchListItem,
  Message,
  ModelReview,
  ModelScore,
  NearbyStation,
  Profile,
  RatingCriterion,
  UserVehicle,
  VehicleRating,
} from '../types';
import { RATING_CRITERIA } from '../types';
import { MODELS, SEED_RATINGS } from './data';
import { ME, PEOPLE, STATIONS, distanceM, nextId, reset, save, state, type DemoPerson } from './store';

const CHECKIN_RADIUS_M = 250;
const MOVED_AWAY_M = 500;
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const fail = (code: string): never => {
  throw new Error(code);
};
const now = () => new Date().toISOString();

function requireProfile(): Profile {
  if (!state.signedIn) fail('NOT_AUTHENTICATED');
  if (!state.profile) fail('PROFILE_MISSING');
  return state.profile!;
}

function activeSession() {
  const s = state.session;
  if (!s) return null;
  if (new Date(s.expires_at).getTime() <= Date.now()) {
    state.session = null;
    save();
    return null;
  }
  return s;
}

const stationOf = (id: number) => STATIONS.find((s) => s.id === id)!;
const personOf = (id: string) => PEOPLE.find((p) => p.id === id);
const visiblePeople = () => PEOPLE.filter((p) => !state.blocked.includes(p.id));

// ---------------------------------------------------------------- Listener (Ersatz für Realtime)
const messageListeners = new Map<string, Set<(m: Message) => void>>();
const listListeners = new Set<() => void>();

function emitMessage(m: Message) {
  messageListeners.get(m.match_id)?.forEach((fn) => fn(m));
  listListeners.forEach((fn) => fn());
}

function scheduleReply(matchId: string, partner: DemoPerson) {
  const sentByPartner = state.messages.filter((m) => m.match_id === matchId && m.sender_id === partner.id).length;
  const text = partner.replies[sentByPartner];
  if (!text) return;
  setTimeout(() => {
    const match = state.matches.find((m) => m.id === matchId);
    if (!match || match.unmatched || state.blocked.includes(partner.id)) return;
    const msg: Message = { id: state.seq + 1000, match_id: matchId, sender_id: partner.id, body: text, created_at: now(), read_at: null };
    state.seq += 1;
    state.messages.push(msg);
    // Partner hat meine Nachrichten gelesen
    state.messages.forEach((m) => {
      if (m.match_id === matchId && m.sender_id === ME && !m.read_at) m.read_at = now();
    });
    save();
    emitMessage(msg);
  }, 2500 + Math.random() * 1500);
}

// ---------------------------------------------------------------- Bewertungen
type RatingRow = Record<RatingCriterion, number> & { model_id: number; comment: string | null; author: string; updated_at: string; id: string };

function allRatings(): RatingRow[] {
  const seed = SEED_RATINGS.map((r, i) => ({ ...r, id: `seed-${i}`, updated_at: '2026-11-01T10:00:00Z' }));
  const mine = state.ratings.map((r) => ({
    ...r,
    id: r.id ?? 'mine',
    author: `${state.profile?.display_name?.[0] ?? '?'}.`,
    updated_at: now(),
  })) as RatingRow[];
  return [...seed, ...mine];
}

const overallOf = (r: Record<RatingCriterion, number>) => RATING_CRITERIA.reduce((s, k) => s + r[k], 0) / RATING_CRITERIA.length;
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function scoreFor(modelId: number): ModelScore | null {
  const m = MODELS.find((x) => x.id === modelId);
  if (!m) return null;
  const rs = allRatings().filter((r) => r.model_id === modelId);
  const avg = (k: RatingCriterion) => (rs.length ? round(rs.reduce((s, r) => s + r[k], 0) / rs.length) : null);
  return {
    model_id: m.id,
    make: m.make,
    model: m.model,
    variant: m.variant,
    body_type: m.body_type,
    battery_kwh_net: m.battery_kwh_net,
    dc_max_kw: m.dc_max_kw,
    wltp_range_km: m.wltp_range_km,
    rating_count: rs.length,
    overall: rs.length ? round(rs.reduce((s, r) => s + overallOf(r), 0) / rs.length) : null,
    range_real: avg('range_real'),
    charging_speed: avg('charging_speed'),
    consumption: avg('consumption'),
    software: avg('software'),
    comfort: avg('comfort'),
    build_quality: avg('build_quality'),
    value_for_money: avg('value_for_money'),
  };
}

const matchesQuery = (q: string, ...fields: (string | null)[]) => {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hay = fields.join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
};

// ---------------------------------------------------------------- Implementierung
export const demoApi: typeof real = {
  CONSENT_VERSION: 'demo',

  async getMyProfile() {
    await wait(50);
    return state.signedIn ? state.profile : null;
  },

  async upsertMyProfile(input, isNew) {
    await wait();
    if (!state.signedIn) fail('NOT_AUTHENTICATED');
    if (input.birthdate) {
      const age = (Date.now() - new Date(input.birthdate).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 18) fail('UNDERAGE');
    }
    const base: Profile = state.profile ?? {
      id: ME, display_name: '', birthdate: '1990-01-01', gender: 'diverse', bio: null, occupation: null,
      modes: ['friendship'], dating_genders: [], age_min: 18, age_max: 99, photos: [], locale: 'de', is_banned: false,
    };
    if (!isNew && input.birthdate && input.birthdate !== base.birthdate) fail('BIRTHDATE_LOCKED');
    state.profile = { ...base, ...input } as Profile;
    save();
    return state.profile;
  },

  async giveConsents(c) {
    Object.assign(state.consents, c);
    save();
  },

  async getMyConsents() {
    return { ...state.consents };
  },

  async uploadPhoto(localUri) {
    await wait(200);
    // Im Browser liefert der Bildwähler eine data:/blob:-URL – die verwenden wir direkt.
    return localUri;
  },

  async deletePhotos() {},

  async nearbyStations(lat, lng, radiusKm = 25) {
    await wait();
    const pos = { lat, lng };
    return STATIONS.map<NearbyStation>((s) => ({
      id: s.id,
      name: s.name,
      operator: s.operator,
      street: s.street,
      city: s.city,
      max_power_kw: s.max_power_kw,
      num_points: s.num_points,
      is_highway: s.is_highway,
      lat: s.lat,
      lng: s.lng,
      distance_m: Math.round(distanceM(pos, s)),
      active_users: visiblePeople().filter((p) => p.station_id === s.id).length + (activeSession()?.station_id === s.id ? 0 : 0),
    }))
      .filter((s) => s.distance_m <= radiusKm * 1000)
      .sort((a, b) => a.distance_m - b.distance_m);
  },

  async checkIn(lat, lng, vehicleId, stationId) {
    await wait(300);
    requireProfile();
    if (!state.consents.location) fail('LOCATION_CONSENT_MISSING');
    const pos = { lat, lng };
    const st = STATIONS.filter((s) => (stationId ? s.id === stationId : true) && s.max_power_kw >= 50)
      .map((s) => ({ s, d: distanceM(pos, s) }))
      .filter((x) => x.d <= CHECKIN_RADIUS_M)
      .sort((a, b) => a.d - b.d)[0];
    if (!st) fail('NO_STATION_NEARBY');
    const v = vehicleId ? state.vehicles.find((x) => x.id === vehicleId) : state.vehicles.find((x) => x.is_primary) ?? state.vehicles[0];
    const started = new Date();
    state.session = {
      session_id: nextId('sess'),
      station_id: st!.s.id,
      vehicle_id: v?.id ?? null,
      started_at: started.toISOString(),
      expires_at: new Date(started.getTime() + 60 * 60000).toISOString(),
    };
    save();
    return { session_id: state.session.session_id, station_name: st!.s.name, expires_at: state.session.expires_at };
  },

  async checkOut() {
    state.session = null;
    save();
  },

  async extendSession() {
    const s = activeSession();
    if (!s) return fail('NO_ACTIVE_SESSION');
    const max = new Date(s.started_at).getTime() + 180 * 60000;
    s.expires_at = new Date(Math.min(Date.now() + 30 * 60000, max)).toISOString();
    save();
    return { expires_at: s.expires_at };
  },

  async heartbeat(lat, lng) {
    const s = activeSession();
    if (!s) return { active: false };
    if (distanceM({ lat, lng }, stationOf(s.station_id)) > MOVED_AWAY_M) {
      state.session = null;
      save();
      return { active: false, reason: 'moved_away' as const };
    }
    return { active: true };
  },

  async myActiveSession() {
    await wait(50);
    const s = activeSession();
    if (!s || !state.signedIn) return null;
    const st = stationOf(s.station_id);
    const people = visiblePeople();
    return {
      session_id: s.session_id,
      station_id: st.id,
      station_name: st.name,
      station_city: st.city,
      vehicle_id: s.vehicle_id,
      started_at: s.started_at,
      expires_at: s.expires_at,
      people_here: people.filter((p) => p.station_id === st.id).length,
      people_nearby: people.filter((p) => distanceM(stationOf(p.station_id), st) <= 50000).length,
    } satisfies ActiveSession;
  },

  async discoveryCandidates(mode: AppMode, radiusKm = 50) {
    await wait(250);
    const me = requireProfile();
    const s = activeSession();
    if (!s || !me.modes.includes(mode)) return [];
    const mySt = stationOf(s.station_id);
    const matched = new Set(state.matches.map((m) => m.partner));
    const swiped = new Set(state.swipes.filter((x) => x.mode === mode).map((x) => x.target));
    const myAge = (Date.now() - new Date(me.birthdate).getTime()) / (365.25 * 24 * 3600 * 1000);
    return visiblePeople()
      .map((p) => ({ p, st: stationOf(p.station_id), d: distanceM(stationOf(p.station_id), mySt) }))
      .filter(({ p, d }) => {
        if (radiusKm > 0 && d > radiusKm * 1000) return false;
        if (!p.modes.includes(mode) || matched.has(p.id) || swiped.has(p.id)) return false;
        if (mode === 'dating') {
          if (!me.dating_genders.includes(p.gender) || !p.dating_genders.includes(me.gender)) return false;
          if (p.age < me.age_min || p.age > me.age_max) return false;
          if (myAge < 18) return false;
        }
        return true;
      })
      .sort((a, b) => Number(b.st.id === mySt.id) - Number(a.st.id === mySt.id) || a.d - b.d)
      .map<Candidate>(({ p, st, d }) => {
        const m = MODELS.find((x) => x.id === p.model_id);
        const same = st.id === mySt.id;
        const bucket: DistanceBucket = same ? 'same_station' : d < 10000 ? 'lt10' : d < 25000 ? 'lt25' : d < 50000 ? 'lt50' : d < 100000 ? 'lt100' : d < 250000 ? 'lt250' : 'far';
        return {
          user_id: p.id,
          display_name: p.display_name,
          age: p.age,
          gender: p.gender,
          bio: p.bio,
          occupation: p.occupation,
          photos: p.photos,
          modes: p.modes,
          vehicle_make: m?.make ?? null,
          vehicle_model: m?.model ?? null,
          vehicle_nickname: p.nickname,
          same_station: same,
          station_name: same ? st.name : null,
          distance_bucket: bucket,
        };
      });
  },

  async swipe(target, direction, mode) {
    await wait(150);
    requireProfile();
    if (!activeSession()) fail('NO_ACTIVE_SESSION');
    const p = personOf(target);
    if (!p || state.blocked.includes(target)) fail('TARGET_NOT_AVAILABLE');
    state.swipes = state.swipes.filter((x) => !(x.target === target && x.mode === mode));
    state.swipes.push({ target, mode, direction });
    let res: { matched: boolean; match_id?: string } = { matched: false };
    if (direction === 'like' && p!.likes_me.includes(mode) && !state.matches.some((m) => m.partner === target)) {
      const id = nextId('match');
      state.matches.push({ id, partner: target, mode, created_at: now(), unmatched: false });
      res = { matched: true, match_id: id };
      listListeners.forEach((fn) => fn());
    }
    save();
    return res;
  },

  async myMatches() {
    await wait(80);
    return state.matches
      .filter((m) => !m.unmatched && !state.blocked.includes(m.partner))
      .map<MatchListItem>((m) => {
        const p = personOf(m.partner)!;
        const msgs = state.messages.filter((x) => x.match_id === m.id);
        const last = msgs[msgs.length - 1];
        return {
          match_id: m.id,
          mode: m.mode,
          created_at: m.created_at,
          partner_id: p.id,
          partner_name: p.display_name,
          partner_age: p.age,
          partner_photo: p.photos[0] ?? null,
          last_message: last?.body ?? null,
          last_message_at: last?.created_at ?? null,
          last_message_mine: last ? last.sender_id === ME : null,
          unread: msgs.filter((x) => x.sender_id !== ME && !x.read_at).length,
        };
      })
      .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at));
  },

  async matchPartner(matchId) {
    await wait(50);
    const m = state.matches.find((x) => x.id === matchId && !x.unmatched);
    if (!m || state.blocked.includes(m.partner)) return null;
    const p = personOf(m.partner)!;
    const model = MODELS.find((x) => x.id === p.model_id)!;
    return {
      user_id: p.id,
      display_name: p.display_name,
      age: p.age,
      gender: p.gender,
      bio: p.bio,
      occupation: p.occupation,
      photos: p.photos,
      modes: p.modes,
      mode: m.mode,
      vehicles: [{ make: model.make, model: model.model, variant: model.variant, nickname: p.nickname, description: null, model_year: null }],
    };
  },

  async loadMessages(matchId) {
    await wait(50);
    return state.messages.filter((m) => m.match_id === matchId);
  },

  async sendMessage(matchId, body) {
    await wait(100);
    const m = state.matches.find((x) => x.id === matchId && !x.unmatched);
    if (!m) fail('TARGET_NOT_AVAILABLE');
    const msg: Message = { id: state.seq + 1000, match_id: matchId, sender_id: ME, body: body.trim(), created_at: now(), read_at: null };
    state.seq += 1;
    state.messages.push(msg);
    save();
    listListeners.forEach((fn) => fn());
    scheduleReply(matchId, personOf(m!.partner)!);
    return msg;
  },

  async markRead(matchId) {
    state.messages.forEach((m) => {
      if (m.match_id === matchId && m.sender_id !== ME && !m.read_at) m.read_at = now();
    });
    save();
  },

  async unmatch(matchId) {
    const m = state.matches.find((x) => x.id === matchId);
    if (m) m.unmatched = true;
    save();
  },

  async blockUser(userId) {
    if (!state.blocked.includes(userId)) state.blocked.push(userId);
    state.matches.forEach((m) => {
      if (m.partner === userId) m.unmatched = true;
    });
    save();
  },

  async reportUser(userId, reason, details) {
    state.reports.push({ target: userId, reason, details, at: now() });
    await demoApi.blockUser(userId);
  },

  subscribeMessages(matchId, onMessage) {
    if (!messageListeners.has(matchId)) messageListeners.set(matchId, new Set());
    messageListeners.get(matchId)!.add(onMessage);
    return () => messageListeners.get(matchId)?.delete(onMessage);
  },

  subscribeMatchList(onChange) {
    listListeners.add(onChange);
    return () => listListeners.delete(onChange);
  },

  async searchModels(query) {
    await wait(50);
    return MODELS.filter((m) => matchesQuery(query, m.make, m.model, m.variant)).slice(0, 200);
  },

  async getModel(id) {
    return MODELS.find((m) => m.id === id) ?? null;
  },

  async myVehicles() {
    await wait(50);
    return state.vehicles
      .map((v) => ({ ...v, vehicle_models: MODELS.find((m) => m.id === v.model_id) }))
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  },

  async addVehicle(v) {
    const row: UserVehicle = {
      id: nextId('veh'),
      user_id: ME,
      model_id: v.model_id,
      nickname: v.nickname ?? null,
      description: v.description ?? null,
      model_year: v.model_year ?? null,
      is_primary: state.vehicles.length === 0,
    };
    state.vehicles.push(row);
    save();
    return row;
  },

  async updateVehicle(id, patch) {
    const v = state.vehicles.find((x) => x.id === id);
    if (v) Object.assign(v, patch);
    save();
  },

  async setPrimaryVehicle(id) {
    state.vehicles.forEach((v) => (v.is_primary = v.id === id));
    save();
  },

  async deleteVehicle(id) {
    state.vehicles = state.vehicles.filter((v) => v.id !== id);
    if (state.vehicles.length && !state.vehicles.some((v) => v.is_primary)) state.vehicles[0].is_primary = true;
    save();
  },

  async modelScores(query = '') {
    await wait(80);
    return MODELS.filter((m) => matchesQuery(query, m.make, m.model))
      .map((m) => scoreFor(m.id)!)
      .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1) || b.rating_count - a.rating_count || a.make.localeCompare(b.make));
  },

  async modelScore(modelId) {
    return scoreFor(modelId);
  },

  async modelReviews(modelId) {
    await wait(50);
    return allRatings()
      .filter((r) => r.model_id === modelId)
      .sort((a, b) => Number(!!b.comment) - Number(!!a.comment))
      .map<ModelReview>((r) => ({ ...r, overall: round(overallOf(r), 1) }));
  },

  async myRating(modelId) {
    return state.ratings.find((r) => r.model_id === modelId) ?? null;
  },

  async saveRating(r) {
    if (!state.vehicles.some((v) => v.model_id === r.model_id)) fail('VEHICLE_NOT_OWNED');
    const row: VehicleRating = { ...r, user_id: ME, id: `mine-${r.model_id}` };
    state.ratings = [...state.ratings.filter((x) => x.model_id !== r.model_id), row];
    save();
  },

  async registerPushToken() {},

  async getNotificationSettings() {
    return { ...state.notifications };
  },

  async saveNotificationSettings(patch) {
    Object.assign(state.notifications, patch);
    save();
  },

  async exportMyData() {
    return {
      exported_at: now(),
      hinweis: 'Demo-Daten – nur in diesem Browser gespeichert',
      profile: state.profile,
      consents: state.consents as Record<ConsentType, boolean>,
      vehicles: state.vehicles,
      ratings: state.ratings,
      charging_session: state.session,
      swipes: state.swipes,
      matches: state.matches,
      messages_sent: state.messages.filter((m) => m.sender_id === ME),
      blocks: state.blocked,
      reports_filed: state.reports,
    };
  },

  async deleteMyAccount() {
    reset();
    demoAuth.notify();
  },
};

// ---------------------------------------------------------------- Demo-Anmeldung
type AuthListener = (event: string, session: unknown) => void;
const authListeners = new Set<AuthListener>();
const fakeSession = () => (state.signedIn ? { user: { id: ME, email: state.email ?? 'demo@chargeduett.app' }, access_token: 'demo' } : null);

export const demoAuth = {
  notify() {
    const s = fakeSession();
    authListeners.forEach((fn) => fn(s ? 'SIGNED_IN' : 'SIGNED_OUT', s));
  },
  async getSession() {
    return { data: { session: fakeSession() }, error: null };
  },
  onAuthStateChange(cb: AuthListener) {
    authListeners.add(cb);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
  },
  async signInWithPassword({ email }: { email: string; password: string }) {
    await wait(200);
    state.signedIn = true;
    state.email = email;
    save();
    demoAuth.notify();
    return { data: { session: fakeSession() }, error: null };
  },
  async signUp({ email }: { email: string; password: string }) {
    return demoAuth.signInWithPassword({ email, password: '' });
  },
  async signOut() {
    state.signedIn = false;
    save();
    demoAuth.notify();
    return { error: null };
  },
};
