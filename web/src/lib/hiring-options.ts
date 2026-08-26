export const HIRING_CURRENCIES = [
  { value: "USD", label: "USD: US dollar" },
  { value: "EUR", label: "EUR: Euro" },
  { value: "GBP", label: "GBP: British pound" },
  { value: "CAD", label: "CAD: Canadian dollar" },
  { value: "AUD", label: "AUD: Australian dollar" },
  { value: "INR", label: "INR: Indian rupee" },
  { value: "SGD", label: "SGD: Singapore dollar" },
  { value: "CHF", label: "CHF: Swiss franc" },
] as const;

export const HIRING_ROLE_FAMILIES = [
  "Engineering",
  "Product",
  "Design",
  "Data & AI",
  "Sales",
  "Marketing",
  "Operations",
  "Finance",
  "Legal",
  "People",
] as const;

export const HIRING_LEVELS = [
  "Entry",
  "Mid-level",
  "Senior",
  "Staff / Principal",
  "Manager",
  "Director",
  "VP",
  "Executive",
] as const;

export const HIRING_WORK_MODES = ["Remote", "Hybrid", "Onsite"] as const;

export const HIRING_EMPLOYMENT_TYPES = [
  "Full-time",
  "Contract",
  "Part-time",
  "Internship",
] as const;

export const HIRING_RADIUS_OPTIONS = [
  { value: "0", label: "In the selected city" },
  { value: "25", label: "Within 25 miles" },
  { value: "50", label: "Within 50 miles" },
  { value: "100", label: "Within 100 miles" },
  { value: "250", label: "Within 250 miles" },
] as const;

export function formatHiringMoney(
  amount: unknown,
  currency: unknown = "USD",
) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  const code =
    typeof currency === "string" && /^[A-Z]{3}$/.test(currency)
      ? currency
      : "USD";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString()}`;
  }
}
