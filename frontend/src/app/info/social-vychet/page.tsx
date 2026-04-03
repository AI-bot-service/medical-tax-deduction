import type { Metadata } from "next";
import Link from "next/link";
import {
  Receipt,
  GraduationCap,
  Heart,
  ShieldCheck,
  ChevronRight,
  Info,
  CheckCircle2,
  AlertCircle,
  Calculator,
  FileText,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Социальный налоговый вычет — МедВычет",
  description:
    "Всё о социальном налоговом вычете: лечение, лекарства, обучение. Как вернуть 13% НДФЛ согласно ст. 219 НК РФ.",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "1.05rem",
        fontWeight: 800,
        color: "var(--text-primary)",
        letterSpacing: "-.03em",
        marginBottom: "14px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      {children}
    </h2>
  );
}

function InfoBox({
  variant = "info",
  children,
}: {
  variant?: "info" | "warning" | "success";
  children: React.ReactNode;
}) {
  const styles = {
    info: {
      bg: "var(--accent-light)",
      border: "var(--accent)",
      color: "var(--accent)",
    },
    warning: {
      bg: "rgba(251,191,36,.1)",
      border: "rgba(251,191,36,.5)",
      color: "#b45309",
    },
    success: {
      bg: "rgba(34,197,94,.08)",
      border: "rgba(34,197,94,.4)",
      color: "#15803d",
    },
  }[variant];

  return (
    <div
      style={{
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        borderRadius: "var(--r-md)",
        padding: "12px 16px",
        fontSize: "13px",
        color: styles.color,
        lineHeight: 1.6,
        marginBottom: "16px",
      }}
    >
      {children}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function SocialVychetInfoPage() {
  return (
    <main
      style={{
        maxWidth: "820px",
        margin: "0 auto",
        padding: "40px 20px 80px",
        fontFamily: "var(--font-sans, Urbanist, sans-serif)",
      }}
    >
      {/* ── Breadcrumb ── */}
      <nav
        style={{
          fontSize: "12px",
          color: "var(--text-muted)",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <Link
          href="/dashboard"
          style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
        >
          Дашборд
        </Link>
        <ChevronRight size={12} />
        <span>Социальный вычет</span>
      </nav>

      {/* ── Header ── */}
      <div
        style={{
          background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-mid, #9c8fe8) 100%)",
          borderRadius: "var(--r-md, 16px)",
          padding: "32px 36px",
          color: "#fff",
          marginBottom: "28px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: "-40px",
            top: "-60px",
            width: "220px",
            height: "220px",
            borderRadius: "50%",
            background: "rgba(255,255,255,.08)",
          }}
        />
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(255,255,255,.15)",
            borderRadius: "var(--r-pill, 999px)",
            padding: "4px 12px",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: ".04em",
            marginBottom: "12px",
          }}
        >
          <FileText size={12} />
          Статья 219 НК РФ
        </div>
        <h1
          style={{
            fontSize: "1.7rem",
            fontWeight: 800,
            letterSpacing: "-.04em",
            margin: "0 0 10px",
            lineHeight: 1.2,
          }}
        >
          Социальный налоговый вычет
        </h1>
        <p style={{ fontSize: "14px", opacity: 0.85, margin: 0, maxWidth: "520px", lineHeight: 1.6 }}>
          Вы можете вернуть 13% от расходов на лечение, лекарства и обучение —
          если работаете официально и платите НДФЛ.
        </p>
      </div>

      {/* ── KPI row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px",
          marginBottom: "28px",
        }}
      >
        {[
          {
            icon: <Calculator size={18} />,
            label: "Ставка возврата",
            value: "13%",
            sub: "от суммы расходов",
            color: "var(--accent)",
          },
          {
            icon: <ShieldCheck size={18} />,
            label: "Общий лимит (2024)",
            value: "150 000 ₽",
            sub: "максимум к вычету",
            color: "var(--green, #22c55e)",
          },
          {
            icon: <Receipt size={18} />,
            label: "Максимальный возврат",
            value: "19 500 ₽",
            sub: "при лимите 150 000 ₽",
            color: "var(--yellow, #f59e0b)",
          },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              background: "var(--surface, #fff)",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: "var(--r-md, 16px)",
              padding: "18px 20px",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "var(--accent-light, rgba(123,111,212,.1))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent)",
                marginBottom: "10px",
              }}
            >
              {k.icon}
            </div>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: ".05em",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              {k.label}
            </div>
            <div
              style={{
                fontSize: "1.4rem",
                fontWeight: 800,
                color: k.color,
                letterSpacing: "-.05em",
                lineHeight: 1,
                marginBottom: "3px",
              }}
            >
              {k.value}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Section: Что такое вычет ── */}
      <div
        style={{
          background: "var(--surface, #fff)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: "var(--r-md, 16px)",
          padding: "24px 28px",
          marginBottom: "16px",
        }}
      >
        <SectionTitle>
          <Info size={17} color="var(--accent)" />
          Что такое социальный налоговый вычет
        </SectionTitle>

        <p
          style={{
            fontSize: "13.5px",
            color: "var(--text-secondary, #374151)",
            lineHeight: 1.7,
            marginBottom: "14px",
          }}
        >
          Государство разрешает уменьшить налогооблагаемую базу на сумму социальных
          расходов — и вернуть 13% НДФЛ, уже уплаченного работодателем за вас.
          Право закреплено в{" "}
          <strong style={{ color: "var(--text-primary)" }}>статье 219 Налогового кодекса РФ</strong>.
        </p>

        <InfoBox variant="info">
          <strong>Пример:</strong> вы потратили 80 000 ₽ на лекарства в 2024 году.
          Налоговый вычет составит 80 000 ₽, а возврат НДФЛ — 80 000 × 13% ={" "}
          <strong>10 400 ₽</strong>.
        </InfoBox>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {[
            "Вычет предоставляется только резидентам РФ, уплачивающим НДФЛ по ставке 13%",
            "Расходы должны относиться к налоговому году, за который подаётся декларация",
            "Документы подаются через личный кабинет ФНС или лично в инспекцию",
            "Возврат приходит на банковский счёт в течение 3 месяцев после проверки декларации",
          ].map((item) => (
            <div
              key={item}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                fontSize: "13px",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              <CheckCircle2
                size={15}
                style={{ flexShrink: 0, marginTop: "2px", color: "var(--green, #22c55e)" }}
              />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section: Категории ── */}
      <div
        style={{
          background: "var(--surface, #fff)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: "var(--r-md, 16px)",
          padding: "24px 28px",
          marginBottom: "16px",
        }}
      >
        <SectionTitle>
          <Receipt size={17} color="var(--accent)" />
          Виды социального вычета
        </SectionTitle>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {[
            {
              icon: <Heart size={16} />,
              title: "Лечение",
              color: "#3b82f6",
              bg: "rgba(59,130,246,.08)",
              limit: "до 150 000 ₽",
              desc:
                "Услуги медицинских организаций и ИП по перечню, утверждённому Правительством РФ. Включает диагностику, лечение, платные приёмы врачей.",
            },
            {
              icon: <Receipt size={16} />,
              title: "Лекарства",
              color: "#8b5cf6",
              bg: "rgba(139,92,246,.08)",
              limit: "до 150 000 ₽ (совместно с лечением)",
              desc:
                "Лекарственные препараты, назначенные лечащим врачом. Необходим рецепт по форме 107-1/у или сведения из ЕГИСЗ.",
            },
            {
              icon: <GraduationCap size={16} />,
              title: "Обучение своё",
              color: "#10b981",
              bg: "rgba(16,185,129,.08)",
              limit: "до 150 000 ₽",
              desc:
                "Собственное обучение в любых образовательных учреждениях, имеющих лицензию. Форма обучения значения не имеет.",
            },
            {
              icon: <GraduationCap size={16} />,
              title: "Обучение ребёнка",
              color: "#a855f7",
              bg: "rgba(168,85,247,.08)",
              limit: "50 000 ₽ на каждого ребёнка",
              desc:
                "Обучение детей до 24 лет в очной форме. Лимит — отдельный от основного и считается на каждого ребёнка.",
            },
            {
              icon: <ShieldCheck size={16} />,
              title: "Дорогостоящее лечение",
              color: "#64748b",
              bg: "rgba(100,116,139,.08)",
              limit: "Без ограничений",
              desc:
                "Вычет по дорогостоящим видам лечения принимается в полной сумме фактических расходов. Перечень видов утверждён постановлением Правительства РФ № 201.",
            },
          ].map((cat) => (
            <div
              key={cat.title}
              style={{
                display: "flex",
                gap: "14px",
                alignItems: "flex-start",
                padding: "14px 16px",
                borderRadius: "var(--r-sm, 10px)",
                border: "1px solid var(--border-light, #f3f4f6)",
                background: cat.bg,
              }}
            >
              <div
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "9px",
                  background: `${cat.color}22`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: cat.color,
                  flexShrink: 0,
                }}
              >
                {cat.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "4px",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 800,
                      color: "var(--text-primary)",
                    }}
                  >
                    {cat.title}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: cat.color,
                      background: `${cat.color}18`,
                      borderRadius: "6px",
                      padding: "2px 8px",
                    }}
                  >
                    {cat.limit}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "12.5px",
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {cat.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section: Лимиты по годам ── */}
      <div
        style={{
          background: "var(--surface, #fff)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: "var(--r-md, 16px)",
          padding: "24px 28px",
          marginBottom: "16px",
        }}
      >
        <SectionTitle>
          <Calculator size={17} color="var(--accent)" />
          Лимиты и максимальный возврат
        </SectionTitle>

        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--bg, #f2f2f7)",
                }}
              >
                {["Год", "Общий лимит", "Макс. возврат 13%", "Лимит на ребёнка"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 14px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: ".04em",
                        textTransform: "uppercase",
                        borderBottom: "1px solid var(--border)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {[
                { year: "2023", limit: "120 000 ₽", refund: "15 600 ₽", child: "50 000 ₽" },
                { year: "2024", limit: "150 000 ₽", refund: "19 500 ₽", child: "110 000 ₽" },
                { year: "2025", limit: "150 000 ₽", refund: "19 500 ₽", child: "110 000 ₽" },
              ].map((row, i) => (
                <tr
                  key={row.year}
                  style={{
                    background:
                      row.year === "2024"
                        ? "var(--accent-light, rgba(123,111,212,.06))"
                        : i % 2 === 0
                        ? "transparent"
                        : "var(--bg, #f9fafb)",
                  }}
                >
                  <td
                    style={{
                      padding: "10px 14px",
                      fontWeight: row.year === "2024" ? 800 : 600,
                      color: row.year === "2024" ? "var(--accent)" : "var(--text-primary)",
                      borderBottom: "1px solid var(--border-light)",
                    }}
                  >
                    {row.year}
                    {row.year === "2024" && (
                      <span
                        style={{
                          marginLeft: "6px",
                          fontSize: "10px",
                          background: "var(--accent)",
                          color: "#fff",
                          borderRadius: "4px",
                          padding: "1px 5px",
                          fontWeight: 700,
                        }}
                      >
                        актуально
                      </span>
                    )}
                  </td>
                  {[row.limit, row.refund, row.child].map((v) => (
                    <td
                      key={v}
                      style={{
                        padding: "10px 14px",
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        borderBottom: "1px solid var(--border-light)",
                      }}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <InfoBox variant="warning">
          <AlertCircle
            size={13}
            style={{ display: "inline", marginRight: "5px", verticalAlign: "middle" }}
          />
          <strong>Важно:</strong> лимит 150 000 ₽ — общий для всех видов социальных расходов
          (лечение + лекарства + обучение своё). Исключение — обучение детей (отдельный лимит)
          и дорогостоящее лечение (без ограничений).
        </InfoBox>
      </div>

      {/* ── Section: Какие документы нужны ── */}
      <div
        style={{
          background: "var(--surface, #fff)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: "var(--r-md, 16px)",
          padding: "24px 28px",
          marginBottom: "16px",
        }}
      >
        <SectionTitle>
          <FileText size={17} color="var(--accent)" />
          Необходимые документы
        </SectionTitle>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          {[
            {
              title: "Для вычета на лекарства",
              items: [
                "Рецепт по форме 107-1/у (оригинал)",
                "Кассовые чеки из аптеки",
                "Справка 2-НДФЛ от работодателя",
                "Декларация 3-НДФЛ",
              ],
            },
            {
              title: "Для вычета на лечение",
              items: [
                "Договор с медицинской организацией",
                "Справка об оплате медицинских услуг",
                "Лицензия медицинской организации",
                "Справка 2-НДФЛ, декларация 3-НДФЛ",
              ],
            },
          ].map((group) => (
            <div
              key={group.title}
              style={{
                padding: "14px 16px",
                borderRadius: "var(--r-sm, 10px)",
                border: "1px solid var(--border-light)",
                background: "var(--bg, #f9fafb)",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: "10px",
                }}
              >
                {group.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {group.items.map((item) => (
                  <div
                    key={item}
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "7px",
                      lineHeight: 1.5,
                    }}
                  >
                    <div
                      style={{
                        width: "5px",
                        height: "5px",
                        borderRadius: "50%",
                        background: "var(--accent)",
                        flexShrink: 0,
                        marginTop: "5px",
                      }}
                    />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section: CTA ── */}
      <div
        style={{
          background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-mid, #9c8fe8) 100%)",
          borderRadius: "var(--r-md, 16px)",
          padding: "28px 32px",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "1rem",
              fontWeight: 800,
              marginBottom: "6px",
              letterSpacing: "-.03em",
            }}
          >
            Начните собирать документы прямо сейчас
          </div>
          <p style={{ fontSize: "13px", opacity: 0.85, margin: 0, maxWidth: "400px" }}>
            МедВычет автоматически сканирует чеки, привязывает рецепты и формирует
            пакет документов для налоговой.
          </p>
        </div>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "#fff",
            color: "var(--accent)",
            borderRadius: "var(--r-sm, 10px)",
            padding: "10px 20px",
            fontSize: "13px",
            fontWeight: 800,
            textDecoration: "none",
            flexShrink: 0,
            letterSpacing: "-.01em",
          }}
        >
          Перейти в кабинет
          <ChevronRight size={14} />
        </Link>
      </div>
    </main>
  );
}
