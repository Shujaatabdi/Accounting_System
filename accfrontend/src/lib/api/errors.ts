export function errorLines(caught: unknown, fallback: string) {
  if (caught instanceof ApiError) {
    const details = caught.details;
    if (details && typeof details === "object") {
      const fields = details as { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] };
      const lines = [
        ...(fields.formErrors ?? []),
        ...Object.entries(fields.fieldErrors ?? {}).flatMap(([field, messages]) =>
          (messages ?? []).map((item) => `${field}: ${item}`),
        ),
      ];
      if (lines.length > 0) return lines;
    }
    return [caught.message];
  }
  return [caught instanceof Error ? caught.message : fallback];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
