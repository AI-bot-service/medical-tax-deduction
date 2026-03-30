/**
 * TypeScript interfaces matching backend Pydantic schemas (G-01).
 * Enums correspond to app/models/enums.py
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type OCRStatus = "PENDING" | "DONE" | "REVIEW" | "FAILED";

export type DocType =
  | "recipe_107"
  | "recipe_egisz"
  | "doc_025"
  | "doc_003"
  | "doc_043"
  | "doc_111"
  | "doc_025_1";

export type RiskLevel = "STANDARD" | "DISPUTED" | "HIGH";

export type BatchStatus = "processing" | "completed" | "partial";

export type BatchSource = "telegram_bot" | "web" | "mini_app";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface User {
  telegram_id: number;
  telegram_username: string | null;
}

export interface BotTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface MessageResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

export interface ReceiptItem {
  id: string;
  drug_name: string;
  drug_inn: string | null;
  quantity: number;
  unit_price: string; // Decimal serialised as string
  total_price: string;
  is_rx: boolean;
  prescription_id: string | null;
}

export interface ReceiptListItem {
  id: string;
  ocr_status: OCRStatus;
  purchase_date: string | null; // ISO date "YYYY-MM-DD"
  pharmacy_name: string | null;
  total_amount: string | null;
  ocr_confidence: number | null;
  needs_prescription: boolean;
  created_at: string; // ISO datetime
}

export interface MonthGroup {
  month: string; // "YYYY-MM"
  total_amount: string;
  receipts: ReceiptListItem[];
}

export interface ReceiptListResponse {
  months: MonthGroup[];
  total_count: number;
}

export interface ReceiptDetail extends ReceiptListItem {
  merge_strategy: string | null;
  image_url: string | null;
  items: ReceiptItem[];
}

export interface ReceiptUploadResponse {
  receipt_id: string;
  status: OCRStatus;
  message: string;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface MonthSummary {
  month: string; // "YYYY-MM"
  receipts_count: number;
  total_amount: string;
  deduction_amount: string;
  has_missing_prescriptions: boolean;
}

export interface Summary {
  year: number;
  months: MonthSummary[];
  total_amount: string;
  deduction_amount: string;
  limit_used_pct: number; // 0..100
}

// ---------------------------------------------------------------------------
// Prescription
// ---------------------------------------------------------------------------

export interface Prescription {
  id: string;
  doc_type: DocType;
  doctor_name: string;
  doctor_specialty: string | null;
  clinic_name: string | null;
  issue_date: string; // ISO date
  expires_at: string; // ISO date
  drug_name: string;
  drug_inn: string | null;
  dosage: string | null;
  s3_key: string | null;
  risk_level: RiskLevel;
  status: string;
  batch_id: string | null;
  created_at: string;
}

export interface PrescriptionListResponse {
  items: Prescription[];
  total: number;
}

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------

export interface BatchJob {
  batch_id: string;
  status: BatchStatus;
  total_files: number;
  source: BatchSource;
}

export interface BatchJobDetail extends BatchJob {
  done_count: number;
  review_count: number;
  failed_count: number;
  created_at: string;
  completed_at: string | null;
}

// SSE event payload from sse_publisher.py
export interface BatchSSEEvent {
  batch_id: string;
  file_index: number;
  status: "done" | "review" | "failed";
  done_count: number;
  review_count: number;
  failed_count: number;
  total_files: number;
  completed: boolean;
}
