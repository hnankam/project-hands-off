/**
 * ================================================================================
 * Firebase Storage Utilities
 * ================================================================================
 * 
 * Manages Firebase initialization, authentication, and storage operations.
 * Implements singleton pattern for Firebase app and auth instances.
 * 
 * @module firebaseStorage
 * ================================================================================
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getStorage, ref, uploadString, getDownloadURL, type FirebaseStorage } from 'firebase/storage';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Firebase configuration object
 */
export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

// ============================================================================
// MODULE STATE
// ============================================================================

let app: FirebaseApp | null = null;
let storage: FirebaseStorage | null = null;
let auth: Auth | null = null;
let authPromise: Promise<void> | null = null;

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Initialize Firebase app if not already initialized.
 * Uses existing app if already initialized.
 * 
 * @param config - Firebase configuration
 * @returns Initialized Firebase app
 * @throws Error if initialization fails
 */
function initializeFirebaseApp(config: FirebaseConfig): FirebaseApp {
  if (app) {
    return app;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    app = existingApps[0];
    if (!app) {
      throw new Error('[Firebase] Failed to get existing Firebase app');
    }
    return app;
  }

  try {
    app = initializeApp(config);
    return app;
  } catch (error) {
    throw new Error(`[Firebase] Failed to initialize app: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Initialize Firebase Auth if not already initialized.
 * 
 * @param firebaseApp - Initialized Firebase app
 * @returns Firebase Auth instance
 */
function initializeFirebaseAuth(firebaseApp: FirebaseApp): Auth {
  if (auth) {
    return auth;
  }

  auth = getAuth(firebaseApp);
  return auth;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Ensure Firebase is initialized and user is authenticated anonymously.
 * This is required for Firebase Storage uploads when Storage rules require authentication.
 * 
 * @param config - Firebase configuration
 * @returns Promise that resolves when authentication is complete
 * @throws Error if authentication fails
 * 
 * @example
 * ```typescript
 * await ensureFirebaseAuth(firebaseConfig);
 * // Now safe to upload to Firebase Storage
 * ```
 */
export async function ensureFirebaseAuth(config: FirebaseConfig): Promise<void> {
  // Initialize app and auth
  const firebaseApp = initializeFirebaseApp(config);
  const firebaseAuth = initializeFirebaseAuth(firebaseApp);
  
  // Check if already signed in
  if (firebaseAuth.currentUser) {
    return;
  }
  
  // If auth is in progress, wait for it
  if (authPromise) {
    return authPromise;
  }
  
  // Sign in anonymously
  authPromise = signInAnonymously(firebaseAuth)
    .then(() => {
      console.log('[Firebase] Successfully signed in anonymously');
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Firebase] Failed to sign in anonymously:', errorMessage);
      throw new Error(`[Firebase] Anonymous authentication failed: ${errorMessage}`);
    })
    .finally(() => {
      // Always reset the promise when done (success or failure)
      // This allows retries and prevents stale promise references
      authPromise = null;
    });
  
  return authPromise;
}

/**
 * Ensure Firebase app and storage are initialized.
 * 
 * @param config - Firebase configuration
 * @returns Firebase Storage instance
 * @throws Error if initialization fails
 * 
 * @example
 * ```typescript
 * const storage = ensureFirebase(firebaseConfig);
 * // Use storage for operations
 * ```
 */
export function ensureFirebase(config: FirebaseConfig): FirebaseStorage {
  // Initialize app
  const firebaseApp = initializeFirebaseApp(config);
  
  // Initialize storage if not already initialized
  if (!storage) {
    storage = getStorage(firebaseApp);
  }
  
  // Initialize auth (sign-in will happen before uploads via ensureFirebaseAuth)
  initializeFirebaseAuth(firebaseApp);
  
  return storage;
}

/**
 * Upload a data URL to Firebase Storage.
 * Optionally authenticates anonymously before upload if firebaseConfig is provided.
 * 
 * @param storageInstance - Firebase Storage instance
 * @param path - Storage path where the file will be uploaded
 * @param dataUrl - Data URL to upload (e.g., "data:image/png;base64,...")
 * @param contentType - Optional content type (e.g., "image/png")
 * @param firebaseConfig - Optional Firebase config for authentication
 * @returns Promise that resolves to the download URL of the uploaded file
 * @throws Error if upload fails
 * 
 * @example
 * ```typescript
 * const url = await uploadDataUrlToStorage(
 *   storage,
 *   'images/screenshot.png',
 *   dataUrl,
 *   'image/png',
 *   firebaseConfig
 * );
 * console.log('Uploaded to:', url);
 * ```
 */
export async function uploadDataUrlToStorage(
  storageInstance: FirebaseStorage,
  path: string,
  dataUrl: string,
  contentType?: string,
  firebaseConfig?: FirebaseConfig,
): Promise<string> {
  // Ensure anonymous authentication before uploading if config is provided
  // This is required when Storage rules require authentication
  if (firebaseConfig) {
      await ensureFirebaseAuth(firebaseConfig);
  }
  
  try {
  const objectRef = ref(storageInstance, path);
    
    const metadata = contentType ? { contentType } : undefined;
    await uploadString(objectRef, dataUrl, 'data_url', metadata);
    
  const url = await getDownloadURL(objectRef);
  return url;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`[Firebase] Upload failed: ${errorMessage}`);
  }
}
