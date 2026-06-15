import { createClient, Client, ResultSet } from "@libsql/client"

let _libsql: Client | null = null

function getClient(): Client {
  if (!_libsql) {
    _libsql = createClient({
      url: process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  }
  return _libsql
}

// Helper: convert a row to a plain object
function row<T>(rs: ResultSet): T | null {
  return (rs.rows[0] as T) ?? null
}

// Helper: convert all rows to plain objects
function rows<T>(rs: ResultSet): T[] {
  return rs.rows as T[]
}

// Helper: build WHERE clause and args from a filter object
function buildWhere(filter: Record<string, any>, prefix = ""): { clause: string; args: any[] } {
  const clauses: string[] = []
  const args: any[] = []
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue
    const col = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === "object" && "every" in value) {
      // Handle arrays for Prisma IN operator
      clauses.push(`${col} IN (${value.map(() => "?").join(",")})`)
      args.push(...value)
    } else {
      clauses.push(`${col} = ?`)
      args.push(value)
    }
  }
  return { clause: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", args }
}

// Serialize dates for inserts
function now() {
  return new Date().toISOString()
}

export const db = {
  user: {
    async findUnique({ where, select }: { where: { id?: string; email?: string }; select?: Record<string, boolean> }) {
      const w = buildWhere(where)
      const cols = select ? Object.keys(select).join(", ") : "*"
      const rs = await getClient().execute(`SELECT ${cols} FROM User${w.clause} LIMIT 1`, w.args)
      return row<any>(rs)
    },
    async findMany({ select, orderBy }: { select?: Record<string, boolean>; orderBy?: Record<string, string> }) {
      const cols = select ? Object.keys(select).join(", ") : "*"
      let sql = `SELECT ${cols} FROM User`
      if (orderBy) {
        const orders = Object.entries(orderBy).map(([k, v]) => `${k} ${v}`).join(", ")
        sql += ` ORDER BY ${orders}`
      }
      const rs = await getClient().execute(sql)
      return rows<any>(rs)
    },
    async create({ data, select }: { data: { id?: string; email: string; name?: string; passwordHash: string; role: string; createdAt?: string; updatedAt?: string }; select?: Record<string, boolean> }) {
      const id = data.id || crypto.randomUUID()
      const createdAt = data.createdAt || now()
      const updatedAt = data.updatedAt || now()
      const insertData = { ...data, id, createdAt, updatedAt }
      const keys = Object.keys(insertData)
      const vals = Object.values(insertData)
      const placeholders = vals.map(() => "?").join(", ")

      await getClient().execute(
        `INSERT INTO User (${keys.join(", ")}) VALUES (${placeholders})`,
        vals
      )

      if (select) {
        const cols = Object.keys(select).join(", ")
        const rs = await getClient().execute(`SELECT ${cols} FROM User WHERE id = ?`, [id])
        return row<any>(rs)
      }
      return { id, ...data }
    },
    async delete({ where }: { where: { id: string } }) {
      const rs = await getClient().execute("DELETE FROM User WHERE id = ?", [where.id])
      return rs
    },
    async count({ where }: { where?: Record<string, unknown> } = {}) {
      let sql = "SELECT COUNT(*) as count FROM User"
      const w: string[] = []
      const args: any[] = []
      if (where) {
        for (const [key, value] of Object.entries(where)) {
          if (value !== undefined && value !== null && value !== "") {
            w.push(`${key} = ?`)
            args.push(value)
          }
        }
        if (w.length) sql += " WHERE " + w.join(" AND ")
      }
      const rs = await getClient().execute(sql, args)
      return Number((rs.rows[0] as any).count)
    },
    async update({ where, data, select }: { where: { id: string }; data: Record<string, any>; select?: Record<string, boolean> }) {
      const sets: string[] = []
      const args: any[] = []
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) {
          sets.push(`${k} = ?`)
          args.push(v)
        }
      }
      sets.push("updatedAt = ?")
      args.push(now())
      args.push(where.id)
      await getClient().execute(
        `UPDATE User SET ${sets.join(", ")} WHERE id = ?`,
        args
      )
      if (select) {
        const cols = Object.keys(select).join(", ")
        const rs = await getClient().execute(`SELECT ${cols} FROM User WHERE id = ?`, [where.id])
        return row<any>(rs)
      }
      return { id: where.id, ...data }
    },
  },

  serviceConfig: {
    async findUnique({ where }: { where: { service_key: { service: string; key: string } } | { id: string } }) {
      let sql: string, args: any[]
      if ("service_key" in where) {
        sql = "SELECT * FROM ServiceConfig WHERE service = ? AND key = ? LIMIT 1"
        args = [where.service_key.service, where.service_key.key]
      } else {
        sql = "SELECT * FROM ServiceConfig WHERE id = ? LIMIT 1"
        args = [where.id]
      }
      const rs = await getClient().execute(sql, args)
      return row<any>(rs)
    },
    async findMany({ where, orderBy }: { where?: { service?: string }; orderBy?: { service?: string; key?: string }[] }) {
      let sql = "SELECT * FROM ServiceConfig"
      const w: any[] = []
      const args: any[] = []
      if (where?.service) {
        w.push("service = ?")
        args.push(where.service)
      }
      if (w.length) sql += " WHERE " + w.join(" AND ")
      if (orderBy && orderBy.length) {
        const orders = orderBy.map(o => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ")).join(", ")
        sql += ` ORDER BY ${orders}`
      }
      const rs = await getClient().execute(sql, args)
      return rows<any>(rs)
    },
    async upsert({ where, update, create }: { where: { service_key: { service: string; key: string } }; update: Record<string, any>; create: Record<string, any> }) {
      const { service, key } = where.service_key
      const existing = await getClient().execute(
        "SELECT id FROM ServiceConfig WHERE service = ? AND key = ? LIMIT 1",
        [service, key]
      )
      if (existing.rows.length > 0) {
        const sets: string[] = []
        const args: any[] = []
        for (const [k, v] of Object.entries(update)) {
          if (v !== undefined) {
            sets.push(`${k} = ?`)
            args.push(v)
          }
        }
        sets.push("updatedAt = ?")
        args.push(now())
        args.push(service, key)
        await getClient().execute(
          `UPDATE ServiceConfig SET ${sets.join(", ")} WHERE service = ? AND key = ?`,
          args
        )
      } else {
        const insertData = { ...create, id: create.id || crypto.randomUUID(), createdAt: now(), updatedAt: now() }
        const keys = Object.keys(insertData)
        const vals = Object.values(insertData)
        await getClient().execute(
          `INSERT INTO ServiceConfig (${keys.join(", ")}) VALUES (${vals.map(() => "?").join(", ")})`,
          vals
        )
      }
      const rs = await getClient().execute(
        "SELECT * FROM ServiceConfig WHERE service = ? AND key = ? LIMIT 1",
        [service, key]
      )
      return row<any>(rs)
    },
    async delete({ where }: { where: { id: string } }) {
      await getClient().execute("DELETE FROM ServiceConfig WHERE id = ?", [where.id])
    },
  },

  activityLog: {
    async create({ data }: { data: { id?: string; userId: string; action: string; service?: string; details?: string; createdAt?: string } }) {
      const insertData = {
        id: data.id || crypto.randomUUID(),
        userId: data.userId,
        action: data.action,
        service: data.service || null,
        details: data.details || null,
        createdAt: data.createdAt || now(),
      }
      const keys = Object.keys(insertData)
      const vals = Object.values(insertData)
      await getClient().execute(
        `INSERT INTO ActivityLog (${keys.join(", ")}) VALUES (${vals.map(() => "?").join(", ")})`,
        vals
      )
      return { id: insertData.id }
    },
    async findMany({ where, orderBy, take, skip, include }: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, string>;
      take?: number;
      skip?: number;
      include?: { user?: { select?: Record<string, boolean> } };
    }) {
      let sql = "SELECT * FROM ActivityLog"
      const w: string[] = []
      const args: any[] = []

      if (where) {
        for (const [key, value] of Object.entries(where)) {
          if (value !== undefined && value !== null && value !== "") {
            w.push(`${key} = ?`)
            args.push(value)
          }
        }
      }
      if (w.length) sql += " WHERE " + w.join(" AND ")

      if (orderBy) {
        const orders = Object.entries(orderBy).map(([k, v]) => `${k} ${v}`).join(", ")
        sql += ` ORDER BY ${orders}`
      }
      if (take !== undefined) sql += ` LIMIT ${take}`
      if (skip !== undefined) sql += ` OFFSET ${skip}`

      const rs = await getClient().execute(sql, args)
      const logs = rows<any>(rs)

      // Handle include: user select
      if (include?.user?.select && logs.length > 0) {
        const userIds = [...new Set(logs.map(l => l.userId))]
        const userCols = Object.keys(include.user.select).join(", ")
        const userRs = await getClient().execute(
          `SELECT id, ${userCols} FROM User WHERE id IN (${userIds.map(() => "?").join(",")})`,
          userIds
        )
        const userMap = new Map<string, any>()
        for (const u of userRs.rows) {
          userMap.set((u as any).id, u)
        }
        for (const log of logs) {
          log.user = userMap.get(log.userId) || null
        }
      }

      return logs
    },
    async count({ where }: { where?: Record<string, unknown> }) {
      let sql = "SELECT COUNT(*) as count FROM ActivityLog"
      const w: string[] = []
      const args: any[] = []
      if (where) {
        for (const [key, value] of Object.entries(where)) {
          if (value !== undefined && value !== null && value !== "") {
            w.push(`${key} = ?`)
            args.push(value)
          }
        }
        if (w.length) sql += " WHERE " + w.join(" AND ")
      }
      const rs = await getClient().execute(sql, args)
      return Number((rs.rows[0] as any).count)
    },
  },
}
