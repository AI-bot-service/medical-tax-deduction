# shadcn/ui — Компоненты для MedVychet

Добавь shadcn/ui компонент или используй существующие в проекте: $ARGUMENTS

---

## Статус в проекте

**shadcn v4** установлен и настроен. Использует `@base-ui/react` как примитивы.

Уже добавленные компоненты (`frontend/src/components/ui/`):
- `button.tsx` — Button с вариантами: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`
- `input.tsx` — Input, совместим с Label
- `label.tsx` — Label с поддержкой disabled-состояния группы
- `badge.tsx` — Badge с вариантами: `default`, `secondary`, `destructive`, `outline`, `ghost`
- `card.tsx` — Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription, CardAction
- `progress.tsx` — Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue
- `separator.tsx` — Separator (horizontal/vertical)
- `tooltip.tsx` — Tooltip (TooltipProvider добавлен в providers.tsx)

## Добавить новый компонент

```bash
cd frontend && npx shadcn@latest add <component-name>
```

Примеры: `dialog`, `dropdown-menu`, `select`, `tabs`, `switch`, `checkbox`, `toast`, `sheet`, `popover`, `table`, `form`, `alert`

## Использование с HEITKAMP дизайн-системой

Все shadcn-компоненты стилизуются через className с CSS-переменными HEITKAMP:

```tsx
// Button — акцентный цвет HEITKAMP
<Button className="bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]">
  Действие
</Button>

// Button — вторичный
<Button variant="outline" className="border-[var(--border)]">
  Отмена
</Button>

// Input — с HEITKAMP focus ring
<Input className="focus-visible:border-[var(--accent)] focus-visible:ring-[var(--accent-light)]" />

// Input — состояние предупреждения
<Input className="border-[var(--yellow)] bg-yellow-50/60 focus-visible:border-[var(--accent)]" />

// Badge — статусные
<Badge className="bg-[var(--yellow-bg)] text-[var(--yellow-text)]">На проверке</Badge>
<Badge className="bg-[var(--green-bg)] text-[var(--green-text)]">Готово</Badge>
<Badge className="bg-[var(--red-bg)] text-[var(--red-text)]">Ошибка</Badge>
<Badge className="bg-[var(--purple-bg)] text-[var(--purple-text)]">Рецепт</Badge>

// Card — с HEITKAMP токенами
<Card className="rounded-xl border-[var(--border)] shadow-[var(--shadow-sm)] bg-[var(--surface)]">
  <CardHeader className="border-b border-[var(--border-light)] bg-[var(--surface-subtle)]">
    ...
  </CardHeader>
  <CardContent>...</CardContent>
</Card>

// Progress — с кастомным цветом
<Progress value={75}>
  <ProgressLabel>Заголовок</ProgressLabel>
  <ProgressValue>75%</ProgressValue>
  <ProgressTrack className="bg-[var(--bg)]">
    <ProgressIndicator style={{ background: "var(--green)" }} />
  </ProgressTrack>
</Progress>
```

## lucide-react иконки

В проекте установлен `lucide-react`. Использовать вместо emoji и самодельных SVG:

```tsx
import { CheckIcon, XIcon, ArrowRightIcon, AlertCircleIcon, LoaderCircleIcon } from "lucide-react";

// Размер через className
<CheckIcon className="size-4" />
<LoaderCircleIcon className="size-4 animate-spin" />
```

## Tailwind semantic-цвета (маппинг к HEITKAMP)

В `tailwind.config.ts` настроен маппинг через `--tw-*` CSS переменные:
- `bg-primary` → `#7B6FD4` (accent)
- `bg-muted` → `#F9F9FB` (surface-subtle)
- `text-muted-foreground` → `#9CA3AF`
- `border-border` → `#E5E7EB`
- `ring-ring` → `#7B6FD4` (accent)

## Правила для этого проекта

1. Всегда предпочитать shadcn-компоненты самодельным (div + инлайн стили)
2. Не переопределять HEITKAMP переменные (`--accent`, `--bg`, `--surface` и др.)
3. Для иконок — `lucide-react`, не emoji, не самодельный SVG
4. Focus ring всегда через `focus-visible:border-[var(--accent)] focus-visible:ring-[var(--accent-light)]`
5. Состояния ошибки/предупреждения — `border-[var(--yellow)]` или `aria-invalid`
