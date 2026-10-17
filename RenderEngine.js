const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const php = n => '₱' + n.toLocaleString('en-PH');
const RATIOS = ['1/1'];

export class RenderEngine {
  constructor(cfg, h) {
    this.cfg = cfg; this.h = h; this.zoom = 1; this.adminEmail = null;
    let t = 'dark'; try { t = localStorage.getItem('nina_theme') || 'dark'; } catch {}
    this.setTheme(t);
    this.build(); this.bind();
  }
  setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('nina_theme', t); } catch {} }

  build() {
    const c = this.cfg;
    $('#chips').innerHTML = ['All', ...c.CATEGORIES].map((x, i) => `<button class="chip" data-act="cat" data-id="${esc(x)}" aria-pressed="${i === 0}">${esc(x)}</button>`).join('');
    $('#artCat').innerHTML = c.CATEGORIES.map(x => `<option>${esc(x)}</option>`).join('');
    $('#tiers').innerHTML = c.COMMISSIONS.map((t, i) => `<label class="tier"><input type="radio" name="tier" value="${t.id}" ${i ? '' : 'checked'}><span class="tname">${esc(t.name)}</span><span class="tprice">${php(t.price)}</span></label>`).join('');
    $('#addons').innerHTML = c.ADDONS.map(a => `<label class="addon"><input type="checkbox" name="addon" value="${a.id}"><span>${esc(a.name)}</span><span class="mute">+${php(a.price)}</span></label>`).join('');
    $('#pays').innerHTML = c.PAYMENTS.map(p => `<span class="badge">${esc(p)}</span>`).join('');
    this.calc();
  }

  bind() {
    const h = this.h;
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (el) {
        const { act, id } = el.dataset;
        if (act === 'theme') return this.setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
        if (act === 'zoom') return this.setZoom(id === '0' ? 1 : this.zoom + Number(id));
        if (act === 'close') return el.closest('dialog').close();
        h[act]?.(id, el);
      }
      if (e.target instanceof HTMLDialogElement) e.target.close();
    });
    $('#q').addEventListener('input', e => h.search(e.target.value));
    $('#sort').addEventListener('change', e => h.sort(e.target.value));
    $('#lightbox').addEventListener('close', () => h.closed());
    $('#calcForm').addEventListener('input', () => this.calc());
    const form = (id, fn) => $(id).addEventListener('submit', e => { e.preventDefault(); fn(Object.fromEntries(new FormData(e.target)), e.target); });
    form('#loginForm', d => h.login(d));
    form('#artForm', (d, f) => h.save({ ...d, featured: f.elements.featured.checked }));
  }

  toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(this.tt); this.tt = setTimeout(() => t.classList.remove('show'), 3500);
  }

  renderHero(a) {
    $('#hero').innerHTML = a ? `<button data-act="open" data-id="${a.id}" class="panel-art" aria-label="View ${esc(a.title)}"><img src="${esc(a.imageUrl)}" alt="${esc(a.title)}" fetchpriority="high"><span class="panel-art-overlay"><span class="panel-art-badge">Featured work</span><span class="panel-art-title">${esc(a.title)}</span></span></button>` : '';
  }

  markChip(cat) { document.querySelectorAll('#chips .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === cat)); }

  renderGallery(list, hasMore, total, likes, liked) {
    $('#count').textContent = `${total} artwork${total === 1 ? '' : 's'}`;
    $('#grid').innerHTML = list.length ? list.map((a, i) => `<article class="card">
      <button data-act="open" data-id="${a.id}" class="thumb" style="aspect-ratio:${RATIOS[i % RATIOS.length]}" aria-label="Open ${esc(a.title)}"><img src="${esc(a.imageUrl)}" alt="${esc(a.title)}" loading="lazy"></button>
      <div class="meta"><div class="min-w-0"><h3 class="truncate">${esc(a.title)}</h3><p class="mute truncate">${esc(a.category)}</p></div>${this.heart(a.id, likes[a.id], liked.has(a.id))}</div></article>`).join('')
      : '<p class="empty">Nothing matches yet. Clear the search or choose another category.</p>';
    $('#more').hidden = !hasMore;
  }

  heart(id, n = 0, on) { return `<button class="heart" data-act="like" data-id="${id}" aria-pressed="${!!on}" aria-label="Like"><span aria-hidden="true">♥</span><b data-like="${id}">${n || 0}</b></button>`; }

  updateLikes(likes, liked) {
    document.querySelectorAll('[data-like]').forEach(el => el.textContent = likes[el.dataset.like] || 0);
    document.querySelectorAll('[data-act=like]').forEach(b => b.setAttribute('aria-pressed', liked.has(b.dataset.id)));
  }

  openLightbox(a, likes, liked) {
    this.zoom = 1;
    $('#lbBody').innerHTML = `<div class="lb-stage"><img id="lbImg" src="${esc(a.imageUrl)}" alt="${esc(a.title)}"></div>
      <aside class="lb-side">
        <div class="flex items-start justify-between gap-3"><h2 class="text-2xl font-bold">${esc(a.title)}</h2><button class="btn" data-act="close" aria-label="Close">✕</button></div>
        <p class="mute">${esc(a.category)} · <span id="dims">loading size…</span></p>
        <p class="my-3">${esc(a.description)}</p>
        <p class="mb-3">${(a.tags || []).map(t => `<span class="badge">#${esc(t)}</span>`).join(' ')}</p>
        <div class="flex gap-2 items-center mb-4">${this.heart(a.id, likes[a.id], liked.has(a.id))}
          <button class="btn" data-act="zoom" data-id="-0.25" aria-label="Zoom out">−</button><button class="btn" data-act="zoom" data-id="0">Fit</button><button class="btn" data-act="zoom" data-id="0.25" aria-label="Zoom in">+</button></div>
        <h3 class="font-bold mb-2">Comments</h3>
        <form id="commentForm" class="grid gap-2 mb-3"><input name="name" maxlength="40" placeholder="Your name" required><textarea name="text" maxlength="500" rows="2" placeholder="Leave a comment" required></textarea><button class="btn primary">Post comment</button></form>
        <ul id="cList" class="grid gap-2"></ul></aside>`;
    $('#commentForm').addEventListener('submit', e => { e.preventDefault(); this.h.comment(Object.fromEntries(new FormData(e.target)), e.target); });
    const img = $('#lbImg'); const dims = () => $('#dims').textContent = `${img.naturalWidth} × ${img.naturalHeight}px`;
    img.complete && img.naturalWidth ? dims() : img.addEventListener('load', dims);
    const dlg = $('#lightbox'); if (!dlg.open) dlg.showModal();
  }
  setZoom(z) { this.zoom = Math.min(4, Math.max(0.5, z)); const i = $('#lbImg'); if (!i) return; i.style.width = this.zoom * 100 + '%'; i.style.maxHeight = this.zoom === 1 ? '' : 'none'; }

  renderComments(list, isAdmin = false) {
    const ul = $('#cList'); if (!ul) return;
    ul.innerHTML = list.length ? list.map(c => `<li class="cmt flex gap-2 items-start justify-between"><div class="min-w-0"><b>${esc(c.author_name)}</b> <span class="mute">${new Date(c.timestamp).toLocaleString()}</span><p>${esc(c.comment_text)}</p></div>${isAdmin ? `<button class="btn" style="color:var(--heart);border-color:var(--heart)" data-act="delComment" data-id="${c.id}" aria-label="Delete comment" title="Delete comment">🗑</button>` : ''}</li>`).join('') : '<li class="mute">No comments yet. Be the first to say something.</li>';
  }

  renderAuth(user) {
    $('#loginForm').hidden = !!user; $('#adminPane').hidden = !user;
    $('#who').textContent = user ? `Signed in as ${user.email}` : '';
  }
  openAdmin() { $('#adminDlg').showModal(); }
  closeAdmin() { $('#adminDlg').close(); }
  renderAdminList(list) {
    $('#adminList').innerHTML = list.map(a => `<li class="flex items-center gap-2 justify-between"><span class="truncate">${esc(a.title)}</span><span class="flex gap-2"><button class="btn" data-act="edit" data-id="${a.id}">Edit</button><button class="btn" data-act="remove" data-id="${a.id}">Delete</button></span></li>`).join('');
  }
  setSaving(on, pct) {
    const b = $('#saveBtn'); b.disabled = on;
    b.textContent = on ? (pct == null ? 'Saving…' : `Uploading ${Math.round(pct * 100)}%`) : 'Save artwork';
  }
  fillForm(a) {
    const e = $('#artForm').elements; // form.id / form.title would return the form's own attributes, so use elements
    e.id.value = a?.id || ''; e.title.value = a?.title || ''; e.imageUrl.value = a?.imageUrl || '';
    e.category.value = a?.category || this.cfg.CATEGORIES[0]; e.tags.value = (a?.tags || []).join(', ');
    e.description.value = a?.description || ''; e.featured.checked = !!a?.featured; e.file.value = '';
  }

  calc() {
    const f = $('#calcForm'), d = new FormData(f), c = this.cfg;
    const tier = c.COMMISSIONS.find(t => t.id === d.get('tier')) || c.COMMISSIONS[0];
    const adds = c.ADDONS.filter(a => d.getAll('addon').includes(a.id));
    const total = tier.price + adds.reduce((s, a) => s + a.price, 0);
    $('#total').textContent = php(total);
    this.summary = `Commission request for Art of Nina\nName: ${d.get('name') || '-'}\nEmail: ${d.get('email') || '-'}\nType: ${tier.name} (${php(tier.price)})\nAdd-ons: ${adds.map(a => `${a.name} (${php(a.price)})`).join(', ') || 'None'}\nEstimated total: ${php(total)}\nPayment: ${d.get('pay') || '-'}\nDetails: ${d.get('notes') || '-'}`;
    $('#mailBtn').href = `mailto:${this.adminEmail || c.ARTIST_EMAIL}?subject=${encodeURIComponent('Commission request: ' + tier.name)}&body=${encodeURIComponent(this.summary)}`;
  }
  // Signed-in admin email wins; visitors fall back to ARTIST_EMAIL. Rebuilds the mailto link immediately.
  setAdminEmail(email) { this.adminEmail = email || null; this.calc(); }
  async copySummary() {
    try { await navigator.clipboard.writeText(this.summary); this.toast('Summary copied.'); }
    catch { this.toast('Copy failed. Select the text manually or use Email brief.'); }
  }
}
