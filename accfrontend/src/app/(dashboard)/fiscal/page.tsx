"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FiscalRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/periods");
  }, [router]);
  return <p className="content">Opening fiscal periods…</p>;
}
