// Contract the UI depends on (DIP). Swap implementations without touching rendering code.
export class DatabaseAdapter {
  subscribeArtworks(cb) { throw new Error('Not implemented'); }
  subscribeLikes(cb) { throw new Error('Not implemented'); }
  subscribeComments(artworkId, cb) { throw new Error('Not implemented'); }
  addArtwork(a) { throw new Error('Not implemented'); }
  updateArtwork(id, a) { throw new Error('Not implemented'); }
  deleteArtwork(id) { throw new Error('Not implemented'); }
  setLike(id, delta) { throw new Error('Not implemented'); }
  addComment(c) { throw new Error('Not implemented'); }
  onAuthChange(cb) { throw new Error('Not implemented'); }
  signIn(email, password) { throw new Error('Not implemented'); }
  signOut() { throw new Error('Not implemented'); }
  deleteComment(id) { throw new Error('Not implemented'); }
  uploadImage(file, onProgress) { throw new Error('Not implemented'); }
}

const V = 'https://www.gstatic.com/firebasejs/10.12.2/';

// Phones and .jfif files often report an empty or odd MIME type. Fix the label only; the bytes stay identical.
function normalizeImage(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', jpe: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
  const type = file.type && file.type.startsWith('image/') ? file.type : (map[ext] || 'image/jpeg');
  return new File([file], file.name.replace(/\.jfif$/i, '.jpg').replace(/[^\w.-]/g, '_'), { type });
}

