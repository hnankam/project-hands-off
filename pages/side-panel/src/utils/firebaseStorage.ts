import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getStorage, ref, uploadString, getDownloadURL, type FirebaseStorage } from 'firebase/storage';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

let app: FirebaseApp | null = null;
let storage: FirebaseStorage | null = null;
let auth: Auth | null = null;
let authPromise: Promise<void> | null = null;

/**
 * Ensure Firebase is initialized and user is authenticated anonymously.
 * This is required for Firebase Storage uploads when Storage rules require authentication.
 */
export async function ensureFirebaseAuth(config: FirebaseConfig): Promise<void> {
  if (!app) {
    if (getApps().length === 0) {
      app = initializeApp(config);
    } else {
      app = getApps()[0]!;
    }
  }
  
  if (!auth) {
    auth = getAuth(app!);
  }
  
  // Check if already signed in
  if (auth.currentUser) {
    return;
  }
  
  // If auth is in progress, wait for it
  if (authPromise) {
    return authPromise;
  }
  
  // Sign in anonymously
  authPromise = signInAnonymously(auth)
    .then(() => {
      console.log('[Firebase] Successfully signed in anonymously');
    })
    .catch((error) => {
      console.error('[Firebase] Failed to sign in anonymously:', error);
      authPromise = null; // Reset so we can retry
      throw error;
    });
  
  return authPromise;
}

export function ensureFirebase(config: FirebaseConfig): FirebaseStorage {
  if (!app) {
    if (getApps().length === 0) {
      app = initializeApp(config);
    } else {
      app = getApps()[0]!;
    }
  }
  if (!storage) {
    storage = getStorage(app!);
  }
  
  // Initialize auth (sign-in will happen before uploads)
  if (!auth) {
    auth = getAuth(app!);
  }
  
  return storage!;
}

export async function uploadDataUrlToStorage(
  storageInstance: FirebaseStorage,
  path: string,
  dataUrl: string,
  contentType?: string,
  firebaseConfig?: FirebaseConfig,
): Promise<string> {
  // Ensure anonymous authentication before uploading
  // This is required when Storage rules require authentication
  if (firebaseConfig) {
    try {
      await ensureFirebaseAuth(firebaseConfig);
    } catch (error) {
      console.warn('[Firebase] Failed to authenticate, upload may fail if Storage rules require auth:', error);
      // Continue anyway - might work if rules allow unauthenticated uploads
    }
  }
  
  const objectRef = ref(storageInstance, path);
  await uploadString(objectRef, dataUrl, 'data_url', contentType ? { contentType } : undefined);
  const url = await getDownloadURL(objectRef);
  return url;
}


