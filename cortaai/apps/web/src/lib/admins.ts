// Allowlist de administradores. Sem backend em runtime (export estático), o
// papel de admin é derivado no cliente a partir do e-mail autenticado. Emails
// devem ser cadastrados em minúsculas; a checagem é case-insensitive.

export const ADMIN_EMAILS = ["frazaogenis@gmail.com"];

/** true quando o e-mail informado está na allowlist de administradores. */
export function isAdminEmail(email?: string): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}
