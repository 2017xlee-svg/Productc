import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore using the specific provisioned database ID or default
const customDbId = (firebaseConfig as any).firestoreDatabaseId;
export const db = customDbId ? getFirestore(app, customDbId) : getFirestore(app);
export const projectId = firebaseConfig.projectId;
export const databaseId = customDbId || '(default)';

// Initialize Firebase Cloud Storage with provisioned bucket
export const storageBucket = firebaseConfig.storageBucket || '';
export const storage = getStorage(app, storageBucket ? `gs://${storageBucket}` : undefined);

// Test connection on boot per Firebase guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

export { app };
export default app;
