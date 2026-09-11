import { learningState } from "./learning.js";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import type { DatabaseManager } from "./database.js";
import type { AppStore } from "./store.js";
import type { AppPaths } from "./config.js";
import { collectionDefinitions, type CollectionName } from "./collections.js";

export type BackupRecord = {
  id: string;
  filename: string;
  createdAt: string;
  size: number;
  type: "manual" | "automatic" | "safety";
  label: string;
  keep: boolean;
};

type BackupIndex = { version: 1; backups: BackupRecord[] };

function safeTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export class BackupManager {
  private busy = false;
  private status: { state: "idle" | "ok" | "error"; lastAttemptAt: string | null; lastError: string | null } = {
    state: "idle",
    lastAttemptAt: null,
    lastError: null,
  };

  constructor(
    private readonly manager: DatabaseManager,
    private readonly store: AppStore,
    private readonly paths: AppPaths,
  ) {}

  list(): BackupRecord[] {
    return this.readIndex().backups
      .filter((item) => fs.existsSync(path.join(this.paths.backupsDir, item.filename)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getStatus() {
    return { ...this.status, busy: this.busy };
  }

  async create(type: BackupRecord["type"] = "manual", label = "", keep = false): Promise<BackupRecord> {
    if (this.busy) throw new Error("备份或恢复正在进行中");
    this.busy = true;
    this.status = { state: "idle", lastAttemptAt: new Date().toISOString(), lastError: null };
    try {
      const result = await this.createInternal(type, label, keep);
      this.status = { state: "ok", lastAttemptAt: new Date().toISOString(), lastError: null };
      return result;
    } catch (error) {
      this.status = { state: "error", lastAttemptAt: new Date().toISOString(), lastError: (error as Error).message };
      throw error;
    } finally {
      this.busy = false;
    }
  }

  updateMetadata(id: string, input: { label?: string; keep?: boolean }): BackupRecord {
    const index = this.readIndex();
    const record = index.backups.find((item) => item.id === id);
    if (!record) throw new Error("没有找到这份备份");
    if (typeof input.label === "string") record.label = input.label.trim();
    if (typeof input.keep === "boolean") record.keep = input.keep;
    this.writeIndex(index);
    return record;
  }

  async ensureDailyBackup(now = new Date()): Promise<BackupRecord | null> {
    const today = now.toISOString().slice(0, 10);
    const existing = this.list().find((item) => item.type === "automatic" && item.createdAt.startsWith(today));
    if (existing) return null;
    const record = await this.create("automatic", "每日自动备份", false);
    this.applyRetention();
    return record;
  }

  async restore(id: string): Promise<void> {
    if (this.busy) throw new Error("备份或恢复正在进行中");
    this.busy = true;
    const record = this.list().find((item) => item.id === id);
    if (!record) {
      this.busy = false;
      throw new Error("没有找到这份备份");
    }
    const rollback = `${this.paths.dataFile}.restore-rollback`;
    const incoming = `${this.paths.dataFile}.restore-incoming`;
    try {
      const source = this.safeBackupPath(record.filename);
      this.verifyBackup(source);
      await this.createInternal("safety", "恢复前安全备份", true);
      this.manager.checkpoint();
      this.manager.close();
      fs.copyFileSync(source, incoming);
      if (fs.existsSync(rollback)) fs.unlinkSync(rollback);
      fs.renameSync(this.paths.dataFile, rollback);
      fs.renameSync(incoming, this.paths.dataFile);
      this.manager.open();
      if (this.manager.integrityCheck() !== "ok") throw new Error("恢复后的数据库完整性检查失败");
      if (fs.existsSync(rollback)) fs.unlinkSync(rollback);
    } catch (error) {
      try {
        this.manager.close();
      } catch {
        // The connection may already be closed.
      }
      if (fs.existsSync(rollback)) {
        if (fs.existsSync(this.paths.dataFile)) fs.unlinkSync(this.paths.dataFile);
        fs.renameSync(rollback, this.paths.dataFile);
      }
      if (fs.existsSync(incoming)) fs.unlinkSync(incoming);
      this.manager.open();
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async exportAll(): Promise<{ filename: string; path: string; size: number }> {
    const zip = new JSZip();
    const state = { ...this.store.state(), learning: learningState(this.manager) };
    const manifest = {
      exportedAt: new Date().toISOString(),
      app: "MuziWorkspace",
      schemaVersion: this.currentSchemaVersion(),
      formatVersion: 1,
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("all-data.json", JSON.stringify(state, null, 2));
    const folder = zip.folder("csv")!;
    for (const name of Object.keys(collectionDefinitions) as CollectionName[]) {
      folder.file(`${name}.csv`, toCsv(this.store.list(name, true)));
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const filename = `muzi-export-${safeTimestamp()}.zip`;
    const output = path.join(this.paths.exportsDir, filename);
    fs.writeFileSync(output, buffer);
    return { filename, path: output, size: buffer.byteLength };
  }

  private async createInternal(type: BackupRecord["type"], label: string, keep: boolean): Promise<BackupRecord> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const filename = `${type}-${safeTimestamp(new Date(createdAt))}-${id.slice(0, 8)}.sqlite`;
    const target = this.safeBackupPath(filename);
    const temporary = `${target}.partial`;
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    this.manager.checkpoint();
    await this.manager.db.backup(temporary);
    this.verifyBackup(temporary);
    fs.renameSync(temporary, target);
    const record: BackupRecord = {
      id,
      filename,
      createdAt,
      size: fs.statSync(target).size,
      type,
      label,
      keep,
    };
    const index = this.readIndex();
    index.backups.push(record);
    this.writeIndex(index);
    return record;
  }

  private verifyBackup(file: string): void {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const integrity = db.pragma("integrity_check", { simple: true });
      if (String(integrity) !== "ok") throw new Error("备份文件完整性检查失败");
      const migration = db.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get();
      if (!migration) throw new Error("备份文件缺少数据库版本信息");
    } finally {
      db.close();
    }
  }

  private currentSchemaVersion(): string | null {
    const row = this.manager.db.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as { version: string } | undefined;
    return row?.version ?? null;
  }

  private applyRetention(): void {
    const index = this.readIndex();
    const automatic = index.backups
      .filter((item) => item.type === "automatic" && !item.keep)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const remove = new Set(automatic.slice(30).map((item) => item.id));
    for (const item of index.backups.filter((entry) => remove.has(entry.id))) {
      const file = this.safeBackupPath(item.filename);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    index.backups = index.backups.filter((item) => !remove.has(item.id));
    this.writeIndex(index);
  }

  private safeBackupPath(filename: string): string {
    if (path.basename(filename) !== filename) throw new Error("备份文件路径无效");
    const resolved = path.resolve(this.paths.backupsDir, filename);
    if (!resolved.startsWith(`${path.resolve(this.paths.backupsDir)}${path.sep}`)) throw new Error("备份文件路径无效");
    return resolved;
  }

  private readIndex(): BackupIndex {
    if (!fs.existsSync(this.paths.backupIndex)) return { version: 1, backups: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.paths.backupIndex, "utf8")) as BackupIndex;
      return parsed.version === 1 && Array.isArray(parsed.backups) ? parsed : { version: 1, backups: [] };
    } catch {
      return { version: 1, backups: [] };
    }
  }

  private writeIndex(index: BackupIndex): void {
    const temporary = `${this.paths.backupIndex}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(index, null, 2), "utf8");
    fs.renameSync(temporary, this.paths.backupIndex);
  }
}

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: any) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [columns.map(escape).join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
}
