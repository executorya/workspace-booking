import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  Armchair,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  Check,
  Clock,
  DoorOpen,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  X
} from "lucide-react";
import { api } from "./api/client";
import { Booking, BookingStatus, LayoutSpot, User, Workspace, WorkspaceType } from "./types";

const typeLabels: Record<WorkspaceType, string> = {
  DESK: "Рабочее место",
  MEETING_ROOM: "Переговорная",
  CONFERENCE_ROOM: "Конференц-зал"
};

const statusLabels: Record<BookingStatus, string> = {
  PENDING: "Ожидает",
  CONFIRMED: "Подтверждено",
  CANCELLED: "Отменено"
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) as User : null;
  });

  const saveSession = (nextUser: User, token: string) => {
    localStorage.setItem("user", JSON.stringify(nextUser));
    localStorage.setItem("token", token);
    setUser(nextUser);
  };

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
  };

  return { user, saveSession, logout };
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

function App() {
  const auth = useAuth();

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <Building2 size={24} />
          <span>WorkSpace Booking</span>
        </Link>
        <nav className="nav">
          <Link to="/workspaces">Каталог</Link>
          {auth.user && <Link to="/profile">Мои брони</Link>}
          {auth.user?.role === "ADMIN" && <Link to="/admin">Админка</Link>}
        </nav>
        <div className="user-panel">
          {auth.user ? (
            <>
              <span className="user-chip"><UserRound size={16} />{auth.user.name}</span>
              <button className="icon-button" onClick={auth.logout} title="Выйти">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link className="button compact" to="/login">
              <LogIn size={17} />
              Войти
            </Link>
          )}
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/workspaces" element={<WorkspaceList />} />
          <Route path="/workspaces/:id" element={<WorkspaceDetails user={auth.user} />} />
          <Route path="/login" element={<AuthPage mode="login" onAuth={auth.saveSession} />} />
          <Route path="/register" element={<AuthPage mode="register" onAuth={auth.saveSession} />} />
          <Route path="/profile" element={auth.user ? <Profile /> : <Navigate to="/login" />} />
          <Route path="/admin" element={auth.user?.role === "ADMIN" ? <AdminPanel /> : <Navigate to="/login" />} />
        </Routes>
      </main>
    </div>
  );
}

function Home() {
  return (
    <section className="home">
      <div className="home-copy">
        <p className="eyebrow">Бронирование рабочих пространств</p>
        <h1>WorkSpace Booking</h1>
        <p>
          Платформа помогает выбрать рабочее место, переговорную или конференц-зал,
          проверить доступность на схеме и оформить бронирование в несколько действий.
        </p>
        <div className="actions">
          <Link className="button" to="/workspaces">
            <Search size={18} />
            Найти помещение
          </Link>
          <Link className="button secondary" to="/register">
            <UserRound size={18} />
            Зарегистрироваться
          </Link>
        </div>
      </div>
      <div className="home-media" aria-hidden="true">
        <img
          src="https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80"
          alt=""
        />
      </div>
    </section>
  );
}

