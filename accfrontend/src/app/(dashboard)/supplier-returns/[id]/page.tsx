"use client";

import { useParams } from "next/navigation";
import ReturnDetailScreen from "@/features/supplier-returns/components/ReturnDetailScreen";

export default function ReturnPage() {
  const params = useParams<{ id: string }>();
  return <ReturnDetailScreen id={params.id} />;
}
