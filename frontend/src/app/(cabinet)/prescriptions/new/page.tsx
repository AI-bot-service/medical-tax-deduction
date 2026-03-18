"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { DocType, Prescription } from "@/types/api";

// ---------------------------------------------------------------------------
// Doc type metadata
// ---------------------------------------------------------------------------

interface DocTypeInfo {
  value: DocType;
  label: string;
  description: string;
  isDisputed?: boolean;
}

const DOC_TYPES: DocTypeInfo[] = [
  {
    value: "recipe_107",
    label: "Рецепт 107-1/у",
    description: "Амбулаторный рецепт — основной вариант для вычета. Принимается ФНС без вопросов.",
  },
  {
    value: "recipe_egisz",
    label: "Электронный рецепт ЕГИСЗ",
    description: "Цифровой рецепт из системы ЕГИСЗ. Принимается наравне с бумажным.",
  },
  {
    value: "doc_025",
    label: "Выписка 025/у",
    description: "Талон амбулаторного пациента.",
    isDisputed: true,
  },
  {
    value: "doc_003",
    label: "Медкарта стационарного 003/у",
    description: "Выписка из медкарты стационарного больного.",
  },
  {
    value: "doc_043",
    label: "Стоматологическая 043/у",
    description: "Медицинская карта стоматологического пациента.",
  },
  {
    value: "doc_111",
    label: "Карта беременной 111/у",
    description: "Индивидуальная карта беременной и родильницы.",
  },
  {
    value: "doc_025_1",
    label: "Талон 025-1/у",
    description: "Талон к медицинской карте амбулаторного пациента.",
    isDisputed: true,
  },
];

// ---------------------------------------------------------------------------
// Step 1: DocTypeSelector
// ---------------------------------------------------------------------------

