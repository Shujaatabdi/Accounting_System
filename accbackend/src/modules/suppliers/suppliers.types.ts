import type { z } from "zod";
import type { openingDetailBody, supplierBody } from "./suppliers.schemas";

export type SupplierInput = z.infer<typeof supplierBody>;
export type OpeningDetailInput = z.infer<typeof openingDetailBody>;
