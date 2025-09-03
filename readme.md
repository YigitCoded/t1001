# t1001 — Notes App (Multi-User + Admin Panel)

A simple yet powerful note management application built with Node.js, Express, EJS, and SQLite.  
Each user has their own account and can only manage their own notes, while admins have a dedicated panel to manage all users and notes.

## Features
- User registration, login, and logout
- Add, edit, and delete personal notes
- Admin panel with:
  - User listing
  - Change user roles (user ↔ admin)
  - Delete users
  - Reset user passwords
  - View and delete all notes
- SQLite database (lightweight and fast)
- Session-based authentication
- Clean UI with EJS templates and CSS

## Tech Stack
- Node.js
- Express
- EJS
- SQLite (better-sqlite3)
- bcrypt
- express-session
- dotenv

## Project Structure
