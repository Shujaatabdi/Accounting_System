import { Router } from "express";
import rateLimit from "express-rate-limit";
import { changePasswordController, loginController, logoutController, meController } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/authenticate";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMIT", message: "Too many sign-in attempts. Try again later." } },
});

export const authRouter = Router();
authRouter.post("/login", loginLimiter, loginController);
authRouter.get("/me", requireAuth, meController);
authRouter.post("/change-password", requireAuth, changePasswordController);
authRouter.post("/logout", requireAuth, logoutController);
