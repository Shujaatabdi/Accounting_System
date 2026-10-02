"use client";

import { useParams } from "next/navigation";
import InvoiceDetailScreen from "@/features/invoices/components/InvoiceDetailScreen";

export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  return <InvoiceDetailScreen id={params.id} />;
}
