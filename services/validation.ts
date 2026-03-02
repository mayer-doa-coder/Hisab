/**
 * validation.ts
 *
 * Shared pure-function validators for customer form fields.
 *
 * These are intentionally duplicated from the service-layer
 * validateCustomerFields() so that the UI can give real-time
 * per-field feedback on blur without importing the full service.
 *
 * Rules here MUST stay in sync with services/customerService.ts.
 */

// ── Customer field validators ─────────────────────────────────────────────────

/** Bangladeshi phone number regex — also used in customerService.ts */
export const PHONE_RE = /^(\+880|880|0)?[0-9]{10,11}$/;

/**
 * Validate a customer name.
 * @returns An error message string, or `""` when valid.
 */
export function validateName(v: string): string {
  if (!v.trim()) return "Customer name is required";
  if (v.trim().length > 100) return "Name must be 100 characters or fewer";
  return "";
}

/**
 * Validate an optional Bangladeshi phone number.
 * Empty string is valid (field is optional).
 * @returns An error message string, or `""` when valid.
 */
export function validatePhone(v: string): string {
  if (!v.trim()) return "";
  if (!PHONE_RE.test(v.trim()))
    return "Enter a valid Bangladeshi phone number (e.g. 01711000001)";
  return "";
}

/**
 * Validate an optional nickname.
 * @returns An error message string, or `""` when valid.
 */
export function validateNickname(v: string): string {
  if (v.trim().length > 50) return "Nickname must be 50 characters or fewer";
  return "";
}

// ── Transaction field validators ──────────────────────────────────────────────

/**
 * Validate a transaction amount string.
 * @param raw   The raw string from the text input.
 * @param max   Optional upper bound (e.g. outstanding balance for payments).
 * @returns An error message string, or `""` when valid.
 */
export function validateAmount(raw: string, max?: number): string {
  const val = parseFloat(raw);
  if (!raw.trim()) return "পরিমাণ লিখুন";
  if (isNaN(val) || val <= 0) return "বৈধ পরিমাণ লিখুন (০-এর বেশি)";
  if (val > 1_000_000) return "সর্বোচ্চ ৳১০,০০,০০০";
  if (max !== undefined && val > max)
    return `সর্বোচ্চ ৳${max.toFixed(2)} পরিশোধ করা যাবে`;
  return "";
}

/**
 * Validate an optional transaction note.
 * @returns An error message string, or `""` when valid.
 */
export function validateNote(raw: string): string {
  if (raw.trim().length > 255) return "নোট সর্বোচ্চ ২৫৫ অক্ষর";
  return "";
}
