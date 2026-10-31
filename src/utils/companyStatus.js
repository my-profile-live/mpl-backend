/** OTP-verified companies are verified. There is no separate document review. */
export function promoteVerifiedCompany(user) {
  if (!user || user.status !== "Pending Verification") return false;
  if (!user.isEmailVerified || !user.isMobileVerified) return false;
  user.status = "Verified";
  return true;
}
