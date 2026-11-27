/**
 * Einstiegspunkt für alle Backend-Aufrufe der App.
 * Produktion: Supabase (api.real.ts). Demo-Modus: lokale Simulation (demo/api.demo.ts).
 */
import { DEMO } from './config';
import * as real from './api.real';
import { demoApi } from './demo/api.demo';

export type { ProfileInput } from './api.real';
export const CONSENT_VERSION = real.CONSENT_VERSION;

const impl: typeof real = DEMO ? demoApi : real;

export const getMyProfile = impl.getMyProfile;
export const upsertMyProfile = impl.upsertMyProfile;
export const giveConsents = impl.giveConsents;
export const getMyConsents = impl.getMyConsents;
export const uploadPhoto = impl.uploadPhoto;
export const deletePhotos = impl.deletePhotos;
export const nearbyStations = impl.nearbyStations;
export const checkIn = impl.checkIn;
export const checkOut = impl.checkOut;
export const extendSession = impl.extendSession;
export const heartbeat = impl.heartbeat;
export const myActiveSession = impl.myActiveSession;
export const discoveryCandidates = impl.discoveryCandidates;
export const swipe = impl.swipe;
export const myMatches = impl.myMatches;
export const matchPartner = impl.matchPartner;
export const loadMessages = impl.loadMessages;
export const sendMessage = impl.sendMessage;
export const markRead = impl.markRead;
export const unmatch = impl.unmatch;
export const blockUser = impl.blockUser;
export const reportUser = impl.reportUser;
export const subscribeMessages = impl.subscribeMessages;
export const subscribeMatchList = impl.subscribeMatchList;
export const searchModels = impl.searchModels;
export const getModel = impl.getModel;
export const myVehicles = impl.myVehicles;
export const addVehicle = impl.addVehicle;
export const updateVehicle = impl.updateVehicle;
export const setPrimaryVehicle = impl.setPrimaryVehicle;
export const deleteVehicle = impl.deleteVehicle;
export const modelScores = impl.modelScores;
export const modelScore = impl.modelScore;
export const modelReviews = impl.modelReviews;
export const myRating = impl.myRating;
export const saveRating = impl.saveRating;
export const exportMyData = impl.exportMyData;
export const deleteMyAccount = impl.deleteMyAccount;
export const registerPushToken = impl.registerPushToken;
export const getNotificationSettings = impl.getNotificationSettings;
export const saveNotificationSettings = impl.saveNotificationSettings;
