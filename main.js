import * as C from './config.js';
import { createAdapter } from './DatabaseAdapter.js';
import { AuthService } from './AuthService.js';
import { GalleryService } from './GalleryService.js';
import { RenderEngine } from './RenderEngine.js';

const db = await createAdapter(C.FIREBASE_CONFIG, C.CLOUDINARY);
const auth = new AuthService(db);
const gallery = new GalleryService(C.PAGE_SIZE);
let liked = new Set(), openId = null, unsubC = null, commentsCache = [];
try { liked = new Set(JSON.parse(localStorage.getItem('nina_liked') || '[]')); } catch {}
const saveLiked = () => { try { localStorage.setItem('nina_liked', JSON.stringify([...liked])); } catch {} };

const fail = e => ui.toast(e?.code === 'permission-denied' || e?.code === 'storage/unauthorized' ? 'Not allowed. Only Nina can change artwork.' : (e?.message || 'Something went wrong. Try again.'));
const refresh = () => ui.renderGallery(gallery.visible, gallery.hasMore, gallery.filtered.length, gallery.likes, liked);

const ui = new RenderEngine(C, {
  search: q => { gallery.setQuery(q); refresh(); },
  sort: s => { gallery.setSort(s); refresh(); },
  cat: c => { gallery.setCategory(c); ui.markChip(c); refresh(); },
  more: () => { gallery.loadMore(); refresh(); },
  like: id => {
    const on = !liked.has(id); on ? liked.add(id) : liked.delete(id); saveLiked();
    ui.updateLikes(gallery.likes, liked);
    db.setLike(id, on ? 1 : -1).catch(e => { on ? liked.delete(id) : liked.add(id); saveLiked(); ui.updateLikes(gallery.likes, liked); fail(e); });
  },
  open: id => {
    const a = gallery.byId(id); if (!a) return;
    openId = id; unsubC?.();
    ui.openLightbox(a, gallery.likes, liked);
    unsubC = db.subscribeComments(id, l => { commentsCache = l; ui.renderComments(l, auth.isAdmin); });
  },
  closed: () => { unsubC?.(); unsubC = null; openId = null; },
  comment: ({ name, text }, form) => {
    if (!openId) return;
    db.addComment({ artwork_id: openId, author_name: name.trim().slice(0, 40), comment_text: text.trim().slice(0, 500) }).then(() => form.reset()).catch(fail);
  },
  admin: () => ui.openAdmin(),
  login: ({ email, password }) => auth.login(email, password).catch(e => ui.toast('Sign-in failed. Check your email and password.')),
  logout: () => auth.logout(),
  edit: id => ui.fillForm(gallery.byId(id)),
  clear: () => ui.fillForm(null),
  remove: id => { if (confirm('Delete this artwork permanently?')) db.deleteArtwork(id).then(() => ui.toast('Deleted.')).catch(fail); },
  delComment: id => { if (confirm('Delete this comment permanently?')) db.deleteComment(id).then(() => ui.toast('Comment deleted.')).catch(fail); },
  save: async d => {
    const art = { title: d.title.trim(), imageUrl: d.imageUrl.trim(), category: d.category, description: d.description.trim(),
      tags: d.tags.split(',').map(t => t.trim()).filter(Boolean), featured: d.featured };
    try {
      if (d.file?.size) { ui.setSaving(true, 0); art.imageUrl = await db.uploadImage(d.file, p => ui.setSaving(true, p)); }
      if (!art.imageUrl) return ui.toast('Choose an image file or paste an image link.');
      ui.setSaving(true);
      await (d.id ? db.updateArtwork(d.id, art) : db.addArtwork(art));
      ui.fillForm(null); ui.toast('Saved.');
    } catch (e) { fail(e); } finally { ui.setSaving(false); }
  },
  copy: () => ui.copySummary()
});

auth.onChange(u => { ui.renderAuth(u); ui.setAdminEmail(u?.email); if (openId) ui.renderComments(commentsCache, auth.isAdmin); });
db.subscribeArtworks(list => { gallery.setArtworks(list); ui.renderHero(gallery.hero); ui.renderAdminList(list); refresh(); });
db.subscribeLikes(l => { gallery.setLikes(l); ui.updateLikes(l, liked); if (gallery.sort === 'liked') refresh(); });
