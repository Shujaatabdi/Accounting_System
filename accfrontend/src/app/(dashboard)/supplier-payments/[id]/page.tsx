"use client";

import { useParams } from "next/navigation";
import PaymentDetailScreen from "@/features/supplier-payments/components/PaymentDetailScreen";

export default function PaymentPage() {
  const params = useParams<{ id: string }>();
  return <PaymentDetailScreen id={params.id} />;
}
