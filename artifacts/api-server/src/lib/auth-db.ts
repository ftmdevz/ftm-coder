import BetterSqlite3 from "better-sqlite3";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

// Derived from DATA_DIR (the single mounted disk) — can also be set directly.
// In dev (no DATA_DIR / USERS_ROOT set) fall back to a writable local dir.
const defaultDataRoot = process.env.DATA_DIR
  ? `${process.env.DATA_DIR}/users`
  : path.resolve(process.cwd(), "../../.local/ftm-data/users");

export const USERS_ROOT = process.env.USERS_ROOT || defaultDataRoot;
const DB_DIR = path.join(USERS_ROOT, ".db");
const DB_PATH = path.join(DB_DIR, "auth.db");

// Ensure DB directory exists
if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

const db = new BetterSqlite3(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT    UNIQUE NOT NULL,
    username    TEXT    UNIQUE NOT NULL,
    password_hash TEXT  NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

export interface User {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  created_at: number;
}

export function createUser(email: string, username: string, passwordHash: string): User {
  return db
    .prepare("INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?) RETURNING *")
    .get(email, username, passwordHash) as User;
}

export function findUserByEmail(email: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as User | undefined;
}

export function findUserById(id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

/** Return (and create if needed) the per-user workspace directory */
export function getUserDir(username: string): string {
  return path.join(USERS_ROOT, username);
}

/** Initialise the user's home dir: create it, write sandbox .bashrc and a welcome README */
export function initUserDir(username: string): string {
  const dir = getUserDir(username);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Sandbox .bashrc ──────────────────────────────────────────────────────────
  // Overrides `cd` so the user can never navigate above their own directory.
  const bashrc = `# FTM-Coder — sandboxed workspace for ${username}
export HOME="${dir}"
export HOME_JAIL="${dir}"
export HISTFILE="${dir}/.bash_history"

# Colourful prompt:  ftm-coder@<username>:~$
PS1='\\[\\033[1;36m\\]ftm-coder\\[\\033[0m\\]@\\[\\033[1;33m\\]${username}\\[\\033[0m\\]:\\[\\033[1;34m\\]\\W\\[\\033[0m\\]\\$ '

# Jail: block navigation above home dir
function cd() {
  if [[ $# -eq 0 ]]; then
    builtin cd "$HOME_JAIL"
    return
  fi
  local raw="$1"
  # Resolve absolute target without following symlinks out of jail
  local target
  target="$(realpath -m "\${PWD}/\${raw}" 2>/dev/null || echo "\${raw}")"
  if [[ "$target" == "$HOME_JAIL" || "$target" == "$HOME_JAIL/"* ]]; then
    builtin cd "$target"
  else
    echo -e "\\033[31mPermission denied:\\033[0m cannot leave your workspace"
    return 1
  fi
}
export -f cd
`;

  writeFileSync(path.join(dir, ".bashrc"), bashrc);

  // Welcome README (only written once)
  const readme = path.join(dir, "README.md");
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      `# Welcome to FTM-CODER, ${username}!\n\nThis is your personal workspace. Happy coding! 🚀\n`,
    );
  }

  return dir;
}
