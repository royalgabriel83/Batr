import type { ReportReason, ReportSubject } from "./constants.ts";

// Member-facing safety views (specs/milestone-6.md), for both apps.
// Members are named by display name only.

export interface BlockedMemberView {
  id: string;
  display_name: string;
  created_at: string;
}

export interface MyReportView {
  id: string;
  subject_type: ReportSubject;
  label: string;
  reason: ReportReason;
  status: "received" | "reviewed";
  created_at: string;
}
