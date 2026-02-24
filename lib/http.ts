export type ApiErrorPayload = {
  error: string;
  code?: string;
  details?: unknown;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (response.ok) {
    if (response.status === 204) return null as T;
    return (await response.json()) as T;
  }

  let payload: ApiErrorPayload | null = null;
  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    payload = null;
  }

  throw new ApiError(
    payload?.error || `Request failed (${response.status})`,
    response.status,
    payload?.code,
    payload?.details
  );
}
