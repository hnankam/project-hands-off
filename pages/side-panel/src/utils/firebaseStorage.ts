import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getStorage, ref, uploadString, getDownloadURL, type FirebaseStorage } from 'firebase/storage';

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
  return storage!;
}

export async function uploadDataUrlToStorage(
  storageInstance: FirebaseStorage,
  path: string,
  dataUrl: string,
  contentType?: string,
): Promise<string> {
  const objectRef = ref(storageInstance, path);
  await uploadString(objectRef, dataUrl, 'data_url', contentType ? { contentType } : undefined);
  const url = await getDownloadURL(objectRef);
  return url;
}


