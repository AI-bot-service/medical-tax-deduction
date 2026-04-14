"use client";

import { LimitsPanel } from "@/components/ui/LimitsPanel";
import { ProcessingPipeline } from "@/components/ui/ProcessingPipeline";
import { DocumentsPanel } from "@/components/ui/DocumentsPanel";

function DashboardContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <LimitsPanel />
      <ProcessingPipeline />
      <DocumentsPanel />
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
