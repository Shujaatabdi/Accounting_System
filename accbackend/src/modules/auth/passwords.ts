import bcrypt from "bcryptjs";
import { AppError } from "../../lib/errors";

export function assertPassword(password: string): void {
  if (password.length < 10 || password.length > 200) {
    throw new AppError(400, "VALIDATION", "Password must be 10 to 200 characters.");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AppError(400, "VALIDATION", "Password must include a letter and a number.");
  }
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
