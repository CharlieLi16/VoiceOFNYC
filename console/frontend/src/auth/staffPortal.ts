/** 本次浏览器会话内有效（关标签后通常需重登） */
const SESSION_KEY = "voiceofnyc-staff-portal";
/** 勾选「记住我」后写入，关闭浏览器后再开仍保持登录 */
const PERSIST_KEY = "voiceofnyc-staff-portal-persist";

export function staffPortalGateEnabled(): boolean {
  const p = import.meta.env.VITE_STAFF_PORTAL_PASSWORD;
  return typeof p === "string" && p.trim().length > 0;
}

export function isStaffPortalAuthed(): boolean {
  if (!staffPortalGateEnabled()) return true;
  try {
    return (
      sessionStorage.getItem(SESSION_KEY) === "1" || localStorage.getItem(PERSIST_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function setStaffPortalAuthed(ok: boolean, opts?: { persist?: boolean }): void {
  try {
    if (ok) {
      if (opts?.persist) {
        localStorage.setItem(PERSIST_KEY, "1");
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        sessionStorage.setItem(SESSION_KEY, "1");
        localStorage.removeItem(PERSIST_KEY);
      }
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(PERSIST_KEY);
    }
  } catch {
    /* private mode / disabled storage */
  }
}

export function checkStaffPortalPassword(input: string): boolean {
  const want = String(import.meta.env.VITE_STAFF_PORTAL_PASSWORD ?? "").trim();
  return want.length > 0 && input === want;
}