function WorkspaceList() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    type: "ALL",
    capacity: "",
    maxPrice: ""
  });

  const loadWorkspaces = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    setLoading(true);
    setError("");
    api<{ workspaces: Workspace[] }>(`/workspaces?${params.toString()}`)
      .then((data) => setWorkspaces(data.workspaces))
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить каталог");
        setWorkspaces([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWorkspaces();
  }, [filters]);

  return (
    <section className="page">
      <div className="section-title">
        <div>
          <p className="eyebrow">Каталог</p>
          <h1>Доступные пространства</h1>
        </div>
      </div>

      <form className="filters">
        <label>
          Тип
          <select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
            <option value="ALL">Все</option>
            <option value="DESK">Рабочее место</option>
            <option value="MEETING_ROOM">Переговорная</option>
            <option value="CONFERENCE_ROOM">Конференц-зал</option>
          </select>
        </label>
        <label>
          Вместимость от
          <input
            type="number"
            min="1"
            value={filters.capacity}
            onChange={(event) => setFilters({ ...filters, capacity: event.target.value })}
          />
        </label>
        <label>
          Цена до, ₽/час
          <input
            type="number"
            min="0"
            value={filters.maxPrice}
            onChange={(event) => setFilters({ ...filters, maxPrice: event.target.value })}
          />
        </label>
      </form>

      {loading ? (
        <p className="muted">Загрузка...</p>
      ) : error ? (
        <StatePanel
          icon={<AlertCircle size={24} />}
          title="Каталог временно недоступен"
          text={error}
          action={<button className="button compact" onClick={loadWorkspaces} type="button"><RefreshCw size={17} />Повторить</button>}
        />
      ) : workspaces.length === 0 ? (
        <StatePanel
          icon={<Search size={24} />}
          title="Ничего не найдено"
          text="Попробуйте изменить фильтры или сбросить ограничения по вместимости и цене."
        />
      ) : (
        <div className="grid">
          {workspaces.map((workspace) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} />
          ))}
        </div>
      )}
    </section>
  );
}

