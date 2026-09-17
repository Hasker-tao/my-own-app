import { randomUUID } from "node:crypto";
import type { DatabaseManager } from "./database.js";
import {
  collectionDefinitions,
  type CollectionName,
  sourceCollectionByType,
} from "./collections.js";

export type Entity = Record<string, any>;

export class ValidationError extends Error {
  statusCode = 400;
}

export class NotFoundError extends Error {
  statusCode = 404;
}

export class AppStore {
  constructor(public readonly manager: DatabaseManager) {}

  list(name: CollectionName, includeDeleted = false): Entity[] {
    const definition = collectionDefinitions[name];
    const where = includeDeleted ? "" : " WHERE deleted_at IS NULL";
    return this.manager.db.prepare(`SELECT * FROM ${definition.table}${where} ORDER BY created_at DESC`).all() as Entity[];
  }

  get(name: CollectionName, id: string, includeDeleted = false): Entity {
    const definition = collectionDefinitions[name];
    const row = this.manager.db
      .prepare(`SELECT * FROM ${definition.table} WHERE id = ?${includeDeleted ? "" : " AND deleted_at IS NULL"}`)
      .get(id) as Entity | undefined;
    if (!row) throw new NotFoundError("没有找到这条记录");
    return row;
  }

  create(name: CollectionName, input: Entity): Entity {
    const definition = collectionDefinitions[name];
    const clean = this.sanitize(name, input);
    this.requireFields(definition.required, clean);
    const now = new Date().toISOString();
    const row: Entity = { id: randomUUID(), ...clean, created_at: now, updated_at: now };
    const columns = Object.keys(row);
    const placeholders = columns.map(() => "?").join(", ");
    this.manager.db
      .prepare(`INSERT INTO ${definition.table} (${columns.join(", ")}) VALUES (${placeholders})`)
      .run(...columns.map((column) => row[column] ?? null));
    return this.get(name, row.id);
  }

  update(name: CollectionName, id: string, input: Entity): Entity {
    const definition = collectionDefinitions[name];
    this.get(name, id, true);
    const clean = this.sanitize(name, input);
    if (Object.keys(clean).length === 0) throw new ValidationError("没有可更新的内容");
    clean.updated_at = new Date().toISOString();
    const columns = Object.keys(clean);
    this.manager.db
      .prepare(`UPDATE ${definition.table} SET ${columns.map((column) => `${column} = ?`).join(", ")} WHERE id = ?`)
      .run(...columns.map((column) => clean[column] ?? null), id);
    return this.get(name, id, true);
  }

  softDelete(name: CollectionName, id: string): Entity {
    const definition = collectionDefinitions[name];
    const row = this.get(name, id);
    const now = new Date().toISOString();
    this.manager.db.transaction(() => {
      this.manager.db.prepare(`UPDATE ${definition.table} SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);
      this.manager.db
        .prepare(`INSERT INTO trash_entries(id, collection, entity_id, display_title, deleted_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(collection, entity_id) DO UPDATE SET display_title = excluded.display_title, deleted_at = excluded.deleted_at`)
        .run(randomUUID(), name, id, String(row[definition.title] ?? "未命名记录"), now);
    })();
    return this.get(name, id, true);
  }

  restore(name: CollectionName, id: string): Entity {
    const definition = collectionDefinitions[name];
    const now = new Date().toISOString();
    this.manager.db.transaction(() => {
      this.manager.db.prepare(`UPDATE ${definition.table} SET deleted_at = NULL, updated_at = ? WHERE id = ?`).run(now, id);
      this.manager.db.prepare("DELETE FROM trash_entries WHERE collection = ? AND entity_id = ?").run(name, id);
    })();
    return this.get(name, id);
  }

  permanentDelete(name: CollectionName, id: string): void {
    const definition = collectionDefinitions[name];
    this.manager.db.transaction(() => {
      this.manager.db.prepare(`DELETE FROM ${definition.table} WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
      this.manager.db.prepare("DELETE FROM trash_entries WHERE collection = ? AND entity_id = ?").run(name, id);
    })();
  }

  trash(): Entity[] {
    return this.manager.db.prepare("SELECT * FROM trash_entries ORDER BY deleted_at DESC").all() as Entity[];
  }

  getSettings(): Record<string, any> {
    const rows = this.manager.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    return Object.fromEntries(rows.map((row) => {
      try {
        return [row.key, JSON.parse(row.value)];
      } catch {
        return [row.key, row.value];
      }
    }));
  }

  setSettings(input: Record<string, any>): Record<string, any> {
    const statement = this.manager.db.prepare(`INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
    const now = new Date().toISOString();
    this.manager.db.transaction(() => {
      for (const [key, value] of Object.entries(input)) {
        statement.run(key, JSON.stringify(value), now);
      }
    })();
    return this.getSettings();
  }

  getDailyReview(date: string): Entity | null {
    return (this.manager.db.prepare("SELECT * FROM daily_reviews WHERE review_date = ?").get(date) as Entity | undefined) ?? null;
  }

  setDailyReview(date: string, content: string): Entity {
    const now = new Date().toISOString();
    this.manager.db.prepare(`INSERT INTO daily_reviews(review_date, content, created_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(review_date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`)
      .run(date, content, now, now);
    return this.getDailyReview(date)!;
  }

  state(): Record<string, any> {
    const collections = Object.fromEntries(
      (Object.keys(collectionDefinitions) as CollectionName[]).map((name) => [name, this.list(name)]),
    );
    collections.planItems = (collections.planItems as Entity[]).map((item) => ({
      ...item,
      display_title: this.sourceTitle(item.source_entity_type, item.source_entity_id) || item.title,
    }));
    return {
      ...collections,
      settings: this.getSettings(),
      trash: this.trash(),
    };
  }

  search(query: string): Entity[] {
    const normalized = query.trim();
    if (!normalized) return [];
    const results: Entity[] = [];
    for (const [name, definition] of Object.entries(collectionDefinitions) as Array<[CollectionName, (typeof collectionDefinitions)[CollectionName]]>) {
      if (name === "planItems" || definition.search.length === 0) continue;
      const where = definition.search.map((field) => `${field} LIKE ?`).join(" OR ");
      const rows = this.manager.db
        .prepare(`SELECT id, ${definition.title} AS title, updated_at FROM ${definition.table} WHERE deleted_at IS NULL AND (${where}) ORDER BY updated_at DESC LIMIT 20`)
        .all(...definition.search.map(() => `%${normalized}%`)) as Entity[];
      results.push(...rows.map((row) => ({ ...row, collection: name, module: definition.module })));
    }
    return results;
  }

  sourceTitle(type: string | null, id: string | null): string | null {
    if (!type || !id) return null;
    const collection = sourceCollectionByType[type];
    if (!collection) return null;
    try {
      const row = this.get(collection, id);
      return String(row[collectionDefinitions[collection].title] ?? "");
    } catch {
      return null;
    }
  }

  private sanitize(name: CollectionName, input: Entity): Entity {
    const allowed = new Set<string>(collectionDefinitions[name].fields);
    return Object.fromEntries(
      Object.entries(input)
        .filter(([key]) => allowed.has(key))
        .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]),
    );
  }

  private requireFields(required: readonly string[], input: Entity): void {
    const missing = required.filter((field) => input[field] === undefined || input[field] === null || input[field] === "");
    if (missing.length) throw new ValidationError(`请填写必填内容：${missing.join("、")}`);
  }
}
