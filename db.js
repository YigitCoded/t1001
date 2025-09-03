// db.js
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const db = new Database('data.db');

// --- Tablo Kurulumları ---
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// --- Migration: notes tablosunda user_id yoksa ekle (eski kurulumlar için) ---
try {
  const cols = db.prepare(`PRAGMA table_info(notes);`).all();
  const hasUserId = cols.some(c => c.name === 'user_id');
  if (!hasUserId) {
    db.exec(`ALTER TABLE notes ADD COLUMN user_id INTEGER;`);
    // Mevcut notları sahipsiz bırakmamak için 1 no'lu kullanıcıya bağla (gerekirse oluştur)
    let tmp = db.prepare(`SELECT id FROM users WHERE id = 1`).get();
    if (!tmp) {
      const hash = bcrypt.hashSync('temp123', 10);
      db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')`)
        .run('temp@local', hash);
    }
    db.exec(`UPDATE notes SET user_id = 1 WHERE user_id IS NULL;`);
  }
} catch (e) {
  // sessiz geç
}

// --- Admin seed: .env'deki admin yoksa oluştur ---
function ensureAdmin(adminEmail, adminPassword) {
  const found = db.prepare(`SELECT id FROM users WHERE email = ?`).get(adminEmail);
  if (!found) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')`)
      .run(adminEmail, hash);
  }
}

// --- User CRUD ---
function createUser(email, password) {
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    `INSERT INTO users (email, password_hash) VALUES (?, ?)`
  ).run(email, hash);
  return info.lastInsertRowid;
}

function getUserByEmail(email) {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
}

function getUserById(id) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

function setUserRole(userId, role) {
  return db.prepare(`UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(role, userId).changes;
}

function listUsers() {
  return db.prepare(`
    SELECT id, email, role, created_at, updated_at
    FROM users ORDER BY id DESC
  `).all();
}

function deleteUser(id) {
  return db.prepare(`DELETE FROM users WHERE id = ?`).run(id).changes;
}

function resetUserPassword(id, newPassword) {
  const hash = bcrypt.hashSync(newPassword, 10);
  return db.prepare(`
    UPDATE users
    SET password_hash = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(hash, id).changes;
}

// --- Notes (user-owned) ---
function getAllNotesForUser(userId) {
  return db.prepare(`
    SELECT id, user_id, title, content, created_at, updated_at
    FROM notes
    WHERE user_id = ?
    ORDER BY id DESC
  `).all(userId);
}

function getAllNotesAdmin() {
  return db.prepare(`
    SELECT n.id, n.user_id, u.email AS owner_email, n.title, n.content, n.created_at, n.updated_at
    FROM notes n
    JOIN users u ON u.id = n.user_id
    ORDER BY n.id DESC
  `).all();
}

function getNoteById(id) {
  return db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id);
}

function createNote(userId, title, content) {
  const info = db.prepare(
    `INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)`
  ).run(userId, title, content || null);
  return info.lastInsertRowid;
}

function updateNote(id, title, content) {
  return db.prepare(`
    UPDATE notes
    SET title = ?, content = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(title, content || null, id).changes;
}

function deleteNote(id) {
  return db.prepare(`DELETE FROM notes WHERE id = ?`).run(id).changes;
}

// --- Stats ---
function countNotes() {
  return db.prepare(`SELECT COUNT(*) AS c FROM notes`).get().c;
}

function countUsers() {
  return db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
}

function getLatestNotes(limit = 10) {
  return db.prepare(`
    SELECT n.id, n.title, u.email AS owner_email, n.created_at
    FROM notes n
    JOIN users u ON u.id = n.user_id
    ORDER BY n.id DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  // seed
  ensureAdmin,
  // users
  createUser, getUserByEmail, getUserById, setUserRole, listUsers,
  deleteUser, resetUserPassword,
  // notes
  getAllNotesForUser, getAllNotesAdmin,
  getNoteById, createNote, updateNote, deleteNote,
  // stats
  countNotes, countUsers, getLatestNotes
};