function StatePanel({
  icon,
  title,
  text,
  action
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-panel">
      <div className="state-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}

function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  const spotCount = workspace.layout.spots.length;

  return (
    <article className="workspace-card">
      <img src={workspace.imageUrl} alt={workspace.title} />
      <div className="card-body">
        <div className="card-head">
          <span className="badge">{typeLabels[workspace.type]}</span>
          <strong>{money(workspace.pricePerHour)} ₽/час</strong>
        </div>
        <h2>{workspace.title}</h2>
        <p>{workspace.description}</p>
        <div className="meta-row">
          <span><BriefcaseBusiness size={16} /> до {workspace.capacity} чел.</span>
          <span><Armchair size={16} /> {spotCount || 1} мест на схеме</span>
          <span><DoorOpen size={16} /> {workspace.location}</span>
        </div>
        <Link className="button stretch" to={`/workspaces/${workspace.id}`}>
          <CalendarCheck size={18} />
          Выбрать место
        </Link>
      </div>
    </article>
  );
}

function WorkspaceDetails({ user }: { user: User | null }) {
  const { id } = useParams();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ date: "", start: "09:00", end: "10:00" });
  const [selectedSeat, setSelectedSeat] = useState("");

  const loadWorkspace = () => {
    setLoading(true);
    setLoadError("");
    api<{ workspace: Workspace }>(`/workspaces/${id}`)
      .then((data) => {
        setWorkspace(data.workspace);
        setSelectedSeat((current) => current || data.workspace.layout.spots[0]?.label || "");
      })
      .catch((requestError) => {
        setWorkspace(null);
        setLoadError(requestError instanceof Error ? requestError.message : "Не удалось загрузить помещение");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWorkspace();
  }, [id]);

  const busySeats = useMemo(() => {
    if (!workspace || !form.date) return new Set<string>();

    const start = new Date(`${form.date}T${form.start}:00`);
    const end = new Date(`${form.date}T${form.end}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return new Set<string>();

    return new Set(
      (workspace.bookings ?? [])
        .filter((booking) => booking.status !== "CANCELLED")
        .filter((booking) => rangesOverlap(start, end, new Date(booking.startTime), new Date(booking.endTime)))
        .map((booking) => booking.seatLabel ?? "__whole_space__")
    );
  }, [workspace, form]);

  const isSpotBusy = (spot: LayoutSpot) => busySeats.has(spot.label) || busySeats.has("__whole_space__");
  const upcomingBookings = useMemo(() => {
    if (!workspace) return [];

    const currentTime = Date.now();
    return (workspace.bookings ?? [])
      .filter((booking) => booking.status !== "CANCELLED")
      .filter((booking) => new Date(booking.endTime).getTime() >= currentTime)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 5);
  }, [workspace]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");

    if (!user) {
      setMessage("Для бронирования нужно войти в аккаунт");
      return;
    }

    if (!form.date) {
      setMessage("Выберите дату бронирования");
      return;
    }

    if (!selectedSeat) {
      setMessage("Выберите место на схеме");
      return;
    }

    if (workspace?.layout.spots.some((spot) => spot.label === selectedSeat && isSpotBusy(spot))) {
      setMessage("Это место уже занято на выбранное время");
      return;
    }

    try {
      await api("/bookings", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: Number(id),
          seatLabel: selectedSeat,
          startTime: `${form.date}T${form.start}:00`,
          endTime: `${form.date}T${form.end}:00`
        })
      });
      setMessage(`Бронирование создано. Вы выбрали место ${selectedSeat}.`);
      loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать бронирование");
    }
  };

  if (loading) {
    return <section className="page"><p className="muted">Загрузка...</p></section>;
  }

  if (loadError || !workspace) {
    return (
      <section className="page">
        <StatePanel
          icon={<AlertCircle size={24} />}
          title="Помещение не найдено"
          text={loadError || "Похоже, это пространство было удалено или временно недоступно."}
          action={<button className="button compact" onClick={loadWorkspace} type="button"><RefreshCw size={17} />Повторить</button>}
        />
      </section>
    );
  }

  return (
    <section className="details">
      <div className="details-media">
        <img className="details-image" src={workspace.imageUrl} alt={workspace.title} />
      </div>
      <div className="details-content">
        <span className="badge">{typeLabels[workspace.type]}</span>
        <h1>{workspace.title}</h1>
        <p>{workspace.description}</p>
        <div className="facts">
          <span>{workspace.location}</span>
          <span>До {workspace.capacity} человек</span>
          <span>{money(workspace.pricePerHour)} ₽/час</span>
        </div>
        <div className="amenities">
          {workspace.amenities.map((amenity) => <span key={amenity}>{amenity}</span>)}
        </div>

        <form className="booking-form" onSubmit={submit}>
          <h2>Выбрать дату, время и место</h2>
          <label>
            Дата
            <input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </label>
          <div className="form-grid">
            <label>
              Начало
              <input required type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} />
            </label>
            <label>
              Окончание
              <input required type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} />
            </label>
          </div>

          <FloorPlan
            workspace={workspace}
            selectedSeat={selectedSeat}
            onSelect={setSelectedSeat}
            isSpotBusy={isSpotBusy}
          />

          <BusySlots bookings={upcomingBookings} />

          <div className="selected-seat">
            <Armchair size={18} />
            <span>Выбрано: {selectedSeat || "место не выбрано"}</span>
          </div>

          <button className="button" type="submit">
            <CalendarCheck size={18} />
            Создать бронь
          </button>
          {message && <p className="form-message">{message}</p>}
        </form>
      </div>
    </section>
  );
}

function FloorPlan({
  workspace,
  selectedSeat,
  onSelect,
  isSpotBusy
}: {
  workspace: Workspace;
  selectedSeat: string;
  onSelect: (seat: string) => void;
  isSpotBusy: (spot: LayoutSpot) => boolean;
}) {
  return (
    <div className="floor-plan-block">
      <div className="floor-plan-head">
        <h3>Схема пространства</h3>
        <div className="legend">
          <span><i className="legend-dot available" /> Свободно</span>
          <span><i className="legend-dot selected" /> Выбрано</span>
          <span><i className="legend-dot busy" /> Занято</span>
        </div>
      </div>
      <div className="floor-plan" style={{ aspectRatio: `${workspace.layout.width} / ${workspace.layout.height}` }}>
        {workspace.layout.zones.map((zone) => (
          <div
            className="plan-zone"
            key={zone.label}
            style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` }}
          >
            {zone.label}
          </div>
        ))}
        {workspace.layout.spots.map((spot) => {
          const busy = isSpotBusy(spot);
          const selected = selectedSeat === spot.label;
          return (
            <button
              className={`plan-spot ${spot.type ?? "desk"} ${busy ? "busy" : ""} ${selected ? "selected" : ""}`}
              disabled={busy}
              key={spot.id}
              type="button"
              title={busy ? `${spot.label}: занято` : `${spot.label}: свободно`}
              style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`, height: `${spot.h}%` }}
              onClick={() => onSelect(spot.label)}
            >
              {spot.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BusySlots({ bookings }: { bookings: Booking[] }) {
  return (
    <div className="busy-slots">
      <div className="busy-slots-title">
        <Clock size={18} />
        <h3>Ближайшие занятые слоты</h3>
      </div>
      {bookings.length === 0 ? (
        <p>Занятых слотов пока нет.</p>
      ) : (
        <ul>
          {bookings.map((booking) => (
            <li key={booking.id}>
              <span>{booking.seatLabel ?? "Целиком"}</span>
              <strong>{formatShortDateTime(booking.startTime)} - {formatShortDateTime(booking.endTime)}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AuthPage({ mode, onAuth }: { mode: "login" | "register"; onAuth: (user: User, token: string) => void }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ user: User; token: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(mode === "login" ? { email: form.email, password: form.password } : form)
      });
      onAuth(result.user, result.token);
      navigate("/workspaces");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Ошибка авторизации");
    }
  };

  return (
    <section className="auth">
      <form className="auth-form" onSubmit={submit}>
        <p className="eyebrow">{mode === "login" ? "Вход" : "Регистрация"}</p>
        <h1>{mode === "login" ? "Войти в аккаунт" : "Создать аккаунт"}</h1>
        {mode === "register" && (
          <label>
            Имя
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
        )}
        <label>
          Почта
          <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </label>
        <label>
          Пароль
          <input required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </label>
        <button className="button" type="submit">
          <LogIn size={18} />
          {mode === "login" ? "Войти" : "Зарегистрироваться"}
        </button>
        {error && <p className="form-message error">{error}</p>}
        <Link to={mode === "login" ? "/register" : "/login"}>
          {mode === "login" ? "Нужен аккаунт?" : "Уже есть аккаунт?"}
        </Link>
      </form>
    </section>
  );
}

function Profile() {
  const [bookings, setBookings] = useState<Booking[]>([]);

  const load = () => api<{ bookings: Booking[] }>("/bookings/my").then((data) => setBookings(data.bookings));

  useEffect(() => {
    load();
  }, []);

  const cancel = async (id: number) => {
    await api(`/bookings/${id}/cancel`, { method: "PATCH" });
    load();
  };

  return (
    <section className="page">
      <div className="section-title">
        <div>
          <p className="eyebrow">Личный кабинет</p>
          <h1>Мои бронирования</h1>
        </div>
      </div>
      <BookingTable bookings={bookings} onCancel={cancel} />
    </section>
  );
}

function BookingTable({ bookings, onCancel, onStatus }: {
  bookings: Booking[];
  onCancel?: (id: number) => void;
  onStatus?: (id: number, status: BookingStatus) => void;
}) {
  if (bookings.length === 0) {
    return <p className="muted">Бронирований пока нет.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Помещение</th>
            <th>Место</th>
            <th>Пользователь</th>
            <th>Время</th>
            <th>Статус</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.id}>
              <td>{booking.workspace.title}</td>
              <td>{booking.seatLabel ?? "Целиком"}</td>
              <td>{booking.user?.name ?? "Вы"}</td>
              <td>{formatDateTime(booking.startTime)} - {formatDateTime(booking.endTime)}</td>
              <td><span className={`status ${booking.status.toLowerCase()}`}>{statusLabels[booking.status]}</span></td>
              <td className="table-actions">
                {onStatus && booking.status !== "CONFIRMED" && (
                  <button className="icon-button" title="Подтвердить" onClick={() => onStatus(booking.id, "CONFIRMED")}>
                    <Check size={17} />
                  </button>
                )}
                {booking.status !== "CANCELLED" && (
                  <button
                    className="icon-button danger"
                    title="Отменить"
                    onClick={() => onStatus ? onStatus(booking.id, "CANCELLED") : onCancel?.(booking.id)}
                  >
                    <X size={17} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminPanel() {
  const [tab, setTab] = useState<"workspaces" | "bookings">("workspaces");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [formMessage, setFormMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "DESK" as WorkspaceType,
    capacity: 1,
    pricePerHour: 0,
    location: "",
    imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
    amenities: ""
  });

  const load = () => {
    api<{ workspaces: Workspace[] }>("/admin/workspaces").then((data) => setWorkspaces(data.workspaces));
    api<{ bookings: Booking[] }>("/admin/bookings").then((data) => setBookings(data.bookings));
  };

  useEffect(() => {
    load();
  }, []);

  const createWorkspace = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormMessage("");

    try {
      await api("/admin/workspaces", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          amenities: form.amenities.split(",").map((item) => item.trim()).filter(Boolean)
        })
      });
      setForm({ ...form, title: "", description: "", location: "", amenities: "" });
      setFormMessage("Помещение добавлено. Для него автоматически создана схема мест.");
      load();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось добавить помещение");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id: number) => {
    await api(`/admin/workspaces/${id}`, { method: "DELETE" });
    load();
  };

  const changeStatus = async (id: number, status: BookingStatus) => {
    await api(`/admin/bookings/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    load();
  };

  return (
    <section className="page">
      <div className="section-title">
        <div>
          <p className="eyebrow">Администрирование</p>
          <h1>Управление платформой</h1>
        </div>
        <div className="tabs">
          <button className={tab === "workspaces" ? "active" : ""} onClick={() => setTab("workspaces")}>
            Помещения
          </button>
          <button className={tab === "bookings" ? "active" : ""} onClick={() => setTab("bookings")}>
            Брони
          </button>
        </div>
      </div>

      <div className="admin-summary">
        <div>
          <span>Активные пространства</span>
          <strong>{workspaces.filter((workspace) => workspace.isActive).length}</strong>
        </div>
        <div>
          <span>Всего мест на схемах</span>
          <strong>{workspaces.reduce((sum, workspace) => sum + (workspace.layout.spots.length || 1), 0)}</strong>
        </div>
        <div>
          <span>Бронирования</span>
          <strong>{bookings.length}</strong>
        </div>
      </div>

      {tab === "workspaces" ? (
        <div className="admin-grid">
          <form className="admin-form" onSubmit={createWorkspace}>
            <h2>Новое помещение</h2>
            <label>Название<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label>Описание<textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label>Тип<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as WorkspaceType })}>
              <option value="DESK">Рабочее место</option>
              <option value="MEETING_ROOM">Переговорная</option>
              <option value="CONFERENCE_ROOM">Конференц-зал</option>
            </select></label>
            <div className="form-grid">
              <label>Вместимость<input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></label>
              <label>Цена/час<input type="number" min="0" value={form.pricePerHour} onChange={(e) => setForm({ ...form, pricePerHour: Number(e.target.value) })} /></label>
            </div>
            <label>Локация<input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
            <label>URL изображения<input required value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /></label>
            <label>Удобства через запятую<input value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} /></label>
            <div className="admin-preview">
              <img src={form.imageUrl} alt="" />
              <div>
                <strong>{form.title || "Название помещения"}</strong>
                <span>{typeLabels[form.type]} · {form.capacity} мест</span>
              </div>
            </div>
            <button className="button" disabled={saving} type="submit"><Plus size={18} />{saving ? "Сохранение..." : "Добавить"}</button>
            {formMessage && <p className={`form-message ${formMessage.includes("Не удалось") ? "error" : ""}`}>{formMessage}</p>}
          </form>
          <div className="admin-list">
            {workspaces.map((workspace) => (
              <article className="admin-item" key={workspace.id}>
                <div>
                  <h3>{workspace.title}</h3>
                  <p>{typeLabels[workspace.type]} · {workspace.capacity} чел. · {workspace.layout.spots.length || 1} мест · {money(workspace.pricePerHour)} ₽/час</p>
                </div>
                <button className="icon-button danger" title="Деактивировать" onClick={() => deactivate(workspace.id)}>
                  <X size={17} />
                </button>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <BookingTable bookings={bookings} onStatus={changeStatus} />
      )}
    </section>
  );
}

export default App;
