export {
  generatePin,
  generateStudentCode,
  isValidPin,
  isWeakPin,
  normalizeStudentCode,
  PIN_LENGTH,
  STUDENT_CODE_LENGTH
} from "./credentials";
export { isLocked, lockAfterFailure, LOCK_MINUTES, MAX_FAILED_LOGINS, minutesUntil } from "./lockout";
export {
  decodePortalToken,
  encodePortalToken,
  PORTAL_COOKIE,
  PORTAL_MAX_AGE_SECONDS,
  type PortalKind,
  type PortalSession
} from "./portal-token";
export {
  authenticateStudent,
  authenticateTeacher,
  resolveStudentSession,
  resolveTeacherSession,
  type AuthResult,
  type CurrentStudent,
  type CurrentTeacher
} from "./authenticate";
export {
  endPortalSession,
  getCurrentStudent,
  getCurrentTeacher,
  requireStudent,
  requireTeacher,
  startPortalSession
} from "./session";
