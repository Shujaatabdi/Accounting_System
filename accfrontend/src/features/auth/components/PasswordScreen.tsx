"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setToken } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";

export default function PasswordPage() {
  const auth = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ token: string }>("/api/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setToken(result.token);
      await auth.refresh();
      router.push("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the password.");
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1 className="page-title">Change password</h1>
      <p className="lede">Replace the installation password before working in the ledger. Use at least 10 characters with a letter and a number.</p>
      {error ? <div className="banner error">{error}</div> : null}
      <div className="grid">
        <label className="field"><span>Current password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
        <label className="field"><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
      </div>
      <button className="btn" style={{ marginTop: 12 }} type="submit">Save password</button>
    </form>
  );
}
