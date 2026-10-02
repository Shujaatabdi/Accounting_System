"use client";

import { useParams } from "next/navigation";
import { JournalForm } from "@/features/journals";

export default function EditJournalPage() {
  const params = useParams<{ id: string }>();
  return <JournalForm journalId={params.id} />;
}
