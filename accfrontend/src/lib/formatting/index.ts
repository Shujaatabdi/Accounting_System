export function money(value: string | number | null | undefined, places = 2) {
  if (value === null || value === undefined || value === "") return "";
  const negative = String(value).trim().startsWith("-");
  const [wholeRaw, fractionRaw = ""] = String(value).trim().replace("-", "").split(".");
  const whole = wholeRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (places === 0) return `${negative ? "-" : ""}${whole}`;
  return `${negative ? "-" : ""}${whole}.${(fractionRaw + "0000").slice(0, places)}`;
}

export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
