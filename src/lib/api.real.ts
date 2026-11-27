/**
 * Typisierte Wrapper um die Supabase-RPCs und Tabellen.
 * Die Geschäftslogik liegt serverseitig (supabase/migrations/*_functions.sql).
 */
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { unwrap } from './errors';
import type {
  ActiveSession,
  AppMode,
  Candidate,
  ConsentType,
  MatchListItem,
  MatchPartner,
  Message,
  ModelReview,
  ModelScore,
  NearbyStation,
  NotificationSettings,
  Profile,
  ReportReason,
  SwipeDirection,
  UserVehicle,
  VehicleModel,
  VehicleRating,
} from './types';

export const CONSENT_VERSION: string = '2026-11-v1';

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('NOT_AUTHENTICATED');
  return id;
}

// ---------------------------------------------------------------- Profil
export async function getMyProfile(): Promise<Profile | null> {
  const id = await uid();
  return unwrap(await supabase.from('profiles').select('*').eq('id', id).maybeSingle()) as Profile | null;
}

export type ProfileInput = Omit<Profile, 'id' | 'is_banned' | 'locale'> & { locale?: Profile['locale'] };

export async function upsertMyProfile(input: Partial<ProfileInput>, isNew: boolean): Promise<Profile> {
  const id = await uid();
  const q = isNew
    ? supabase.from('profiles').insert({ id, ...input })
    : supabase.from('profiles').update(input).eq('id', id);
  return unwrap(await q.select('*').single()) as Profile;
}

// ---------------------------------------------------------------- Einwilligungen
export async function giveConsents(consents: Partial<Record<ConsentType, boolean>>) {
  const user_id = await uid();
  const rows = Object.entries(consents).map(([type, granted]) => ({
    user_id,
    type,
    granted: Boolean(granted),
    version: CONSENT_VERSION,
  }));
  if (rows.length) unwrap(await supabase.from('consents').insert(rows));
}

export async function getMyConsents(): Promise<Record<ConsentType, boolean>> {
  const rows = unwrap(
    await supabase.from('consents').select('type, granted, created_at').order('created_at', { ascending: false }),
  ) as { type: ConsentType; granted: boolean }[];
  const out = { terms: false, privacy: false, location: false, data_sharing: false, ads_personalization: false };
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.type)) continue; // neueste zuerst
    seen.add(r.type);
    out[r.type] = r.granted;
  }
  return out;
}

