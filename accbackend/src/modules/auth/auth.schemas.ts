import { z } from "zod";

export const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1).max(200),
});
