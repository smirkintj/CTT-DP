import { NextResponse } from 'next/server';

type ApiErrorBody = {
  error: string;
  code?: string;
  detail?: string;
};

export function apiError(status: number, error: string, code?: string, detail?: string) {
  const body: ApiErrorBody = { error };
  if (code) body.code = code;
  if (detail && process.env.NODE_ENV !== 'production') {
    body.detail = detail;
  }
  return NextResponse.json(body, { status });
}

export const badRequest = (error: string, code?: string, detail?: string) =>
  apiError(400, error, code, detail);
export const unauthorized = (error = 'Unauthorized', code?: string, detail?: string) =>
  apiError(401, error, code, detail);
export const forbidden = (error = 'Forbidden', code?: string, detail?: string) =>
  apiError(403, error, code, detail);
export const notFound = (error = 'Not found', code?: string, detail?: string) =>
  apiError(404, error, code, detail);
export const conflict = (error: string, code?: string, detail?: string) =>
  apiError(409, error, code, detail);
export const internalError = (error = 'Internal server error', code?: string, detail?: string) =>
  apiError(500, error, code, detail);
