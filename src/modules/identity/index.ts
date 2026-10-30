export {
  formatStudentCode,
  generatePin,
  isValidPin,
  isWeakPin,
  nextStudentCodeNumber,
  PIN_LENGTH,
  studentCodeBase,
  studentCodeKey
} from "./credentials";
export { isLocked, lockAfterFailure, LOCK_MINUTES, MAX_FAILED_LOGINS, minutesUntil, STUDENT_MAX_FAILED_LOGINS } from "./lockout";
export {
  decodePortalToken,
  encodePortalToken,
  PORTAL_COOKIE,
  PORTAL_MAX_AGE_SECONDS,
  type PortalKind,
  type PortalSession
} from "./portal-token";
export { PORTAL_HOME, PORTAL_LOGIN, portalForPath } from "./portal-paths";
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
export {
  changeTeacherPassword,
  createTeacherAccount,
  getStudentAccounts,
  IdentityError,
  isVocabEnabled,
  issueStudentAccounts,
  listTeacherAccounts,
  resetStudentPin,
  resetTeacherPassword,
  setTeacherDisabled,
  setTeacherVocabEnabled,
  teacherUsernameTaken,
  unlockStudent,
  unlockTeacher,
  type IssuedCredential
} from "./manage";
