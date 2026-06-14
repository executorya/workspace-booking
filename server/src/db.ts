import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Role = "USER" | "ADMIN";
export type WorkspaceType = "DESK" | "MEETING_ROOM" | "CONFERENCE_ROOM";
export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

export type LayoutSpot = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type?: "desk" | "room" | "soft" | "focus";
};

export type WorkspaceLayout = {
  width: number;
  height: number;
  spots: LayoutSpot[];
  zones: Array<{ label: string; x: number; y: number; w: number; h: number }>;
};

export type User = {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = Omit<User, "passwordHash" | "createdAt" | "updatedAt">;

export type Workspace = {
  id: number;
  title: string;
  description: string;
  type: WorkspaceType;
  capacity: number;
  pricePerHour: number;
  location: string;
  imageUrl: string;
  amenities: string;
  layoutJson: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

export type Booking = {
  id: number;
  userId: number;
  workspaceId: number;
  seatLabel: string | null;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");

const defaultLayout: WorkspaceLayout = {
  width: 100,
  height: 64,
  zones: [],
  spots: []
};

function resolveDatabasePath() {
  const configured = process.env.DATABASE_FILE ?? process.env.DATABASE_URL?.replace(/^file:/, "") ?? "./dev.db";
  return path.isAbsolute(configured) ? configured : path.resolve(serverRoot, configured);
}

export const db = new Database(resolveDatabasePath());
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function now() {
  return new Date().toISOString();
}

function hasColumn(table: "workspaces" | "bookings", column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'USER',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      price_per_hour INTEGER NOT NULL,
      location TEXT NOT NULL,
      image_url TEXT NOT NULL,
      amenities TEXT NOT NULL,
      layout_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      workspace_id INTEGER NOT NULL,
      seat_label TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
  `);

  if (!hasColumn("workspaces", "layout_json")) {
    db.exec("ALTER TABLE workspaces ADD COLUMN layout_json TEXT");
  }

  if (!hasColumn("bookings", "seat_label")) {
    db.exec("ALTER TABLE bookings ADD COLUMN seat_label TEXT");
  }

  db.prepare("UPDATE workspaces SET layout_json = ? WHERE layout_json IS NULL OR layout_json = ''")
    .run(JSON.stringify(defaultLayout));

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bookings_workspace_time
      ON bookings(workspace_id, start_time, end_time, status, seat_label);
  `);
}

export function parseLayout(value: string | null | undefined): WorkspaceLayout {
  try {
    const parsed = value ? JSON.parse(value) as WorkspaceLayout : defaultLayout;
    return {
      width: parsed.width || 100,
      height: parsed.height || 64,
      zones: Array.isArray(parsed.zones) ? parsed.zones : [],
      spots: Array.isArray(parsed.spots) ? parsed.spots : []
    };
  } catch {
    return defaultLayout;
  }
}

export function toUser(row: Record<string, unknown>): User {
  return {
    id: Number(row.id),
    name: String(row.name),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: row.role as Role,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

export function toWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: Number(row.id),
    title: String(row.title),
    description: String(row.description),
    type: row.type as WorkspaceType,
    capacity: Number(row.capacity),
    pricePerHour: Number(row.price_per_hour),
    location: String(row.location),
    imageUrl: String(row.image_url),
    amenities: String(row.amenities),
    layoutJson: String(row.layout_json ?? JSON.stringify(defaultLayout)),
    isActive: Number(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function toBooking(row: Record<string, unknown>): Booking {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    workspaceId: Number(row.workspace_id),
    seatLabel: row.seat_label ? String(row.seat_label) : null,
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    status: row.status as BookingStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export function formatWorkspace(workspace: Workspace) {
  return {
    ...workspace,
    amenities: workspace.amenities.split(",").map((item) => item.trim()).filter(Boolean),
    layout: parseLayout(workspace.layoutJson),
    isActive: Boolean(workspace.isActive)
  };
}

function deskLayout(prefix: string, rows: number, columns: number): WorkspaceLayout {
  const spots: LayoutSpot[] = [];
  const startX = 12;
  const startY = 14;
  const gapX = 15;
  const gapY = 14;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const label = `${prefix}${row + 1}-${column + 1}`;
      spots.push({
        id: label,
        label,
        x: startX + column * gapX,
        y: startY + row * gapY,
        w: 9,
        h: 8,
        type: column % 2 === 0 ? "desk" : "focus"
      });
    }
  }

  return {
    width: 100,
    height: 64,
    zones: [
      { label: "Окна", x: 4, y: 4, w: 92, h: 6 },
      { label: "Тихая зона", x: 6, y: 12, w: 72, h: 40 },
      { label: "Кофе", x: 82, y: 40, w: 12, h: 14 }
    ],
    spots
  };
}

function roomLayout(label: string): WorkspaceLayout {
  return {
    width: 100,
    height: 64,
    zones: [
      { label: "Экран", x: 12, y: 6, w: 76, h: 7 },
      { label: "Вход", x: 4, y: 48, w: 16, h: 10 }
    ],
    spots: [
      { id: "room", label, x: 24, y: 22, w: 52, h: 22, type: "room" }
    ]
  };
}

function loungeLayout(prefix: string): WorkspaceLayout {
  return {
    width: 100,
    height: 64,
    zones: [
      { label: "Открытая зона", x: 8, y: 10, w: 56, h: 42 },
      { label: "Телефонные кабины", x: 70, y: 12, w: 20, h: 32 }
    ],
    spots: [
      { id: `${prefix}-S1`, label: `${prefix}-S1`, x: 14, y: 18, w: 12, h: 10, type: "soft" },
      { id: `${prefix}-S2`, label: `${prefix}-S2`, x: 32, y: 18, w: 12, h: 10, type: "soft" },
      { id: `${prefix}-S3`, label: `${prefix}-S3`, x: 50, y: 18, w: 12, h: 10, type: "soft" },
      { id: `${prefix}-F1`, label: `${prefix}-F1`, x: 72, y: 16, w: 8, h: 12, type: "focus" },
      { id: `${prefix}-F2`, label: `${prefix}-F2`, x: 82, y: 16, w: 8, h: 12, type: "focus" },
      { id: `${prefix}-S4`, label: `${prefix}-S4`, x: 22, y: 38, w: 12, h: 10, type: "soft" },
      { id: `${prefix}-S5`, label: `${prefix}-S5`, x: 44, y: 38, w: 12, h: 10, type: "soft" }
    ]
  };
}

type SeedWorkspace = {
  title: string;
  description: string;
  type: WorkspaceType;
  capacity: number;
  pricePerHour: number;
  location: string;
  imageUrl: string;
  amenities: string;
  layout: WorkspaceLayout;
};

export async function seedDatabase() {
  initDatabase();

  const timestamp = now();
  const adminPassword = await bcrypt.hash("admin123", 10);
  const userPassword = await bcrypt.hash("user123", 10);

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (name, email, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertUser.run("Администратор", "admin@workspace.local", adminPassword, "ADMIN", timestamp, timestamp);
  insertUser.run("Тестовый пользователь", "user@workspace.local", userPassword, "USER", timestamp, timestamp);

  const workspaces: SeedWorkspace[] = [
    {
      title: "Фокус-зона у окна",
      description: "Индивидуальные рабочие места в тихой зоне рядом с панорамными окнами.",
      type: "DESK",
      capacity: 12,
      pricePerHour: 250,
      location: "Бизнес-центр Север, 4 этаж",
      imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
      amenities: "Wi-Fi,Розетки,Настольные лампы,Кофе-зона",
      layout: deskLayout("A", 3, 4)
    },
    {
      title: "Open Space Atrium",
      description: "Светлая общая зона для фрилансеров и небольших команд с быстрым доступом к кофе-поинту.",
      type: "DESK",
      capacity: 18,
      pricePerHour: 320,
      location: "Коворкинг Центр, 1 этаж",
      imageUrl: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80",
      amenities: "Wi-Fi,Кофе,Принтер,Локеры",
      layout: deskLayout("B", 3, 6)
    },
    {
      title: "Тихая зона Library",
      description: "Небольшая зона для глубокой работы, учебы и задач, где важна концентрация.",
      type: "DESK",
      capacity: 8,
      pricePerHour: 300,
      location: "Деловой квартал, корпус A",
      imageUrl: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80",
      amenities: "Wi-Fi,Тихий режим,Индивидуальный свет,Вода",
      layout: deskLayout("L", 2, 4)
    },
    {
      title: "Lounge Flex",
      description: "Неформальная зона с мягкими местами и телефонными кабинами для коротких созвонов.",
      type: "DESK",
      capacity: 7,
      pricePerHour: 220,
      location: "Креативный кластер, 3 этаж",
      imageUrl: "https://images.unsplash.com/photo-1497366412874-3415097a27e7?auto=format&fit=crop&w=1200&q=80",
      amenities: "Wi-Fi,Мягкие кресла,Телефонные кабины,Кофе",
      layout: loungeLayout("LX")
    },
    {
      title: "Переговорная Orbit",
      description: "Комната для встреч команды, интервью и созвонов с клиентами.",
      type: "MEETING_ROOM",
      capacity: 6,
      pricePerHour: 900,
      location: "Коворкинг Центр, 2 этаж",
      imageUrl: "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1200&q=80",
      amenities: "Wi-Fi,Проектор,Маркерная доска,Кондиционер",
      layout: roomLayout("Orbit")
    },
    {
      title: "Переговорная Nova",
      description: "Компактная переговорная для быстрых встреч, собеседований и планерок.",
      type: "MEETING_ROOM",
      capacity: 4,
      pricePerHour: 650,
      location: "Бизнес-центр Север, 5 этаж",
      imageUrl: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80",
      amenities: "Wi-Fi,Экран,Доска,Видеосвязь",
      layout: roomLayout("Nova")
    },
    {
      title: "Конференц-зал Meridian",
      description: "Просторный зал для презентаций, воркшопов и учебных мероприятий.",
      type: "CONFERENCE_ROOM",
      capacity: 32,
      pricePerHour: 2600,
      location: "Деловой квартал, корпус B",
      imageUrl: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80",
      amenities: "Wi-Fi,Сцена,Экран,Звук,Гардероб",
      layout: roomLayout("Meridian")
    },
    {
      title: "Лекторий Vector",
      description: "Зал для лекций, демо-дней и защиты проектов с удобной рассадкой.",
      type: "CONFERENCE_ROOM",
      capacity: 48,
      pricePerHour: 3200,
      location: "Технопарк, главный корпус",
      imageUrl: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1200&q=80",
      amenities: "Wi-Fi,Микрофоны,Проектор,Сцена,Трибуна",
      layout: roomLayout("Vector")
    }
  ];

  const insertWorkspace = db.prepare(`
    INSERT INTO workspaces
      (title, description, type, capacity, price_per_hour, location, image_url, amenities, layout_json, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const updateExistingLayout = db.prepare(`
    UPDATE workspaces
    SET layout_json = ?, capacity = ?, updated_at = ?
    WHERE title = ? AND (layout_json IS NULL OR layout_json = '' OR layout_json LIKE '%"spots":[]%')
  `);

  const insertMissing = db.transaction(() => {
    for (const workspace of workspaces) {
      const existing = db.prepare("SELECT id FROM workspaces WHERE title = ?").get(workspace.title);
      const layoutJson = JSON.stringify(workspace.layout);

      if (existing) {
        updateExistingLayout.run(layoutJson, workspace.capacity, timestamp, workspace.title);
        continue;
      }

      insertWorkspace.run(
        workspace.title,
        workspace.description,
        workspace.type,
        workspace.capacity,
        workspace.pricePerHour,
        workspace.location,
        workspace.imageUrl,
        workspace.amenities,
        layoutJson,
        timestamp,
        timestamp
      );
    }
  });

  insertMissing();

  const legacyRows = db.prepare("SELECT id, title, type, capacity, layout_json FROM workspaces").all() as Array<{
    id: number;
    title: string;
    type: WorkspaceType;
    capacity: number;
    layout_json: string | null;
  }>;
  const updateLayout = db.prepare("UPDATE workspaces SET layout_json = ?, updated_at = ? WHERE id = ?");

  for (const row of legacyRows) {
    if (parseLayout(row.layout_json).spots.length > 0) {
      continue;
    }

    const layout = row.type === "DESK"
      ? deskLayout(`M${row.id}`, Math.max(1, Math.ceil(row.capacity / 4)), Math.min(4, Math.max(1, row.capacity)))
      : roomLayout(row.title);

    updateLayout.run(JSON.stringify(layout), timestamp, row.id);
  }
}
