import { z } from "zod";

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type Page = { page: number; pageSize: number; offset: number };

export function toPage(input: { page?: number; pageSize?: number }): Page {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 25;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageResult<T>(rows: T[], total: number, page: Page) {
  return { data: rows, page: page.page, pageSize: page.pageSize, total };
}