// Cloudinary unsigned upload with real progress (XHR). The returned secure_url is the untouched original.
function uploadToCloudinary(file, cfg, onProgress) {
  return new Promise((res, rej) => {
    const xhr = new XMLHttpRequest(), fd = new FormData();
    fd.append('file', file); fd.append('upload_preset', cfg.uploadPreset);
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) { console.log(`[upload] ${e.loaded}/${e.total}`); onProgress?.(e.loaded / e.total); } };
    xhr.onload = () => {
      let j = {}; try { j = JSON.parse(xhr.responseText); } catch {}
      xhr.status < 300 && j.secure_url ? res(j.secure_url) : rej(new Error(j.error?.message || `Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => rej(new Error('Network error. Check your connection and the Cloudinary cloud name.'));
    xhr.send(fd);
  });
}

class FirebaseAdapter extends DatabaseAdapter {
  async init(cfg) {
    const [app, fs, au] = await Promise.all([import(V + 'firebase-app.js'), import(V + 'firebase-firestore.js'), import(V + 'firebase-auth.js')]);
    this.fs = fs; this.au = au;
    const a = this.app = app.initializeApp(cfg);
    this.db = fs.getFirestore(a);
    this.auth = au.getAuth(a);
    await au.setPersistence(this.auth, au.browserSessionPersistence); // admin session ends with the tab
    return this;
  }
  _watch(q, map, cb) {
    return this.fs.onSnapshot(q, s => cb(map(s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })))), e => console.error(e));
  }
  _ms(t) { return t?.toMillis ? t.toMillis() : Date.now(); }
  subscribeArtworks(cb) {
    const { collection, query, orderBy } = this.fs;
    return this._watch(query(collection(this.db, 'artworks'), orderBy('createdAt', 'desc')), l => l.map(a => ({ ...a, createdAt: this._ms(a.createdAt) })), cb);
  }
  subscribeLikes(cb) {
    return this._watch(this.fs.collection(this.db, 'likes'), l => Object.fromEntries(l.map(x => [x.id, x.count || 0])), cb);
  }
  subscribeComments(id, cb) {
    const { collection, query, where } = this.fs; // sorted client-side: no composite index required
    return this._watch(query(collection(this.db, 'comments'), where('artwork_id', '==', id)),
      l => l.map(c => ({ ...c, timestamp: this._ms(c.timestamp) })).sort((a, b) => b.timestamp - a.timestamp), cb);
  }
  addArtwork(a) { const f = this.fs; return f.addDoc(f.collection(this.db, 'artworks'), { ...a, createdAt: f.serverTimestamp() }); }
  updateArtwork(id, a) { const f = this.fs; return f.updateDoc(f.doc(this.db, 'artworks', id), a); }
  deleteArtwork(id) { const f = this.fs; return f.deleteDoc(f.doc(this.db, 'artworks', id)); }
  setLike(id, delta) { const f = this.fs; return f.setDoc(f.doc(this.db, 'likes', id), { count: f.increment(delta) }, { merge: true }); }
  addComment(c) { const f = this.fs; return f.addDoc(f.collection(this.db, 'comments'), { ...c, timestamp: f.serverTimestamp() }); }
  deleteComment(id) { const f = this.fs; return f.deleteDoc(f.doc(this.db, 'comments', id)); }
  // Uploads the ORIGINAL bytes (no resizing or compression). Uses Cloudinary when configured, else Firebase Storage.
  async uploadImage(file, onProgress) {
    const f = normalizeImage(file);
    console.log('[upload] start', f.name, f.type, f.size, 'bytes via', this.cloud ? 'Cloudinary' : 'Firebase Storage');
    try {
      const url = this.cloud ? await uploadToCloudinary(f, this.cloud, onProgress) : await this._uploadToFirebase(f, onProgress);
      console.log('[upload] done', url);
      return url;
    } catch (e) { console.error('[upload] failed:', e.code || '', e.message || e); throw e; }
  }
  async _uploadToFirebase(file, onProgress) {
    const s = this.stg ??= await import(V + 'firebase-storage.js');
    const r = s.ref(this.storage ??= s.getStorage(this.app), `artworks/${Date.now()}-${file.name}`);
    return new Promise((res, rej) => {
      const task = s.uploadBytesResumable(r, file, { contentType: file.type });
      // If Storage isn't enabled (needs the Blaze plan) no event ever arrives: fail loudly instead of hanging at 0%.
      const dog = setTimeout(() => { task.cancel(); rej(new Error('Upload never started. Firebase Storage is not enabled on the free plan. Set up Cloudinary in config.js instead.')); }, 20000);
      task.on('state_changed',
        x => { clearTimeout(dog); console.log(`[upload] ${x.state} ${x.bytesTransferred}/${x.totalBytes}`); onProgress?.(x.totalBytes ? x.bytesTransferred / x.totalBytes : 0); },
        e => { clearTimeout(dog); rej(e); },
        async () => { try { res(await s.getDownloadURL(task.snapshot.ref)); } catch (e) { rej(e); } });
    });
  }
  onAuthChange(cb) { return this.au.onAuthStateChanged(this.auth, u => cb(u && { uid: u.uid, email: u.email })); }
  signIn(e, p) { return this.au.signInWithEmailAndPassword(this.auth, e, p); }
  signOut() { return this.au.signOut(this.auth); }
}

// Used automatically until Firebase is configured, so the site previews out of the box. Nothing persists.
class MemoryAdapter extends DatabaseAdapter {
  constructor() {
    super();
    this.subs = new Set(); this.likes = {}; this.comments = []; this.n = 0;
    const cats = ['Anime Illustrations', 'Manhwa / Webtoon Art'];
    this.art = Array.from({ length: 8 }, (_, i) => ({
      id: 'demo' + i, title: 'Demo artwork ' + (i + 1), category: cats[i % 2], tags: ['demo', 'sample'],
      description: 'Placeholder piece shown until Firebase is configured.', featured: i === 0, createdAt: Date.now() - i * 1e6,
      imageUrl: `https://picsum.photos/seed/nina${i}/1200/1500`
    }));
  }
  _sub(get, cb) { const f = () => cb(get()); this.subs.add(f); f(); return () => this.subs.delete(f); }
  _emit() { this.subs.forEach(f => f()); }
  subscribeArtworks(cb) { return this._sub(() => [...this.art], cb); }
  subscribeLikes(cb) { return this._sub(() => ({ ...this.likes }), cb); }
  subscribeComments(id, cb) { return this._sub(() => this.comments.filter(c => c.artwork_id === id).sort((a, b) => b.timestamp - a.timestamp), cb); }
  async addArtwork(a) { this.art.unshift({ ...a, id: 'm' + ++this.n, createdAt: Date.now() }); this._emit(); }
  async updateArtwork(id, a) { this.art = this.art.map(x => x.id === id ? { ...x, ...a } : x); this._emit(); }
  async deleteArtwork(id) { this.art = this.art.filter(x => x.id !== id); this._emit(); }
  async setLike(id, d) { this.likes[id] = Math.max(0, (this.likes[id] || 0) + d); this._emit(); }
  async addComment(c) { this.comments.push({ ...c, id: 'c' + ++this.n, timestamp: Date.now() }); this._emit(); }
  async deleteComment(id) { this.comments = this.comments.filter(c => c.id !== id); this._emit(); }
  async uploadImage(file) { return URL.createObjectURL(file); } // demo only: not saved
  onAuthChange(cb) { cb(null); return () => {}; }
  async signIn() { throw new Error('Demo mode: add your Firebase config in js/config.js to enable admin login.'); }
  async signOut() {}
}

export async function createAdapter(cfg, cloud) {
  if (!cfg.apiKey || cfg.apiKey.startsWith('YOUR_')) return new MemoryAdapter();
  try {
    const a = await new FirebaseAdapter().init(cfg);
    a.cloud = cloud?.cloudName && !cloud.cloudName.startsWith('YOUR_') ? cloud : null;
    return a;
  }
  catch (e) { console.error(e); return new MemoryAdapter(); }
}