// ---------------------------------------------------------------- Fotos
export async function uploadPhoto(localUri: string, mimeType = 'image/jpeg'): Promise<string> {
  const id = await uid();
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${id}/${Crypto.randomUUID()}.${ext}`;
  const body = await (await fetch(localUri)).arrayBuffer();
  unwrap(await supabase.storage.from('photos').upload(path, body, { contentType: mimeType, upsert: false }));
  return path;
}

export async function deletePhotos(paths: string[]) {
  const own = paths.filter((p) => !/^(https?:|data:|blob:)/.test(p));
  if (own.length) await supabase.storage.from('photos').remove(own);
}

// ---------------------------------------------------------------- Laden
export async function nearbyStations(lat: number, lng: number, radiusKm = 25): Promise<NearbyStation[]> {
  return unwrap(await supabase.rpc('nearby_stations', { p_lat: lat, p_lng: lng, p_radius_km: radiusKm })) ?? [];
}

export async function checkIn(lat: number, lng: number, vehicleId?: string | null, stationId?: number | null) {
  return unwrap(
    await supabase.rpc('check_in', {
      p_lat: lat,
      p_lng: lng,
      p_vehicle_id: vehicleId ?? null,
      p_station_id: stationId ?? null,
    }),
  ) as { session_id: string; station_name: string; expires_at: string };
}

export async function checkOut() {
  unwrap(await supabase.rpc('check_out'));
}

export async function extendSession() {
  return unwrap(await supabase.rpc('extend_session')) as { expires_at: string };
}

export async function heartbeat(lat: number, lng: number) {
  return unwrap(await supabase.rpc('session_heartbeat', { p_lat: lat, p_lng: lng })) as {
    active: boolean;
    reason?: 'moved_away';
  };
}

export async function myActiveSession(): Promise<ActiveSession | null> {
  return (unwrap(await supabase.rpc('my_active_session')) as ActiveSession | null) ?? null;
}

// ---------------------------------------------------------------- Entdecken
/** radiusKm: 50, 250 oder 0 = bundesweit */
export async function discoveryCandidates(mode: AppMode, radiusKm = 50): Promise<Candidate[]> {
  return unwrap(await supabase.rpc('discovery_candidates', { p_mode: mode, p_limit: 30, p_radius_km: radiusKm })) ?? [];
}

export async function swipe(target: string, direction: SwipeDirection, mode: AppMode) {
  return unwrap(await supabase.rpc('swipe', { p_target: target, p_direction: direction, p_mode: mode })) as {
    matched: boolean;
    match_id?: string;
  };
}

// ---------------------------------------------------------------- Kontakte & Chat
export async function myMatches(): Promise<MatchListItem[]> {
  return unwrap(await supabase.rpc('my_matches')) ?? [];
}

export async function matchPartner(matchId: string): Promise<MatchPartner | null> {
  return unwrap(await supabase.rpc('match_partner', { p_match: matchId })) as MatchPartner | null;
}

export async function loadMessages(matchId: string, before?: string): Promise<Message[]> {
  let q = supabase.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending: false }).limit(50);
  if (before) q = q.lt('created_at', before);
  return ((unwrap(await q) as Message[]) ?? []).reverse();
}

export async function sendMessage(matchId: string, body: string): Promise<Message> {
  const sender_id = await uid();
  return unwrap(
    await supabase.from('messages').insert({ match_id: matchId, sender_id, body: body.trim() }).select('*').single(),
  ) as Message;
}

export async function markRead(matchId: string) {
  await supabase.rpc('mark_read', { p_match: matchId });
}

export async function unmatch(matchId: string) {
  unwrap(await supabase.rpc('unmatch', { p_match: matchId }));
}

export async function blockUser(userId: string) {
  unwrap(await supabase.rpc('block_user', { p_target: userId }));
}

export async function reportUser(userId: string, reason: ReportReason, details?: string, messageId?: number) {
  unwrap(
    await supabase.rpc('report_user', {
      p_target: userId,
      p_reason: reason,
      p_details: details || null,
      p_message_id: messageId ?? null,
    }),
  );
}

/** Live-Updates für einen Chat. Gibt eine Abmelde-Funktion zurück. */
export function subscribeMessages(matchId: string, onMessage: (m: Message) => void): () => void {
  const ch = supabase
    .channel(`chat-${matchId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` }, (payload) =>
      onMessage(payload.new as Message),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}

/** Live-Updates für die Kontaktliste (neue Nachrichten/Matches). */
export function subscribeMatchList(onChange: () => void): () => void {
  const ch = supabase
    .channel('matches-list')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}

// ---------------------------------------------------------------- Fahrzeuge
export async function searchModels(query: string): Promise<VehicleModel[]> {
  let q = supabase.from('vehicle_models').select('*').eq('is_active', true).order('make').order('model').order('variant');
  const s = query.trim();
  if (s) {
    const parts = s.split(/\s+/).slice(0, 3);
    for (const p of parts) {
      const safe = p.replace(/[%,()]/g, '');
      q = q.or(`make.ilike.%${safe}%,model.ilike.%${safe}%,variant.ilike.%${safe}%`);
    }
  }
  return (unwrap(await q.limit(200)) as VehicleModel[]) ?? [];
}

export async function getModel(id: number): Promise<VehicleModel | null> {
  return unwrap(await supabase.from('vehicle_models').select('*').eq('id', id).maybeSingle()) as VehicleModel | null;
}

export async function myVehicles(): Promise<UserVehicle[]> {
  const id = await uid();
  return (
    (unwrap(
      await supabase
        .from('user_vehicles')
        .select('*, vehicle_models(*)')
        .eq('user_id', id)
        .order('is_primary', { ascending: false })
        .order('created_at'),
    ) as UserVehicle[]) ?? []
  );
}

export async function addVehicle(v: { model_id: number; nickname?: string; description?: string; model_year?: number | null }) {
  const user_id = await uid();
  const existing = await myVehicles();
  return unwrap(
    await supabase
      .from('user_vehicles')
      .insert({ ...v, user_id, is_primary: existing.length === 0 })
      .select('*')
      .single(),
  ) as UserVehicle;
}

export async function updateVehicle(id: string, patch: Partial<Pick<UserVehicle, 'nickname' | 'description' | 'model_year'>>) {
  unwrap(await supabase.from('user_vehicles').update(patch).eq('id', id));
}

export async function setPrimaryVehicle(id: string) {
  const user_id = await uid();
  // Erst alle zurücksetzen (Unique-Index erlaubt nur ein Hauptfahrzeug)
  unwrap(await supabase.from('user_vehicles').update({ is_primary: false }).eq('user_id', user_id).eq('is_primary', true));
  unwrap(await supabase.from('user_vehicles').update({ is_primary: true }).eq('id', id));
}

export async function deleteVehicle(id: string) {
  unwrap(await supabase.from('user_vehicles').delete().eq('id', id));
}

export async function modelScores(query = ''): Promise<ModelScore[]> {
  let q = supabase
    .from('vehicle_model_scores')
    .select('*')
    .order('overall', { ascending: false, nullsFirst: false })
    .order('rating_count', { ascending: false })
    .order('make');
  const s = query.trim().replace(/[%,()]/g, '');
  if (s) q = q.or(`make.ilike.%${s}%,model.ilike.%${s}%`);
  return (unwrap(await q.limit(200)) as ModelScore[]) ?? [];
}

export async function modelScore(modelId: number): Promise<ModelScore | null> {
  return unwrap(await supabase.from('vehicle_model_scores').select('*').eq('model_id', modelId).maybeSingle()) as ModelScore | null;
}

export async function modelReviews(modelId: number): Promise<ModelReview[]> {
  return unwrap(await supabase.rpc('model_reviews', { p_model: modelId, p_limit: 30, p_offset: 0 })) ?? [];
}

export async function myRating(modelId: number): Promise<VehicleRating | null> {
  const id = await uid();
  return unwrap(
    await supabase.from('vehicle_ratings').select('*').eq('user_id', id).eq('model_id', modelId).maybeSingle(),
  ) as VehicleRating | null;
}

export async function saveRating(r: Omit<VehicleRating, 'user_id' | 'id'>) {
  const user_id = await uid();
  unwrap(await supabase.from('vehicle_ratings').upsert({ ...r, user_id }, { onConflict: 'user_id,model_id' }));
}

// ---------------------------------------------------------------- Push
export async function registerPushToken(token: string, platform: 'ios' | 'android') {
  unwrap(await supabase.rpc('register_push_token', { p_token: token, p_platform: platform }));
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return unwrap(await supabase.rpc('my_notification_settings')) as NotificationSettings;
}

export async function saveNotificationSettings(patch: Partial<NotificationSettings>) {
  const user_id = await uid();
  unwrap(await supabase.from('notification_settings').upsert({ user_id, ...patch, updated_at: new Date().toISOString() }));
}

// ---------------------------------------------------------------- DSGVO
export async function exportMyData(): Promise<unknown> {
  return unwrap(await supabase.rpc('export_my_data'));
}

export async function deleteMyAccount(photoPaths: string[]) {
  await deletePhotos(photoPaths);
  unwrap(await supabase.rpc('delete_my_account'));
  await supabase.auth.signOut();
}
