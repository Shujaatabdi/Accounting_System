"use client";

import { useParams } from "next/navigation";
import ReceiptDetailScreen from "@/features/receipts/components/ReceiptDetailScreen";

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  return <ReceiptDetailScreen id={params.id} />;
}
