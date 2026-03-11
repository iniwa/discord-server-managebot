import Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_snapshots (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id  TEXT NOT NULL,
      taken_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      note      TEXT
    );

    CREATE TABLE IF NOT EXISTS role_snapshot_entries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES role_snapshots(id) ON DELETE CASCADE,
      role_id     TEXT NOT NULL,
      role_name   TEXT NOT NULL,
      color       INTEGER NOT NULL DEFAULT 0,
      hoist       INTEGER NOT NULL DEFAULT 0,
      mentionable INTEGER NOT NULL DEFAULT 0,
      position    INTEGER NOT NULL DEFAULT 0,
      permissions TEXT NOT NULL DEFAULT '0'
    );

    CREATE TABLE IF NOT EXISTS role_snapshot_members (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id  INTEGER NOT NULL REFERENCES role_snapshots(id) ON DELETE CASCADE,
      role_id      TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      username     TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS reaction_roles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      message_id  TEXT NOT NULL,
      emoji       TEXT NOT NULL,
      role_id     TEXT NOT NULL,
      label       TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(message_id, emoji)
    );

    CREATE TABLE IF NOT EXISTS voice_roles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      role_id     TEXT NOT NULL,
      label       TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(channel_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS leave_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id      TEXT NOT NULL,
      user_id       TEXT NOT NULL,
      username      TEXT NOT NULL,
      display_name  TEXT,
      joined_at     TEXT,
      left_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      roles_at_leave TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS bot_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT NOT NULL,
      action     TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      username   TEXT NOT NULL,
      role_id    TEXT NOT NULL,
      role_name  TEXT NOT NULL,
      message_id TEXT,
      emoji      TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS nickname_configs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id         TEXT NOT NULL,
      user_id          TEXT NOT NULL,
      voice_channel_id TEXT NOT NULL,
      channel_id       TEXT NOT NULL,
      message_id       TEXT NOT NULL,
      emoji            TEXT NOT NULL,
      nickname         TEXT NOT NULL,
      label            TEXT,
      created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(message_id, emoji, user_id)
    );
  `);
}
