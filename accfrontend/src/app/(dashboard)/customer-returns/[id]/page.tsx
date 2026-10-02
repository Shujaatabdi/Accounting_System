"use client";

import { useParams } from "next/navigation";
import ReturnDetailScreen from "@/features/customer-returns/components/ReturnDetailScreen";

export default function CustomerReturnPage() {
  const params = useParams<{ id: string }>();
  return <ReturnDetailScreen id={params.id} />;
}
