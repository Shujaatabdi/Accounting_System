"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const user = await auth.signIn(email, password);
      router.push(user.mustChangePassword ? "/account/password" : "/dashboard");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Sign-in failed.");
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={onSubmit}>
        <h1 className="page-title">Sign in</h1>
        <p className="lede">This installation keeps the books for one company.</p>
        {error ? <div className="banner error">{error}</div> : null}
        <div className="field">
          <span>Email</span>
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <span>Password</span>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        </div>
        <button className="btn" style={{ marginTop: 16 }} type="submit">Sign in</button>
      </form>
    </div>
  );
}
