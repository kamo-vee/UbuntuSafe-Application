import { z } from "zod";

export const accountName = (label: string) => z.string()
  .trim().min(2, `Enter your ${label.toLowerCase()} using at least 2 letters.`)
  .max(80, `${label} must be 80 characters or fewer.`)
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u, `${label} may contain letters, spaces, apostrophes, hyphens and periods only.`)
  .refine(value => (value.match(/\p{L}/gu) ?? []).length >= 2, `${label} must contain at least 2 letters.`);

export const accountEmail = z.string().trim()
  .min(1, "Enter your email address.")
  .max(200, "Email address must be 200 characters or fewer.")
  .email("Enter a valid email address, for example name@example.com.")
  .transform(value => value.toLowerCase());

export const accountPassword = (minimum = 10) => z.string()
  .min(minimum, `Password must contain at least ${minimum} characters.`)
  .max(72, "Password must be 72 characters or fewer.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/\d/, "Password must include a number.")
  .regex(/[^A-Za-z0-9\s]/, "Password must include a symbol, not just a space.")
  .refine(value => value.trim() === value, "Password must not start or end with a space.")
  .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password is too long when encoded. Use fewer characters.");

export const accountDateOfBirth = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    Number(value.slice(0, 4)) >= 1900 && value < new Date().toISOString().slice(0, 10);
}, "Enter a real date of birth from 1900 onwards, before today, as YYYY-MM-DD.");

export const registrationSchema = z.object({
  fullName: accountName("Name"), surname: accountName("Surname"),
  dateOfBirth: accountDateOfBirth, email: accountEmail,
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Enter a phone number with + and country code, for example +27821234567.").nullable().optional(),
  language: z.enum(["English", "Setswana", "Sepedi", "Xi\u0074songa", "isiXhosa", "isiZulu"]).optional(),
  password: accountPassword(),
});
export const administratorSchema = z.object({
  fullName: accountName("Name"), surname: accountName("Surname"),
  email: accountEmail, password: accountPassword(12),
});
