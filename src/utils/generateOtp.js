import crypto from "crypto";
import bcrypt from "bcryptjs";

/** Generates a random 4-digit numeric OTP (matches the MPL frontend's 4-digit UX). */
export function generateOtp() {
  return String(crypto.randomInt(1000, 10000));
}

export async function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

export async function compareOtp(otp, hash) {
  return bcrypt.compare(otp, hash);
}
