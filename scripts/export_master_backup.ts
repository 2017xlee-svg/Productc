import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

async function generateMasterBackup() {
  console.log('Reading config and seed data...');
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  let products = [];
  let specifications = [];
  let reviews = [];
  let users = [];

  try {
    console.log('Fetching products from Firestore...');
    const prodSnap = await getDocs(collection(db, 'products'));
    prodSnap.forEach((doc) => products.push({ id: doc.id, ...doc.data() }));
    console.log(`Fetched ${products.length} products from Firestore.`);
  } catch (err) {
    console.warn('Could not fetch products from Firestore:', err.message);
  }

  try {
    console.log('Fetching specifications from Firestore...');
    const specSnap = await getDocs(collection(db, 'specifications'));
    specSnap.forEach((doc) => specifications.push({ id: doc.id, ...doc.data() }));
    console.log(`Fetched ${specifications.length} specifications from Firestore.`);
  } catch (err) {
    console.warn('Could not fetch specifications from Firestore:', err.message);
  }

  try {
    console.log('Fetching reviews from Firestore...');
    const revSnap = await getDocs(collection(db, 'reviews'));
    revSnap.forEach((doc) => reviews.push({ id: doc.id, ...doc.data() }));
    console.log(`Fetched ${reviews.length} reviews from Firestore.`);
  } catch (err) {
    console.warn('Could not fetch reviews from Firestore:', err.message);
  }

  try {
    console.log('Fetching users from Firestore...');
    const userSnap = await getDocs(collection(db, 'users'));
    userSnap.forEach((doc) => users.push({ id: doc.id, ...doc.data() }));
    console.log(`Fetched ${users.length} users from Firestore.`);
  } catch (err) {
    console.warn('Could not fetch users from Firestore:', err.message);
  }

  // If firestore was empty or had partial data, merge with seedData to ensure full completeness
  if (products.length === 0 || specifications.length === 0 || reviews.length === 0) {
    console.log('Merging with baseline seedData...');
    const seedModule = await import('../src/data/seedData.ts');
    const seedDb = seedModule.INITIAL_DATABASE;
    if (products.length === 0) products = seedDb.products || [];
    if (specifications.length === 0) specifications = seedDb.specifications || [];
    if (reviews.length === 0) reviews = seedDb.reviews || [];
    if (users.length === 0) users = seedDb.users || [];
  }

  const masterBackup = {
    schemaVersion: "2.0",
    appName: "DeviceRecordCompare",
    exportedAt: new Date().toISOString(),
    tables: {
      productsCount: products.length,
      specificationsCount: specifications.length,
      reviewsCount: reviews.length,
      usersCount: users.length
    },
    // Standard universal root arrays for Android Room SQLite
    products,
    specifications,
    reviews,
    users,
    // Nested database object for web compatibility
    database: {
      products,
      specifications,
      reviews,
      users
    }
  };

  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const outputPath = path.join(publicDir, 'device_compare_master_backup.json');
  fs.writeFileSync(outputPath, JSON.stringify(masterBackup, null, 2), 'utf8');
  console.log(`Successfully generated master backup at: ${outputPath}`);
  console.log(`Total Products: ${products.length}`);
  console.log(`Total Specifications: ${specifications.length}`);
  console.log(`Total Reviews: ${reviews.length}`);
  console.log(`Total Users: ${users.length}`);
}

generateMasterBackup().catch(console.error);
