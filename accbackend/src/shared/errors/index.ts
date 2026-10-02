export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(message = "Record not found."): AppError {
  return new AppError(404, "NOT_FOUND", message);
}

export function one<T>(rows: T[], message = "Record not found."): T {
  const row = rows[0];
  if (!row) throw notFound(message);
  return row;
}
