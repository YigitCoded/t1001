// server.js
const path = require('path');
const express = require('express');
const session = require('express-session');
const dayjs = require('dayjs');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');

dotenv.config();

const {
  ensureAdmin,
  createUser, getUserByEmail, getUserById, setUserRole, listUsers, deleteUser, resetUserPassword,
  getAllNotesForUser, getAllNotesAdmin,
  getNoteById, createNote, updateNote, deleteNote,
  countNotes, countUsers, getLatestNotes
} = require('./db');

const app = express();

// Admin seed
ensureAdmin(process.env.ADMIN_EMAIL || 'admin@example.com',
            process.env.ADMIN_PASSWORD || 'admin123');

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static & body
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false
}));

// --- Helpers (middleware) ---
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  const user = getUserById(req.session.userId);
  if (!user || user.role !== 'admin') return res.status(403).send('Yetki yok');
  next();
}
function injectUser(req, res, next) {
  res.locals.currentUser = req.session.userId ? getUserById(req.session.userId) : null;
  res.locals.appName = 't1001';
  next();
}
app.use(injectUser);

// --- Public: Landing → login/register’a yönlendir ---
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/notes');
  res.redirect('/login');
});

// --- Auth ---
app.get('/register', (req, res) => {
  res.render('auth/register');
});
app.post('/register', (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password?.trim()) return res.status(400).send('Email ve şifre gerekli');
  try {
    const id = createUser(email.trim().toLowerCase(), password.trim());
    req.session.userId = id;
    return res.redirect('/notes');
  } catch (e) {
    return res.status(400).send('Kayıt başarısız. Email kullanımda olabilir.');
  }
});

app.get('/login', (req, res) => {
  res.render('auth/login');
});
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = getUserByEmail((email || '').trim().toLowerCase());
  if (!user) return res.status(401).send('Hatalı email/şifre');

  if (!bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).send('Hatalı email/şifre');
  }
  req.session.userId = user.id;
  res.redirect('/notes');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// --- Notes (User-owned) ---
app.get('/notes', requireAuth, (req, res) => {
  const rows = getAllNotesForUser(req.session.userId).map(n => ({
    ...n,
    created_human: dayjs(n.created_at).format('YYYY-MM-DD HH:mm'),
    updated_human: n.updated_at ? dayjs(n.updated_at).format('YYYY-MM-DD HH:mm') : null
  }));
  res.render('notes/index', { notes: rows });
});

app.post('/notes', requireAuth, (req, res) => {
  const { title, content } = req.body;
  if (!title?.trim()) return res.status(400).send('Başlık gerekli');
  createNote(req.session.userId, title.trim(), (content || '').trim());
  res.redirect('/notes');
});

app.get('/notes/:id/edit', requireAuth, (req, res) => {
  const note = getNoteById(req.params.id);
  if (!note || note.user_id !== req.session.userId) return res.status(404).send('Not bulunamadı');
  res.render('notes/edit', { note });
});

app.post('/notes/:id', requireAuth, (req, res) => {
  const note = getNoteById(req.params.id);
  if (!note || note.user_id !== req.session.userId) return res.status(404).send('Not bulunamadı');
  const { title, content } = req.body;
  if (!title?.trim()) return res.status(400).send('Başlık gerekli');
  updateNote(note.id, title.trim(), (content || '').trim());
  res.redirect('/notes');
});

app.post('/notes/:id/delete', requireAuth, (req, res) => {
  const note = getNoteById(req.params.id);
  if (!note || note.user_id !== req.session.userId) return res.status(404).send('Not bulunamadı');
  deleteNote(note.id);
  res.redirect('/notes');
});

// --- Admin Panel ---
app.get('/admin', requireAdmin, (req, res) => {
  const stats = {
    users: countUsers(),
    notes: countNotes(),
    latest: getLatestNotes(10)
  };
  res.render('admin/index', { stats });
});

// Kullanıcı yönetimi
app.get('/admin/users', requireAdmin, (req, res) => {
  const users = listUsers();
  res.render('admin/users', { users });
});
app.post('/admin/users/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body; // 'user' | 'admin'
  setUserRole(req.params.id, role);
  res.redirect('/admin/users');
});
app.post('/admin/users/:id/delete', requireAdmin, (req, res) => {
  deleteUser(req.params.id);
  res.redirect('/admin/users');
});
app.post('/admin/users/:id/reset', requireAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).send('Geçerli bir şifre girin (min 4 karakter)');
  }
  resetUserPassword(req.params.id, newPassword);
  res.redirect('/admin/users');
});

// Tüm notlar (admin)
app.get('/admin/notes', requireAdmin, (req, res) => {
  const rows = getAllNotesAdmin().map(n => ({
    ...n,
    created_human: dayjs(n.created_at).format('YYYY-MM-DD HH:mm'),
    updated_human: n.updated_at ? dayjs(n.updated_at).format('YYYY-MM-DD HH:mm') : null
  }));
  res.render('admin/notes', { notes: rows });
});
app.post('/admin/notes/:id/delete', requireAdmin, (req, res) => {
  deleteNote(req.params.id);
  res.redirect('/admin/notes');
});

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`t1001 auth+admin hazır: http://localhost:${PORT}`));
