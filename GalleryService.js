// Pure state logic: search, category filter, sort, pagination. No DOM access.
export class GalleryService {
  constructor(pageSize) { this.size = pageSize; this.all = []; this.likes = {}; this.q = ''; this.cat = 'All'; this.sort = 'new'; this.page = 1; }
  setArtworks(a) { this.all = a; }
  setLikes(l) { this.likes = l; }
  setQuery(q) { this.q = q.trim().toLowerCase(); this.page = 1; }
  setCategory(c) { this.cat = c; this.page = 1; }
  setSort(s) { this.sort = s; this.page = 1; }
  loadMore() { this.page++; }
  byId(id) { return this.all.find(a => a.id === id); }
  get filtered() {
    const r = this.all.filter(a => (this.cat === 'All' || a.category === this.cat) &&
      (!this.q || [a.title, a.description, a.category, ...(a.tags || [])].join(' ').toLowerCase().includes(this.q)));
    return this.sort === 'liked' ? [...r].sort((a, b) => (this.likes[b.id] || 0) - (this.likes[a.id] || 0)) : r;
  }
  get visible() { return this.filtered.slice(0, this.page * this.size); }
  get hasMore() { return this.filtered.length > this.visible.length; }
  // Newest-featured wins: the most recently featured artwork is the hero, even if older ones still carry the flag.
  get hero() {
    const f = this.all.filter(a => a.featured).sort((a, b) => (b.featuredAt || b.createdAt) - (a.featuredAt || a.createdAt));
    return f[0] || this.all[0];
  }
}
