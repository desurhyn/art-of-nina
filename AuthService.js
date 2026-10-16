// UI-level session state only. Real authorization is enforced by firestore.rules, so editing this in DevTools grants nothing.
export class AuthService {
  constructor(db) {
    this.db = db; this.user = null; this.fns = [];
    db.onAuthChange(u => { this.user = u; this.fns.forEach(f => f(u)); });
  }
  get isAdmin() { return !!this.user; }
  onChange(f) { this.fns.push(f); f(this.user); }
  login(email, password) { return this.db.signIn(email, password); }
  logout() { return this.db.signOut(); }
}
