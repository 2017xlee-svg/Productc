import fs from 'fs';
import path from 'path';
import { INITIAL_DATABASE, INITIAL_PRODUCTS, INITIAL_SPECIFICATIONS, INITIAL_REVIEWS, INITIAL_USERS } from '../src/data/seedData';

const masterBackup = {
  schemaVersion: "2.0",
  appName: "DeviceRecordCompare",
  exportedAt: new Date().toISOString(),
  tables: {
    productsCount: INITIAL_PRODUCTS.length,
    specificationsCount: INITIAL_SPECIFICATIONS.length,
    reviewsCount: INITIAL_REVIEWS.length,
    usersCount: INITIAL_USERS.length
  },
  // Universal root arrays for Android Room SQLite
  products: INITIAL_PRODUCTS,
  specifications: INITIAL_SPECIFICATIONS,
  reviews: INITIAL_REVIEWS,
  users: INITIAL_USERS,
  // Nested database object for web format
  database: INITIAL_DATABASE
};

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const outputPath = path.join(publicDir, 'device_compare_master_backup.json');
fs.writeFileSync(outputPath, JSON.stringify(masterBackup, null, 2), 'utf8');
console.log(`Generated master backup successfully: ${outputPath}`);
console.log(`Products: ${masterBackup.products.length}`);
console.log(`Specifications: ${masterBackup.specifications.length}`);
console.log(`Reviews: ${masterBackup.reviews.length}`);
console.log(`Users: ${masterBackup.users.length}`);
