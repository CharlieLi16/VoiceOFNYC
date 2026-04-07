/** sessionStorage 标记；仅用于挡住控制台 SPA，不能替代服务端鉴权 */
const STORAGE_KEY = "voiceofnyc-staff-portal";

export function staffPortalGateEnabled(): boolean {
  const p = import.meta.env.VITE_STAFF_PORTAL_PASSWORD;
  return typeof p === "string" && p.trim().length > 0;
}

export function isStaffPortalAuthed(): boolean {
  if (!staffPortalGateEnabled()) return true;
  return sessionStorage.getItem(STORAGE_KEY) === "1";
}

export function setStaffPortalAuthed(ok: boolean): void {
  if (ok) sessionStorage.setItem(STORAGE_KEY, "1");
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function checkStaffPortalPassword(input: string): boolean {
  const want = String(import.meta.env.VITE_STAFF_PORTAL_PASSWORD ?? "").trim();
  return want.length > 0 && input === want;
}
