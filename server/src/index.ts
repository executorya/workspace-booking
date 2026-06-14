import "dotenv/config";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import {
  Booking,
  db,
  formatWorkspace,
  initDatabase,
  now,
  parseLayout,
  PublicUser,
  Role,
  toBooking,
  toPublicUser,
  toUser,
  toWorkspace,
  Workspace,
  WorkspaceType
} from "./db.js";

initDatabase();

const app = express();
const port = Number(process.env.PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret";

app.use(cors({ origin: process.env.CLIENT_URL ?? "http://localhost:5173" }));
app.use(express.json());

type AuthUser = {
  id: number;
  role: Role;
};

type AuthedRequest = Request & {
  user?: AuthUser;
};

type WorkspaceWithExtras = ReturnType<typeof formatWorkspace> & {
  bookings?: Booking[];
};

type BookingResponse = Booking & {
  workspace: ReturnType<typeof formatWorkspace>;
  user?: PublicUser;
};

const workspaceTypes = ["DESK", "MEETING_ROOM", "CONFERENCE_ROOM"] as const;
const bookingStatuses = ["PENDING", "CONFIRMED", "CANCELLED"] as const;

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(6)
});

const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1)
});

const workspaceSchema = z.object({
  title: z.string().trim().min(3),
  description: z.string().trim().min(10),
  type: z.enum(workspaceTypes),
  capacity: z.coerce.number().int().min(1),
  pricePerHour: z.coerce.number().int().min(0),
  location: z.string().trim().min(3),
  imageUrl: z.string().trim().url(),
  amenities: z.array(z.string().trim().min(1)).default([]),
  isActive: z.boolean().optional()
});

const bookingSchema = z.object({
  workspaceId: z.coerce.number().int().positive(),
  seatLabel: z.string().trim().min(1).optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date()
}).refine((value) => value.endTime > value.startTime, {
  message: "Время окончания должно быть позже времени начала",
  path: ["endTime"]
});

const statusSchema = z.object({
  status: z.enum(bookingStatuses)
});

function signToken(user: AuthUser) {
  return jwt.sign(user, jwtSecret, { expiresIn: "7d" });
}

function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Необходима авторизация" });
  }

  try {
    req.user = jwt.verify(token, jwtSecret) as AuthUser;
    return next();
  } catch {
    return res.status(401).json({ message: "Сессия недействительна" });
  }
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ message: "Доступ только для администратора" });
  }

  return next();
}

function getUserByEmail(email: string) {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as Record<string, unknown> | undefined;
  return row ? toUser(row) : null;
}

function getUserById(id: number) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? toUser(row) : null;
}

function getWorkspaceById(id: number) {
  const row = db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? toWorkspace(row) : null;
}

function getBookingById(id: number) {
  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? toBooking(row) : null;
}

function bookingToResponse(booking: Booking, includeUser = false): BookingResponse {
  const workspace = getWorkspaceById(booking.workspaceId);
  const user = includeUser ? getUserById(booking.userId) : null;

  return {
    ...booking,
    workspace: formatWorkspace(workspace!),
    ...(user ? { user: toPublicUser(user) } : {})
  };
}

function getValidSeatLabel(workspace: Workspace, requestedSeat?: string) {
  const layout = parseLayout(workspace.layoutJson);

  if (layout.spots.length === 0) {
    return null;
  }

  if (!requestedSeat) {
    throw new Error("Выберите место на схеме");
  }

  const spot = layout.spots.find((item) => item.label === requestedSeat);
  if (!spot) {
    throw new Error("Выбранного места нет на схеме помещения");
  }

  return spot.label;
}

function hasBookingConflict(workspaceId: number, startTime: Date, endTime: Date, seatLabel: string | null, excludeId?: number) {
  const overlapParams: Array<string | number | null> = [
    workspaceId,
    endTime.toISOString(),
    startTime.toISOString(),
    excludeId ?? null,
    excludeId ?? null
  ];

  if (!seatLabel) {
    const row = db.prepare(`
      SELECT id FROM bookings
      WHERE workspace_id = ?
        AND status != 'CANCELLED'
        AND start_time < ?
        AND end_time > ?
        AND (? IS NULL OR id != ?)
      LIMIT 1
    `).get(...overlapParams);

    return Boolean(row);
  }

  const row = db.prepare(`
    SELECT id FROM bookings
    WHERE workspace_id = ?
      AND status != 'CANCELLED'
      AND start_time < ?
      AND end_time > ?
      AND (? IS NULL OR id != ?)
      AND (seat_label = ? OR seat_label IS NULL OR seat_label = '')
    LIMIT 1
  `).get(...overlapParams, seatLabel);

  return Boolean(row);
}

