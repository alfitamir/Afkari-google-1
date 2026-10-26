/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  type User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account',
});

// Flag to track sign-in in-flight
let isSigningIn = false;

// Cache the access token in memory only (NEVER in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let currentUser: User | null = null;

// Callbacks for auth state changes
type AuthListener = (user: User | null, token: string | null) => void;
const listeners = new Set<AuthListener>();

export const onGoogleAuthStateChange = (listener: AuthListener) => {
  listeners.add(listener);
  // Send current state immediately
  listener(currentUser, cachedAccessToken);
  return () => {
    listeners.delete(listener);
  };
};

const notifyListeners = () => {
  listeners.forEach((fn) => fn(currentUser, cachedAccessToken));
  window.dispatchEvent(new CustomEvent('afkari:auth-changed', { 
    detail: { user: currentUser, hasToken: !!cachedAccessToken } 
  }));
};

// Initialize auth state listener
onAuthStateChanged(auth, async (user: User | null) => {
  currentUser = user;
  if (!user) {
    cachedAccessToken = null;
  }
  notifyListeners();
});

export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('تعذّر الحصول على تصريح الوصول من Google');
    }

    cachedAccessToken = credential.accessToken;
    currentUser = result.user;
    notifyListeners();
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getGoogleUser = (): User | null => {
  return currentUser;
};

export const signOutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  currentUser = null;
  notifyListeners();
};
