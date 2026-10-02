import type { Request, Response } from "express";
import { changePassword, login, logout, publicUser } from "../modules/auth/auth.service";
import { changePasswordBody, loginBody } from "../modules/auth/auth.schemas";
import { actorFrom } from "../middleware/authenticate";
import { clientIp, parseBody, wrap } from "../shared/http";

export const loginController = wrap(async (req, res) => {
  const body = parseBody(loginBody, req.body);
  res.json(await login(body.email, body.password, clientIp(req), req.requestId ?? null));
});

export const meController = wrap(async (req, res) => {
  res.json({ user: publicUser(actorFrom(req).actor) });
});

export const changePasswordController = wrap(async (req, res) => {
  const body = parseBody(changePasswordBody, req.body);
  const meta = actorFrom(req);
  res.json(await changePassword(meta.actor, body.currentPassword, body.newPassword, meta.ipAddress, meta.requestId));
});

export const logoutController = wrap(async (req: Request, res: Response) => {
  const meta = actorFrom(req);
  await logout(meta.actor, meta.ipAddress, meta.requestId);
  res.status(204).end();
});
