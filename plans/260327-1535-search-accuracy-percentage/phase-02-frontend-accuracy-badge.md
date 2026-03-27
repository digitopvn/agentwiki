# Phase 2: Frontend Accuracy Badge

**Priority:** P0
**Status:** pending
**Depends on:** Phase 1

## Overview

Display color-coded accuracy percentage badge on search results and suggestions in command palette.

## Context Links

- Command palette: `packages/web/src/components/command-palette/command-palette.tsx`
- Search hook: `packages/web/src/hooks/use-search.ts`

## Implementation Steps

### Step 1: Update `CommandItem` component

Add `accuracy` prop and render badge on the right side:

```tsx
function CommandItem({
  icon, label, sublabel, accuracy, onSelect, isDark,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  accuracy?: number  // NEW: 0-100
  onSelect: () => void
  isDark: boolean
}) {
  return (
    <Command.Item onSelect={onSelect} className={/* existing */}>
      <span className="shrink-0 ...">{icon}</span>
      <div className="flex-1 truncate">
        <span>{label}</span>
        {sublabel && <span className="ml-2 text-xs ...">{sublabel}</span>}
      </div>
      {accuracy != null && <AccuracyBadge value={accuracy} isDark={isDark} />}
    </Command.Item>
  )
}
```

### Step 2: Create `AccuracyBadge` inline component

Color coding logic:
- **>= 80%**: green (high confidence)
- **>= 50%**: yellow/amber (moderate)
- **< 50%**: gray (low confidence)

```tsx
function AccuracyBadge({ value, isDark }: { value: number; isDark: boolean }) {
  const color = value >= 80
    ? 'text-emerald-400 bg-emerald-500/10'
    : value >= 50
      ? 'text-amber-400 bg-amber-500/10'
      : isDark ? 'text-neutral-500 bg-neutral-500/10' : 'text-neutral-400 bg-neutral-400/10'

  return (
    <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums', color)}>
      {value}%
    </span>
  )
}
```

### Step 3: Pass `accuracy` to `CommandItem` in search results

```tsx
{searchResults.map((result) => (
  <CommandItem
    key={result.id}
    icon={<FileText className="h-3.5 w-3.5" />}
    label={result.title}
    sublabel={result.snippet ?? result.category ?? undefined}
    accuracy={result.accuracy}  // NEW
    onSelect={() => openDocument(result)}
    isDark={isDark}
  />
))}
```

### Step 4: Pass `accuracy` to `CommandItem` in suggestions

```tsx
{suggestions.map((item, idx) => (
  <CommandItem
    key={`suggest-${idx}`}
    icon={suggestIcon(item.source)}
    label={item.text}
    sublabel={item.source === 'fuzzy' ? 'fuzzy match' : item.source === 'history' ? 'recent search' : undefined}
    accuracy={item.accuracy}  // NEW
    onSelect={() => handleSuggestionClick(item)}
    isDark={isDark}
  />
))}
```

## Todo

- [ ] Add `accuracy` prop to `CommandItem`
- [ ] Create `AccuracyBadge` component (inline, same file)
- [ ] Pass accuracy from search results to `CommandItem`
- [ ] Pass accuracy from suggestions to `CommandItem`

## Success Criteria

- Badge visible on right side of each search result / suggestion
- Color-coded: green >= 80%, yellow >= 50%, gray < 50%
- `tabular-nums` for consistent digit width
- No layout shift or overflow issues
- History suggestions show no badge (accuracy undefined)
