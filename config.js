// Edit this file to change categories, prices and payment badges (Open/Closed: no core code changes needed).
export const FIREBASE_CONFIG = { apiKey: 'AIzaSyC9tI_hjV4iwBF9a_rzLWb7y5sSaiTkU30', authDomain: 'art-of-nina.firebaseapp.com', projectId: 'art-of-nina', appId: '1:792474759145:web:ef14dd2df710ab13646578', storageBucket: 'art-of-nina.firebasestorage.app' };
export const CATEGORIES = ['Anime Illustrations', 'Manhwa / Webtoon Art'];
export const COMMISSIONS = [
  { id: 'bust', name: 'Bust / Chibi', price: 800 },
  { id: 'half', name: 'Half-Body', price: 1500 },
  { id: 'full', name: 'Full Manhwa Page / Illustration', price: 3000 }
];
export const ADDONS = [
  { id: 'bg', name: 'Detailed background', price: 500 },
  { id: 'char', name: 'Extra character', price: 600 },
  { id: 'rush', name: 'Rush delivery', price: 700 }
];
export const PAYMENTS = ['GCash', 'Maya', 'BDO', 'BPI', 'UnionBank', 'PayPal'];
export const ARTIST_EMAIL = 'nina@example.com';
export const PAGE_SIZE = 12;
export const CLOUDINARY = { cloudName: 'c8xg3hsh', uploadPreset: 'artworks' };
