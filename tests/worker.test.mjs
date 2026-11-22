import assert from "node:assert/strict";
import test from "node:test";
import worker from "../dist/server/index.js";

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    if (this.sql.startsWith("SELECT id")) {
      const results = [...this.db.rows]
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
        .slice(0, 50);
      return { results, meta: { changes: 0 } };
    }
    if (this.sql.startsWith("SELECT COALESCE")) {
      return { results: [{ total: this.db.rows.reduce((sum, row) => sum + row.amount, 0) }], meta: { changes: 0 } };
    }
    if (this.sql.startsWith("INSERT")) {
      const [id, owner_id, amount, created_at] = this.values;
      this.db.rows.push({ id, owner_id, amount, created_at });
      return { results: [], meta: { changes: 1 } };
    }
    if (this.sql.includes("WHERE id = ?")) {
      const [id, ownerId] = this.values;
      const before = this.db.rows.length;
      this.db.rows = this.db.rows.filter((row) => row.id !== id || row.owner_id !== ownerId);
      return { results: [], meta: { changes: before - this.db.rows.length } };
    }
    if (this.sql.includes("WHERE owner_id = ?")) {
      const [ownerId] = this.values;
      const before = this.db.rows.length;
      this.db.rows = this.db.rows.filter((row) => row.owner_id !== ownerId);
      return { results: [], meta: { changes: before - this.db.rows.length } };
    }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}

class FakeDB {
  rows = [];

  prepare(sql) {
    return new Statement(this, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

function request(path, options) {
  return new Request(`https://example.test${path}`, options);
}

test("serves the dashboard and persists a shared contribution", async () => {
  const DB = new FakeDB();
  const ownerId = "11111111-1111-4111-8111-111111111111";
  const otherId = "22222222-2222-4222-8222-222222222222";

  const page = await worker.fetch(request("/"), { DB });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Shared live/);

  const preflight = await worker.fetch(request("/api/savings", { method: "OPTIONS" }), { DB });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://rutvi18.github.io");

  const created = await worker.fetch(request("/api/savings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount: 5000, clientId: ownerId })
  }), { DB });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.total, 5000);
  assert.equal(createdBody.contribution.isOwn, true);

  const shared = await worker.fetch(request(`/api/savings?clientId=${otherId}`), { DB });
  const sharedBody = await shared.json();
  assert.equal(sharedBody.total, 5000);
  assert.equal(sharedBody.contributions[0].isOwn, false);

  const blockedDelete = await worker.fetch(request(`/api/savings/${createdBody.contribution.id}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: otherId })
  }), { DB });
  assert.equal(blockedDelete.status, 404);

  const deleted = await worker.fetch(request(`/api/savings/${createdBody.contribution.id}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: ownerId })
  }), { DB });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).total, 0);
});
