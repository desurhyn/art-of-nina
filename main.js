import * as C from './config.js';
import { createAdapter } from './DatabaseAdapter.js';
import { AuthService } from './AuthService.js';
import { GalleryService } from './GalleryService.js';
import { RenderEngine } from './RenderEngine.js';

const db = await createAdapter(C.FIREBASE_CONFIG, C.CLOUDINARY);
const auth = new AuthService(db);
const gallery = new GalleryService(C.PAGE_SIZE);
const DEF = C.DEFAULT_CATEGORY;
// The default category is always present, so reassigned artworks always land somewhere valid.
const cleanCats = l => { const out = [...new Set((l || []).map(s => String(s).trim()).filter(Boolean))]; if (!out.includes(DEF)) out.unshift(DEF); return out; };
let liked = new Set(), openId = null, unsubC = null, commentsCache = [], categories = cleanCats(C.CATEGORIES);
try { liked = new Set(JSON.parse(localStorage.getItem('nina_liked') || '[]')); } catch {}
const saveLiked = () => { try { localStorage.setItem('nina_liked', JSON.stringify([...liked])); } catch {} };

const fail = e => ui.toast(e?.code === 'permission-denied' || e?.code === 'storage/unauthorized' ? 'Not allowed. Only the signed-in admin can make changes.' : (e?.message || 'Something went wrong. Try again.'));
const refresh = () => ui.renderGallery(gallery.visible, gallery.hasMore, gallery.filtered.length, gallery.likes, liked);
// Frontend admin check for every write. This is a convenience only: the real enforcement is firestore.rules / storage.rules (request.auth != null).
const admin = fn => (...a) => auth.isAdmin ? fn(...a) : fail({ code: 'permission-denied' });
const catCounts = () => gallery.all.reduce((m, a) => (m[a.category] = (m[a.category] || 0) + 1, m), {});
const syncCats = () => ui.renderCategoryAdmin(categories, catCounts(), DEF);

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
  remove: admin(id => { if (confirm('Delete this artwork permanently?')) db.deleteArtwork(id).then(() => ui.toast('Deleted.')).catch(fail); }),
  delComment: admin(id => { if (confirm('Delete this comment permanently?')) db.deleteComment(id).then(() => ui.toast('Comment deleted.')).catch(fail); }),
  feature: admin(id => {
    const a = gallery.byId(id); if (!a) return;
    // Featuring stamps featuredAt and un-features every other artwork (one hero at a time). Un-featuring just clears the flag.
    db.updateArtwork(id, { featured: !a.featured }).then(() => ui.toast(a.featured ? 'Removed from Featured Work.' : 'Now the Featured Work.')).catch(fail);
  }),
  save: admin(async d => {
    const art = { title: d.title.trim(), imageUrl: d.imageUrl.trim(), category: d.category, description: d.description.trim(),
      tags: d.tags.split(',').map(t => t.trim()).filter(Boolean), featured: d.featured };
    try {
      if (d.file?.size) { ui.setSaving(true, 0); art.imageUrl = await db.uploadImage(d.file, p => ui.setSaving(true, p)); }
      if (!art.imageUrl) return ui.toast('Choose an image file or paste an image link.');
      ui.setSaving(true);
      await (d.id ? db.updateArtwork(d.id, art) : db.addArtwork(art));
      ui.fillForm(null); ui.toast('Saved.');
    } catch (e) { fail(e); } finally { ui.setSaving(false); }
  }),
  addCategory: admin((name, form) => {
    name = name.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) return ui.toast('Type a category name first.');
    if (name.toLowerCase() === 'all') return ui.toast('"All" is reserved for the show-everything filter.');
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) return ui.toast('That category already exists.');
    db.saveSettings('categories', { list: [...categories, name] }).then(() => { form.reset(); ui.toast('Category added.'); }).catch(fail);
  }),
  delCat: admin(name => {
    if (name === DEF) return ui.toast(`"${DEF}" is the default category and cannot be deleted.`);
    if (!categories.includes(name)) return;
    const n = catCounts()[name] || 0;
    if (!confirm(n ? `Delete "${name}"? Its ${n} artwork${n === 1 ? '' : 's'} will move to "${DEF}".` : `Delete the empty category "${name}"?`)) return;
    db.deleteCategory(name, DEF, categories.filter(c => c !== name))
      .then(moved => ui.toast(moved ? `Category deleted. ${moved} artwork${moved === 1 ? '' : 's'} moved to ${DEF}.` : 'Category deleted.')).catch(fail);
  }),
  saveInfo: admin(d => {
    const about = d.about.trim(), how = d.how.trim();
    if (about.length > 3000 || how.length > 1500) return ui.toast('That text is too long. Please shorten it.');
    db.saveSettings('site_info', { about, how }).then(() => ui.toast('Site content saved.')).catch(fail);
  }),
  copy: () => ui.copySummary()
});

auth.onChange(u => { ui.renderAuth(u); ui.setAdminEmail(u?.email); if (openId) ui.renderComments(commentsCache, auth.isAdmin); });
db.subscribeArtworks(list => { gallery.setArtworks(list); ui.renderHero(gallery.hero); ui.renderAdminList(list); syncCats(); refresh(); });
db.subscribeLikes(l => { gallery.setLikes(l); ui.updateLikes(l, liked); if (gallery.sort === 'liked') refresh(); });
db.subscribeSettings('categories', s => {
  categories = cleanCats(s?.list?.length ? s.list : C.CATEGORIES);
  ui.setCategories(categories); syncCats();
  if (gallery.cat !== 'All' && !categories.includes(gallery.cat)) { gallery.setCategory('All'); ui.markChip('All'); } // the filter in use was just deleted
  refresh();
});
db.subscribeSettings('site_info', s => { ui.renderInfo(s); ui.fillInfoForm(s); });
