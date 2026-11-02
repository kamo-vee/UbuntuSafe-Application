export type RegistrationField = "fullName" | "surname" | "dateOfBirth" | "email" | "phone" | "password" | "confirmPassword";
export type AccountFields = Record<RegistrationField, string>;
export function validateAccountFields(values: AccountFields): Partial<Record<RegistrationField, string>> {
  const errors: Partial<Record<RegistrationField, string>> = {};
  for (const key of ["fullName", "surname"] as const) {
    const label = key === "fullName" ? "Name" : "Surname";
    const name = values[key].trim();
    if (name.length < 3 || (name.match(/\p{L}/gu) ?? []).length < 3) errors[key] = `Enter your ${label.toLowerCase()} using at least 3 letters.`;
    else if (name.length > 80) errors[key] = `${label} must be 80 characters or fewer.`;
    else if (!/^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u.test(name)) errors[key] = `${label} may contain letters, spaces, apostrophes, hyphens and periods only.`;
  }
  const date = new Date(`${values.dateOfBirth}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth) || Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== values.dateOfBirth || Number(values.dateOfBirth.slice(0, 4)) < 1900 ||
      values.dateOfBirth >= new Date().toISOString().slice(0, 10))
    errors.dateOfBirth = "Enter a real date of birth from 1900 onwards, before today, as YYYY-MM-DD.";
  if (values.email.trim().length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(values.email.trim()))
    errors.email = "Enter a valid email address, for example name@example.com.";
  if (values.phone.trim() && !/^\+[1-9]\d{7,14}$/.test(values.phone.trim()))
    errors.phone = "Include + and the country code, for example +27821234567.";
  if (values.password.length < 10) errors.password = "Password must contain at least 10 characters.";
  else if (values.password.length > 72) errors.password = "Password must be 72 characters or fewer.";
  else if (!/[a-z]/.test(values.password) || !/[A-Z]/.test(values.password) || !/\d/.test(values.password) || !/[^A-Za-z0-9\s]/.test(values.password))
    errors.password = "Include uppercase and lowercase letters, a number and a symbol.";
  else if (values.password.trim() !== values.password) errors.password = "Password must not start or end with a space.";
  if (!values.confirmPassword) errors.confirmPassword = "Re-enter your password.";
  else if (values.password !== values.confirmPassword) errors.confirmPassword = "The passwords do not match.";
  return errors;
}
