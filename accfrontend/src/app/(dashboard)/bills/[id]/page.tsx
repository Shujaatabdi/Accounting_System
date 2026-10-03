"use client";

import { useParams } from "next/navigation";
import BillDetailScreen from "@/features/bills/components/BillDetailScreen";

export default function BillPage() {
  const params = useParams<{ id: string }>();
  return <BillDetailScreen id={params.id} />;
}
