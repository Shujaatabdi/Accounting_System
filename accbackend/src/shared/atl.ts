import { AppError } from "./errors";

export type AtlStatus = "active" | "inactive";

export type AtlInput = {
  status: AtlStatus | null;
  checkedAt?: string | null;
  reference?: string | null;
};

export type AtlSnapshotView = {
  recorded: boolean;
  status: AtlStatus | null;
  checkedAt: string | null;
  reference: string | null;
};

// Both countries must be Pakistan before a person may record ATL.
// This does not choose a tax rate, withholding, or a filing rule.
export function atlRecordingApplies(companyCountry: string | null | undefined, partyTaxCountry: string | null | undefined) {
  return companyCountry?.trim().toUpperCase() === "PK" && partyTaxCountry?.trim().toUpperCase() === "PK";
}

export function parseAtlInput(input: AtlInput): { status: AtlStatus | null; checkedAt: string | null; reference: string | null } {
  if (input.status == null) return { status: null, checkedAt: null, reference: null };
  const checkedAt = input.checkedAt?.trim() ?? "";
  const reference = input.reference?.trim() ?? "";
  if (!checkedAt || Number.isNaN(Date.parse(checkedAt))) {
    throw new AppError(400, "VALIDATION", "Enter the date and time when the ATL status was checked.");
  }
  if (!reference || reference.length > 160) {
    throw new AppError(400, "VALIDATION", "Enter an ATL reference of up to 160 characters.");
  }
  return { status: input.status, checkedAt: new Date(checkedAt).toISOString(), reference };
}

export function atlSnapshotView(captured: boolean | null | undefined, status: string | null | undefined, checkedAt: string | null | undefined, reference: string | null | undefined): AtlSnapshotView | null {
  if (!captured) return null;
  if (status !== "active" && status !== "inactive") {
    return { recorded: false, status: null, checkedAt: null, reference: null };
  }
  return { recorded: true, status, checkedAt: checkedAt ?? null, reference: reference ?? null };
}
