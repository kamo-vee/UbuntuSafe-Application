export type AdminRegField = "fullName" | "surname" | "email" | "password" | "confirm";
export type AdminRegValues = Record<AdminRegField, string>;
export const EMPTY_ADMIN_REG: AdminRegValues = { fullName: "", surname: "", email: "", password: "", confirm: "" };
export const ADMIN_REG_FIELDS: AdminRegField[] = ["fullName", "surname", "email", "password", "confirm"];

const NAME_RE = /^[\p{L}\p{M} '.-]+$/u;

function name(v: string, label: string) {
  const t = v.trim();
  if (!t) return `${label} is required.`;
  if (t.length < 2 || t.length > 80) return `${label} must be 2 to 80 characters.`;
  if (!NAME_RE.test(t)) return `${label} may only use letters, spaces, apostrophes, hyphens and periods.`;
  if ((t.match(/\p{L}/gu) ?? []).length < 2) return `${label} needs at least 2 letters.`;
  return "";
}

export function validateAdminRegField(f: AdminRegField, v: AdminRegValues): string {
  switch (f) {
    case "fullName": return name(v.fullName, "First name");
    case "surname": return name(v.surname, "Surname");
    case "email": {
      const t = v.email.trim();
      if (!t) return "Email is required.";
      if (t.length > 200) return "Email must be 200 characters or fewer.";
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? "" : "Enter a valid email address.";
    }
    case "password": {
      const p = v.password;
      if (!p) return "Password is required.";
      if (p !== p.trim()) return "Password cannot start or end with spaces.";
      if (p.length < 12 || p.length > 72) return "Password must be 12 to 72 characters.";
      if (!/[A-Z]/.test(p)) return "Add an uppercase letter.";
      if (!/[a-z]/.test(p)) return "Add a lowercase letter.";
      if (!/[0-9]/.test(p)) return "Add a number.";
      if (!/[^A-Za-z0-9\s]/.test(p)) return "Add a symbol.";
      return "";
    }
    case "confirm":
      return !v.confirm ? "Confirm the password." : v.confirm !== v.password ? "Passwords do not match." : "";
  }
}

export function validateAdminReg(v: AdminRegValues) {
  const out: Partial<Record<AdminRegField, string>> = {};
  for (const f of ADMIN_REG_FIELDS) { const m = validateAdminRegField(f, v); if (m) out[f] = m; }
  return out;
}