interface DocTypeSelectorProps {
  onSelect: (docType: DocType) => void;
}
function DocTypeSelector({ onSelect }: DocTypeSelectorProps) {
  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-gray-800">
        Шаг 1: Выберите тип документа
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DOC_TYPES.map((dt) => (
          <button
            key={dt.value}
            onClick={() => onSelect(dt.value)}
            className={[
              "rounded-xl border p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50",
              dt.isDisputed ? "border-yellow-200 bg-yellow-50" : "border-gray-200 bg-white",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-gray-800 text-sm">{dt.label}</span>
              {dt.isDisputed && (
                <span className="flex-shrink-0 text-xs text-yellow-600">⚠️</span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">{dt.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: PrescriptionForm
// ---------------------------------------------------------------------------

interface PrescriptionFormData {
  doctor_name: string;
  doctor_specialty: string;
  clinic_name: string;
  issue_date: string;
  expires_at: string;
  drug_name: string;
  drug_inn: string;
  dosage: string;
}

interface PrescriptionFormProps {
  docType: DocType;
  onSubmit: (data: PrescriptionFormData) => void;
  onBack: () => void;
  loading: boolean;
  error: string;
}

function PrescriptionForm({
  docType,
  onSubmit,
  onBack,
  loading,
  error,
}: PrescriptionFormProps) {
  const docInfo = DOC_TYPES.find((d) => d.value === docType)!;

  const [form, setForm] = useState<PrescriptionFormData>({
    doctor_name: "",
    doctor_specialty: "",
    clinic_name: "",
    issue_date: "",
    expires_at: "",
    drug_name: "",
    drug_inn: "",
    dosage: "",
  });

  function set(key: keyof PrescriptionFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function isValid() {
    return form.doctor_name && form.issue_date && form.drug_name;
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 transition-colors";
  const labelCls = "block text-xs text-gray-500 mb-1";

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-gray-800">
        Шаг 2: Данные рецепта · {docInfo.label}
      </h2>

      {docInfo.isDisputed && (
        <div className="mb-4 rounded-xl bg-yellow-50 border border-yellow-200 p-4">
          <p className="text-sm text-yellow-800">
            ⚠️ <strong>Внимание:</strong> Этот тип документа ФНС принимает не всегда.
            Рекомендуем уточнить в вашей налоговой инспекции.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>
            Название препарата <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.drug_name}
            onChange={(e) => set("drug_name", e.target.value)}
            className={inputCls}
            placeholder="Например: Амоксициллин"
          />
        </div>
        <div>
          <label className={labelCls}>МНН (международное название)</label>
          <input
            type="text"
            value={form.drug_inn}
            onChange={(e) => set("drug_inn", e.target.value)}
            className={inputCls}
            placeholder="Опционально"
          />
        </div>
        <div>
          <label className={labelCls}>Дозировка</label>
          <input
            type="text"
            value={form.dosage}
            onChange={(e) => set("dosage", e.target.value)}
            className={inputCls}
            placeholder="Например: 500мг"
          />
        </div>
        <div>
          <label className={labelCls}>
            ФИО врача <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.doctor_name}
            onChange={(e) => set("doctor_name", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Специальность врача</label>
          <input
            type="text"
            value={form.doctor_specialty}
            onChange={(e) => set("doctor_specialty", e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Медицинское учреждение</label>
          <input
            type="text"
            value={form.clinic_name}
            onChange={(e) => set("clinic_name", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>
            Дата выдачи <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.issue_date}
            onChange={(e) => set("issue_date", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>
            Дата окончания{" "}
            <span className="text-gray-400">(по умолчанию +60 дней)</span>
          </label>
          <input
            type="date"
            value={form.expires_at}
            onChange={(e) => set("expires_at", e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={onBack}
          disabled={loading}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← Назад
        </button>
        <button
          onClick={() => onSubmit(form)}
          disabled={!isValid() || loading}
          className={[
            "rounded-lg px-6 py-2 text-sm font-semibold text-white transition-colors",
            isValid() && !loading
              ? "bg-blue-600 hover:bg-blue-700"
              : "cursor-not-allowed bg-gray-300",
          ].join(" ")}
        >
          {loading ? "Создание..." : "Создать рецепт"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: PhotoUpload (optional)
// ---------------------------------------------------------------------------

interface PhotoUploadProps {
  prescriptionId: string;
  onDone: () => void;
}
function PhotoUpload({ prescriptionId, onDone }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      await fetch(`/api/v1/prescriptions/${prescriptionId}/photo`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      setDone(true);
    } catch {
      // ignore
    } finally {
      setUploading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-green-600 font-medium mb-4">✓ Фото загружено</p>
        <button
          onClick={onDone}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Готово
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-2 text-base font-semibold text-gray-800">
        Шаг 3: Загрузите фото рецепта
      </h2>
      <p className="mb-4 text-sm text-gray-500">
        Это необязательный шаг. Можно добавить фото позже.
      </p>

      <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 p-8 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors">
        <span className="text-3xl">📷</span>
        <p className="text-sm text-gray-600">Нажмите для выбора фото</p>
        <p className="text-xs text-gray-400">JPG, PNG, WEBP, PDF</p>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
          }}
          disabled={uploading}
        />
      </label>

      {uploading && <p className="mt-3 text-sm text-gray-500">Загрузка...</p>}

      <div className="mt-6">
        <button
          onClick={onDone}
          className="text-sm text-gray-500 hover:underline"
        >
          Пропустить →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Step = "select-type" | "form" | "photo";

export default function NewPrescriptionPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select-type");
  const [docType, setDocType] = useState<DocType | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFormSubmit(data: {
    doctor_name: string;
    doctor_specialty: string;
    clinic_name: string;
    issue_date: string;
    expires_at: string;
    drug_name: string;
    drug_inn: string;
    dosage: string;
  }) {
    if (!docType) return;
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        doc_type: docType,
        doctor_name: data.doctor_name,
        issue_date: data.issue_date,
        drug_name: data.drug_name,
      };
      if (data.doctor_specialty) body.doctor_specialty = data.doctor_specialty;
      if (data.clinic_name) body.clinic_name = data.clinic_name;
      if (data.expires_at) body.expires_at = data.expires_at;
      if (data.drug_inn) body.drug_inn = data.drug_inn;
      if (data.dosage) body.dosage = data.dosage;

      const prescription = await api.post<Prescription>("/api/v1/prescriptions", body);
      setCreatedId(prescription.id);
      setStep("photo");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Ошибка при создании рецепта");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push("/prescriptions")}
          className="text-sm text-blue-500 hover:underline"
        >
          ← Рецепты
        </button>
        <h1 className="text-xl font-bold text-gray-900">Новый рецепт</h1>
      </div>

      {/* Progress indicator */}
      <div className="mb-8 flex items-center gap-2">
        {(["select-type", "form", "photo"] as Step[]).map((s, idx) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={[
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                step === s
                  ? "bg-blue-600 text-white"
                  : ["select-type", "form", "photo"].indexOf(step) > idx
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-gray-400",
              ].join(" ")}
            >
              {["select-type", "form", "photo"].indexOf(step) > idx ? "✓" : idx + 1}
            </div>
            {idx < 2 && (
              <div className="h-px w-8 bg-gray-200" />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white border border-gray-100 p-6 shadow-sm">
        {step === "select-type" && (
          <DocTypeSelector
            onSelect={(dt) => {
              setDocType(dt);
              setStep("form");
            }}
          />
        )}
        {step === "form" && docType && (
          <PrescriptionForm
            docType={docType}
            onSubmit={handleFormSubmit}
            onBack={() => setStep("select-type")}
            loading={loading}
            error={error}
          />
        )}
        {step === "photo" && createdId && (
          <PhotoUpload
            prescriptionId={createdId}
            onDone={() => router.push("/prescriptions")}
          />
        )}
      </div>
    </main>
  );
}
