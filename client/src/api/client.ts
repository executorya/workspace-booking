const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export type ApiError = {
  message: string;
  issues?: {
    fieldErrors?: Record<string, string[]>;
    formErrors?: string[];
  };
};

const fieldLabels: Record<string, string> = {
  title: "Название",
  description: "Описание",
  type: "Тип",
  capacity: "Вместимость",
  pricePerHour: "Цена/час",
  location: "Локация",
  imageUrl: "URL изображения",
  amenities: "Удобства",
  email: "Почта",
  password: "Пароль",
  name: "Имя"
};

function formatApiError(data: ApiError) {
  const fieldErrors = data.issues?.fieldErrors ?? {};
  const messages = Object.entries(fieldErrors)
    .flatMap(([field, errors]) => errors.map((message) => `${fieldLabels[field] ?? field}: ${message}`));

  if (messages.length > 0) {
    return messages.join("; ");
  }

  const formErrors = data.issues?.formErrors ?? [];
  if (formErrors.length > 0) {
    return formErrors.join("; ");
  }

  return data.message ?? "Ошибка запроса";
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(formatApiError(data as ApiError));
  }

  return data as T;
}
