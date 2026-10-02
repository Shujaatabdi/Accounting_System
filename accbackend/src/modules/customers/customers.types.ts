import type { z } from "zod";
import type { customerBody, openingDetailBody } from "./customers.schemas";

export type CustomerInput = z.infer<typeof customerBody>;
export type OpeningDetailInput = z.infer<typeof openingDetailBody>;
