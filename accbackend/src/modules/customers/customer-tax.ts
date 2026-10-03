import { AppError } from "../../shared/errors";

export type PartyType = "individual" | "company" | "aop";

export type ParsedRegistration = {
  canonical: string;
  ntnCheckDigit: string | null;
};

// Individual CNIC is 13 digits. Company and AOP NTN is 7 digits. The printed
// form 1234567-8 keeps the last digit separately. That digit is not verified.
export function parseCnicNtn(partyType: PartyType, value: string): ParsedRegistration {
  const trimmed = value.trim();
  if (partyType === "individual") {
    const digits = trimmed.replace(/[\s-]/g, "");
    if (!/^\d{13}$/.test(digits)) {
      throw new AppError(400, "VALIDATION", "An individual CNIC must be 13 digits. Spaces and hyphens are ignored.");
    }
    return { canonical: digits, ntnCheckDigit: null };
  }
  const compact = trimmed.replace(/\s/g, "");
  const seven = /^(\d{7})$/.exec(compact);
  if (seven) return { canonical: seven[1], ntnCheckDigit: null };
  const printed = /^(\d{7})-(\d)$/.exec(compact);
  if (printed) return { canonical: printed[1], ntnCheckDigit: printed[2] };
  throw new AppError(
    400,
    "VALIDATION",
    "A company or AOP NTN must be 7 digits, or 7 digits, a hyphen, and a check digit such as 1234567-8. The check digit is stored for display and is not verified.",
  );
}

export function displayCnicNtn(partyType: string | null, canonical: string | null, checkDigit: string | null): string | null {
  if (!canonical) return null;
  if ((partyType === "company" || partyType === "aop") && checkDigit) return `${canonical}-${checkDigit}`;
  return canonical;
}
