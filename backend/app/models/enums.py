import enum


class OCRStatus(enum.StrEnum):
    PENDING = "PENDING"
    DONE = "DONE"
    REVIEW = "REVIEW"
    FAILED = "FAILED"


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
