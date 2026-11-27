export type AppMode = 'friendship' | 'networking' | 'dating';
export type Gender = 'female' | 'male' | 'diverse';
export type SwipeDirection = 'like' | 'pass';
export type ConsentType = 'terms' | 'privacy' | 'location' | 'data_sharing' | 'ads_personalization';

export interface Profile {
  id: string;
  display_name: string;
  birthdate: string;
  gender: Gender;
  bio: string | null;
  occupation: string | null;
  modes: AppMode[];
  dating_genders: Gender[];
  age_min: number;
  age_max: number;
  photos: string[];
  locale: 'de' | 'en';
  is_banned: boolean;
}

export interface VehicleModel {
  id: number;
  make: string;
  model: string;
  variant: string;
  body_type: string | null;
  year_from: number | null;
  year_to: number | null;
  battery_kwh_net: number | null;
  dc_max_kw: number | null;
  ac_max_kw: number | null;
  wltp_range_km: number | null;
}

export interface UserVehicle {
  id: string;
  user_id: string;
  model_id: number;
  nickname: string | null;
  description: string | null;
  model_year: number | null;
  is_primary: boolean;
  vehicle_models?: VehicleModel;
}

export const RATING_CRITERIA = [
  'range_real',
  'charging_speed',
  'consumption',
  'software',
  'comfort',
  'build_quality',
  'value_for_money',
] as const;
export type RatingCriterion = (typeof RATING_CRITERIA)[number];

export type VehicleRating = Record<RatingCriterion, number> & {
  id?: string;
  user_id: string;
  model_id: number;
  comment: string | null;
};

export type ModelScore = {
  model_id: number;
  make: string;
  model: string;
  variant: string;
  body_type: string | null;
  battery_kwh_net: number | null;
  dc_max_kw: number | null;
  wltp_range_km: number | null;
  rating_count: number;
  overall: number | null;
} & Record<RatingCriterion, number | null>;

export interface ModelReview extends Record<RatingCriterion, number> {
  id: string;
  author: string;
  overall: number;
  comment: string | null;
  updated_at: string;
}

export interface NearbyStation {
  id: number;
  name: string;
  operator: string | null;
  street: string | null;
  city: string | null;
  max_power_kw: number;
  num_points: number | null;
  is_highway: boolean;
  lat: number;
  lng: number;
  distance_m: number;
  active_users: number;
}

export interface ActiveSession {
  session_id: string;
  station_id: number;
  station_name: string;
  station_city: string | null;
  vehicle_id: string | null;
  started_at: string;
  expires_at: string;
  people_here: number;
  people_nearby: number;
}

export type DistanceBucket = 'same_station' | 'lt10' | 'lt25' | 'lt50' | 'lt100' | 'lt250' | 'far';

export interface Candidate {
  user_id: string;
  display_name: string;
  age: number;
  gender: Gender;
  bio: string | null;
  occupation: string | null;
  photos: string[];
  modes: AppMode[];
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_nickname: string | null;
  same_station: boolean;
  station_name: string | null;
  distance_bucket: DistanceBucket;
}

export interface MatchListItem {
  match_id: string;
  mode: AppMode;
  created_at: string;
  partner_id: string;
  partner_name: string;
  partner_age: number;
  partner_photo: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_mine: boolean | null;
  unread: number;
}

export interface MatchPartner {
  user_id: string;
  display_name: string;
  age: number;
  gender: Gender;
  bio: string | null;
  occupation: string | null;
  photos: string[];
  modes: AppMode[];
  mode: AppMode;
  vehicles: {
    make: string;
    model: string;
    variant: string;
    nickname: string | null;
    description: string | null;
    model_year: number | null;
  }[];
}

export interface Message {
  id: number;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface NotificationSettings {
  matches: boolean;
  messages: boolean;
  message_preview: boolean;
  station_activity: boolean;
}

export type ReportReason = 'fake' | 'inappropriate_photo' | 'harassment' | 'spam' | 'underage' | 'safety' | 'other';
