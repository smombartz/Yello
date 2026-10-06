/**
 * The single admin account. Mirrors ADMIN_EMAIL in backend/src/middleware/adminAuth.ts,
 * which is what actually protects the admin API; this only decides what the UI shows.
 */
export const ADMIN_EMAIL = 's@mombartz.com';

export function isAdmin(user: { email?: string | null } | null | undefined): boolean {
  return user?.email === ADMIN_EMAIL;
}
