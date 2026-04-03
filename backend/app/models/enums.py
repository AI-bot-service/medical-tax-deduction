import enum


class OCRStatus(enum.StrEnum):
    PENDING = "PENDING"
    DONE = "DONE"
    REVIEW = "REVIEW"
    FAILED = "FAILED"
    DUPLICATE_REVIEW = "DUPLICATE_REVIEW"


class DocType(enum.StrEnum):
    RECIPE_107 = "recipe_107"       # Рецепт 107-1/у (амбулатория, основной)
    RECIPE_EGISZ = "recipe_egisz"   # Электронный рецепт ЕГИСЗ
    DOC_025 = "doc_025"             # Выписка 025/у (амбулатория, спорно)
    DOC_003 = "doc_003"             # Медкарта стационарного 003/у
    DOC_043 = "doc_043"             # Медкарта стоматологического 043/у
    DOC_111 = "doc_111"             # Карта беременной 111/у
    DOC_025_1 = "doc_025_1"         # Талон пациента 025-1/у (спорно)


class RiskLevel(enum.StrEnum):
    STANDARD = "STANDARD"
    DISPUTED = "DISPUTED"
    HIGH = "HIGH"



class ReceiptStatus(enum.StrEnum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"
    DELETED = "DELETED"


class BatchStatus(enum.StrEnum):
    PROCESSING = "processing"
    COMPLETED = "completed"
    PARTIAL = "partial"


class BatchSource(enum.StrEnum):
    TELEGRAM_BOT = "telegram_bot"
    WEB = "web"
    MINI_APP = "mini_app"


class ExpenseCategory(enum.StrEnum):
    MEDICINE = "medicine"
    TREATMENT_REGULAR = "treatment_regular"
    TREATMENT_EXPENSIVE = "treatment_expensive"
    VHI = "vhi"
    EDUCATION_SELF = "education_self"
    EDUCATION_CHILD = "education_child"
    EDUCATION_SPOUSE = "education_spouse"
    FITNESS = "fitness"


class FamilyRole(enum.StrEnum):
    SPOUSE = "spouse"
    CHILD = "child"


class DocumentType(enum.StrEnum):
    CLINIC_CERT = "clinic_cert"     # Справка об оплате мед. услуг КНД 1151156
    VHI_CERT = "vhi_cert"           # Справка об оплате по ДМС КНД 1151159
    NDFL_2 = "ndfl_2"               # Справка 2-НДФЛ
    CONTRACT = "contract"           # Договор с клиникой / страховой


class DocumentStatus(enum.StrEnum):
    UPLOADED = "uploaded"           # Загружен пользователем
    PENDING = "pending"             # Ожидает проверки
    CONFIRMED = "confirmed"         # Подтверждён пользователем