function createDefaultLayout(capacity: number, type: WorkspaceType) {
  if (type !== "DESK") {
    return JSON.stringify({
      width: 100,
      height: 64,
      zones: [
        { label: "Экран", x: 12, y: 6, w: 76, h: 7 },
        { label: "Вход", x: 4, y: 48, w: 16, h: 10 }
      ],
      spots: [{ id: "room", label: "Вся комната", x: 24, y: 22, w: 52, h: 22, type: "room" }]
    });
  }

  const count = Math.min(Math.max(capacity, 1), 24);
  const columns = Math.min(6, Math.ceil(Math.sqrt(count)));
  const spots = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const label = `M${index + 1}`;
    return {
      id: label,
      label,
      x: 12 + column * 13,
      y: 14 + row * 12,
      w: 9,
      h: 8,
      type: "desk"
    };
  });

  return JSON.stringify({
    width: 100,
    height: 64,
    zones: [{ label: "Рабочая зона", x: 6, y: 10, w: 82, h: 44 }],
    spots
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);

    if (getUserByEmail(payload.email)) {
      return res.status(409).json({ message: "Пользователь с такой почтой уже существует" });
    }

    const timestamp = now();
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, 'USER', ?, ?)
    `).run(payload.name, payload.email, passwordHash, timestamp, timestamp);

    const user = getUserById(Number(result.lastInsertRowid))!;
    return res.status(201).json({ user: toPublicUser(user), token: signToken({ id: user.id, role: user.role }) });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const user = getUserByEmail(payload.email);

    if (!user || !(await bcrypt.compare(payload.password, user.passwordHash))) {
      return res.status(401).json({ message: "Неверная почта или пароль" });
    }

    return res.json({ user: toPublicUser(user), token: signToken({ id: user.id, role: user.role }) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/me", authenticate, (req: AuthedRequest, res) => {
  const user = getUserById(req.user!.id);

  if (!user) {
    return res.status(404).json({ message: "Пользователь не найден" });
  }

  return res.json({ user: toPublicUser(user) });
});

app.get("/api/workspaces", (req, res, next) => {
  try {
    const type = typeof req.query.type === "string" ? req.query.type : "ALL";
    const capacity = typeof req.query.capacity === "string" ? Number(req.query.capacity) : 0;
    const maxPrice = typeof req.query.maxPrice === "string" ? Number(req.query.maxPrice) : 0;

    let sql = "SELECT * FROM workspaces WHERE is_active = 1";
    const params: Array<string | number> = [];

    if (type !== "ALL" && workspaceTypes.includes(type as WorkspaceType)) {
      sql += " AND type = ?";
      params.push(type);
    }

    if (Number.isFinite(capacity) && capacity > 0) {
      sql += " AND capacity >= ?";
      params.push(capacity);
    }

    if (Number.isFinite(maxPrice) && maxPrice > 0) {
      sql += " AND price_per_hour <= ?";
      params.push(maxPrice);
    }

    sql += " ORDER BY created_at DESC";

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    const workspaces = rows.map(toWorkspace).map(formatWorkspace);

    return res.json({ workspaces });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/workspaces/:id", (req, res, next) => {
  try {
    const workspace = getWorkspaceById(Number(req.params.id));

    if (!workspace || !workspace.isActive) {
      return res.status(404).json({ message: "Помещение не найдено" });
    }

    const bookingRows = db.prepare(`
      SELECT * FROM bookings
      WHERE workspace_id = ? AND status != 'CANCELLED'
      ORDER BY start_time ASC
    `).all(workspace.id) as Record<string, unknown>[];

    const response: WorkspaceWithExtras = {
      ...formatWorkspace(workspace),
      bookings: bookingRows.map(toBooking)
    };

    return res.json({ workspace: response });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/bookings", authenticate, (req: AuthedRequest, res, next) => {
  try {
    const payload = bookingSchema.parse(req.body);
    const workspace = getWorkspaceById(payload.workspaceId);

    if (!workspace || !workspace.isActive) {
      return res.status(404).json({ message: "Помещение не найдено" });
    }

    let seatLabel: string | null;
    try {
      seatLabel = getValidSeatLabel(workspace, payload.seatLabel);
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : "Некорректное место" });
    }

    if (hasBookingConflict(payload.workspaceId, payload.startTime, payload.endTime, seatLabel)) {
      return res.status(409).json({ message: "Выбранное место уже занято на это время" });
    }

    const timestamp = now();
    const result = db.prepare(`
      INSERT INTO bookings (user_id, workspace_id, seat_label, start_time, end_time, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(
      req.user!.id,
      payload.workspaceId,
      seatLabel,
      payload.startTime.toISOString(),
      payload.endTime.toISOString(),
      timestamp,
      timestamp
    );

    const booking = getBookingById(Number(result.lastInsertRowid))!;
    return res.status(201).json({ booking: bookingToResponse(booking) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/bookings/my", authenticate, (req: AuthedRequest, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM bookings
      WHERE user_id = ?
      ORDER BY start_time DESC
    `).all(req.user!.id) as Record<string, unknown>[];

    return res.json({ bookings: rows.map(toBooking).map((booking) => bookingToResponse(booking)) });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/bookings/:id/cancel", authenticate, (req: AuthedRequest, res, next) => {
  try {
    const booking = getBookingById(Number(req.params.id));

    if (!booking || booking.userId !== req.user!.id) {
      return res.status(404).json({ message: "Бронирование не найдено" });
    }

    db.prepare("UPDATE bookings SET status = 'CANCELLED', updated_at = ? WHERE id = ?").run(now(), booking.id);
    const updated = getBookingById(booking.id)!;

    return res.json({ booking: bookingToResponse(updated) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/workspaces", authenticate, requireAdmin, (_req, res, next) => {
  try {
    const rows = db.prepare("SELECT * FROM workspaces ORDER BY created_at DESC").all() as Record<string, unknown>[];
    return res.json({ workspaces: rows.map(toWorkspace).map(formatWorkspace) });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/admin/workspaces", authenticate, requireAdmin, (req, res, next) => {
  try {
    const payload = workspaceSchema.parse(req.body);
    const timestamp = now();
    const result = db.prepare(`
      INSERT INTO workspaces
        (title, description, type, capacity, price_per_hour, location, image_url, amenities, layout_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.title,
      payload.description,
      payload.type,
      payload.capacity,
      payload.pricePerHour,
      payload.location,
      payload.imageUrl,
      payload.amenities.join(","),
      createDefaultLayout(payload.capacity, payload.type),
      payload.isActive === false ? 0 : 1,
      timestamp,
      timestamp
    );

    const workspace = getWorkspaceById(Number(result.lastInsertRowid))!;
    return res.status(201).json({ workspace: formatWorkspace(workspace) });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/admin/workspaces/:id", authenticate, requireAdmin, (req, res, next) => {
  try {
    const payload = workspaceSchema.partial().parse(req.body);
    const workspace = getWorkspaceById(Number(req.params.id));

    if (!workspace) {
      return res.status(404).json({ message: "Помещение не найдено" });
    }

    const nextWorkspace = {
      title: payload.title ?? workspace.title,
      description: payload.description ?? workspace.description,
      type: payload.type ?? workspace.type,
      capacity: payload.capacity ?? workspace.capacity,
      pricePerHour: payload.pricePerHour ?? workspace.pricePerHour,
      location: payload.location ?? workspace.location,
      imageUrl: payload.imageUrl ?? workspace.imageUrl,
      amenities: payload.amenities ? payload.amenities.join(",") : workspace.amenities,
      layoutJson: payload.capacity || payload.type ? createDefaultLayout(payload.capacity ?? workspace.capacity, payload.type ?? workspace.type) : workspace.layoutJson,
      isActive: payload.isActive === undefined ? workspace.isActive : (payload.isActive ? 1 : 0)
    };

    db.prepare(`
      UPDATE workspaces
      SET title = ?, description = ?, type = ?, capacity = ?, price_per_hour = ?,
          location = ?, image_url = ?, amenities = ?, layout_json = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      nextWorkspace.title,
      nextWorkspace.description,
      nextWorkspace.type,
      nextWorkspace.capacity,
      nextWorkspace.pricePerHour,
      nextWorkspace.location,
      nextWorkspace.imageUrl,
      nextWorkspace.amenities,
      nextWorkspace.layoutJson,
      nextWorkspace.isActive,
      now(),
      workspace.id
    );

    return res.json({ workspace: formatWorkspace(getWorkspaceById(workspace.id)!) });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/admin/workspaces/:id", authenticate, requireAdmin, (req, res, next) => {
  try {
    const workspace = getWorkspaceById(Number(req.params.id));

    if (!workspace) {
      return res.status(404).json({ message: "Помещение не найдено" });
    }

    db.prepare("UPDATE workspaces SET is_active = 0, updated_at = ? WHERE id = ?").run(now(), workspace.id);
    return res.json({ workspace: formatWorkspace(getWorkspaceById(workspace.id)!) });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/admin/bookings", authenticate, requireAdmin, (_req, res, next) => {
  try {
    const rows = db.prepare("SELECT * FROM bookings ORDER BY start_time DESC").all() as Record<string, unknown>[];
    return res.json({ bookings: rows.map(toBooking).map((booking) => bookingToResponse(booking, true)) });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/admin/bookings/:id/status", authenticate, requireAdmin, (req, res, next) => {
  try {
    const payload = statusSchema.parse(req.body);
    const booking = getBookingById(Number(req.params.id));

    if (!booking) {
      return res.status(404).json({ message: "Бронирование не найдено" });
    }

    if (
      payload.status !== "CANCELLED" &&
      hasBookingConflict(booking.workspaceId, new Date(booking.startTime), new Date(booking.endTime), booking.seatLabel, booking.id)
    ) {
      return res.status(409).json({ message: "Невозможно подтвердить бронь из-за пересечения" });
    }

    db.prepare("UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?").run(payload.status, now(), booking.id);
    const updated = getBookingById(booking.id)!;

    return res.json({ booking: bookingToResponse(updated, true) });
  } catch (error) {
    return next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: "Ошибка валидации", issues: error.flatten() });
  }

  console.error(error);
  return res.status(500).json({ message: "Внутренняя ошибка сервера" });
});

app.listen(port, () => {
  console.log(`API is running on http://localhost:${port}`);
});
