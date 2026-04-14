# Frontend CLAUDE.md

## Дизайн-система HEITKAMP

**Обязательная** дизайн-система для всех страниц и компонентов.

Файлы:
- `proekt/design/heitkamp/heitkamp-ds.css` — готовые CSS-классы и переменные
- `proekt/design/heitkamp/design-tokens-heitkamp.json` — все токены (цвета, типографика, отступы, тени)

**Правила при создании любой страницы или компонента**:
1. Шрифт **Urbanist** (Google Fonts, weights 300–800)
2. CSS-переменные из heitkamp-ds.css: `--accent`, `--bg`, `--surface`, `--sidebar-bg` и др.
3. Готовые классы: `.card`, `.btn-primary`, `.badge-*`, `.kpi-card`, `.sidebar`, `.nav-item`, `.topbar`
4. Не переопределять токены HEITKAMP своими цветами
5. Акцент: `#7B6FD4`, фон: `#F2F2F7`, карточки: `#FFFFFF`, sidebar: `#1A1A2E`

## Структура frontend

- `src/app/(cabinet)/` — защищённые страницы ЛК
- `src/lib/api.ts` — Fetch wrapper (401→refresh→retry)
- `src/lib/store.ts` — Zustand: authStore, batchStore, reviewStore
- `src/lib/sse.ts` — SSE-клиент для batch stream (`useBatchSSE` hook)

После каждого изменения Frontend - делаешь пересборку, деплой проекта в Docker