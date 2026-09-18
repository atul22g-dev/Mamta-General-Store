# Three.js Academy — Ultimate Design & UI Skill

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Three.js Academy
**Product:** Interactive Three.js learning platform
**Audience:** Beginner developers, Intermediate frontend developers, Advanced Three.js developers, Creative developers, WebGL learners
**Generated:** 2026-08-24
**Source:** Combined from MASTER.md + SKILL.md
**Stack:** React + Next.js + Tailwind CSS + Three.js

---

## 1. Visual Style

A professional developer tool with dark-mode-first design. Inspired by VS Code, GitHub, and modern IDE aesthetics — clean, dense, functional. No decorative fluff. Every pixel serves a purpose.

**Personality:** Technical, precise, trustworthy, approachable for learners

**Mood:** Focused development environment — like opening a well-organized code editor

---

## 2. Design Principles

1. **Content-first:** The 3D preview and code are the heroes. UI wraps around them.
2. **Progressive disclosure:** Show what's needed now. Reveal complexity on demand.
3. **Consistent density:** Developer tools pack information densely — respect that.
4. **Accessible by default:** Every interaction works for keyboard, screen reader, and reduced motion.
5. **Dark by design:** Dark theme is primary. Light theme is a secondary consideration.
6. **Performance-aware:** Animations are lightweight. 3D preview FPS matters more than UI transitions.

---

## 3. Color Tokens

### Core Palette

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--color-bg-primary` | `#0A0E1A` | 10, 14, 26 | Main background |
| `--color-bg-secondary` | `#0F1629` | 15, 22, 41 | Sidebar, panels |
| `--color-bg-tertiary` | `#151D33` | 21, 29, 51 | Cards, elevated surfaces |
| `--color-bg-quaternary` | `#1A2340` | 26, 35, 64 | Hover states, active items |
| `--color-bg-code` | `#0D1117` | 13, 17, 23 | Code editor background |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-text-primary` | `#E2E8F0` | Primary text, headings |
| `--color-text-secondary` | `#94A3B8` | Descriptions, labels |
| `--color-text-tertiary` | `#64748B` | Placeholders, hints |
| `--color-text-inverse` | `#0F172A` | Text on light surfaces |

### Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-accent` | `#6366F1` | Primary actions, links, active states (Indigo) |
| `--color-accent-hover` | `#818CF0` | Accent hover state |
| `--color-success` | `#22C55E` | Run, success, completion, progress |
| `--color-success-dim` | `#16A34A` | Success backgrounds |
| `--color-warning` | `#F59E0B` | Warnings, intermediate difficulty |
| `--color-error` | `#EF4444` | Errors, critical, advanced difficulty |
| `--color-info` | `#3B82F6` | Informational, beginner difficulty |

### Surface Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-border` | `#1E293B` | Default borders |
| `--color-border-active` | `#6366F1` | Active/focused borders |
| `--color-border-subtle` | `#162033` | Subtle separators |
| `--color-glow` | `rgba(99, 102, 241, 0.15)` | Focus rings, accent glow |
| `--color-overlay` | `rgba(0, 0, 0, 0.6)` | Modal overlays |

---

## 4. Typography

### Font Pairing

- **Headings:** JetBrains Mono (technical, code-aligned)
- **Body:** IBM Plex Sans (clean, readable, developer-oriented)
- **Code:** JetBrains Mono (monospace, ligatures enabled)

### Google Fonts Import

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
```

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--text-xs` | 11px | 400 | 1.5 | Badges, labels |
| `--text-sm` | 13px | 400 | 1.5 | Secondary text, metadata |
| `--text-base` | 14px | 400 | 1.6 | Body text, code comments |
| `--text-md` | 15px | 500 | 1.5 | Sidebar items, UI labels |
| `--text-lg` | 18px | 600 | 1.4 | Section headings |
| `--text-xl` | 22px | 700 | 1.3 | Page titles |
| `--text-2xl` | 28px | 700 | 1.2 | Hero headings |
| `--text-3xl` | 36px | 700 | 1.1 | Landing hero |

### Font Families (CSS)

```css
--font-sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
```

---

## 5. Spacing

### Spacing Scale (4px base)

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0` | 0px | Reset |
| `--space-px` | 1px | Borders, hairlines |
| `--space-0.5` | 2px | Tight inline gaps |
| `--space-1` | 4px | Icon-to-text gaps |
| `--space-1.5` | 6px | Compact inline spacing |
| `--space-2` | 8px | Small gaps, padding |
| `--space-3` | 12px | Input padding, card gaps |
| `--space-4` | 16px | Standard padding |
| `--space-5` | 20px | Medium spacing |
| `--space-6` | 24px | Card padding, section gaps |
| `--space-8` | 32px | Section padding |
| `--space-10` | 40px | Large section gaps |
| `--space-12` | 48px | Major section breaks |
| `--space-16` | 64px | Hero padding |

---

## 6. Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-none` | 0px | Code blocks, tables |
| `--radius-sm` | 4px | Badges, tags, small elements |
| `--radius-md` | 6px | Buttons, inputs, cards |
| `--radius-lg` | 8px | Modals, panels |
| `--radius-xl` | 12px | Feature cards, hero sections |
| `--radius-full` | 9999px | Avatars, pills, circular elements |

**Principle:** Developer tools use tighter radii. Avoid oversized rounded corners (no 20px+ on cards).

---

## 7. Borders

| Token | Value | Usage |
|-------|-------|-------|
| `--border-default` | `1px solid var(--color-border)` | Cards, dividers |
| `--border-active` | `1px solid var(--color-border-active)` | Focused inputs, active tabs |
| `--border-subtle` | `1px solid var(--color-border-subtle)` | Fine separators |
| `--border-strong` | `2px solid var(--color-border)` | Emphasized sections |

---

## 8. Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.3)` | Subtle lift |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.4)` | Cards, dropdowns |
| `--shadow-lg` | `0 8px 24px rgba(0, 0, 0, 0.5)` | Modals, popovers |
| `--shadow-glow` | `0 0 20px var(--color-glow)` | Focus rings, accent glow |
| `--shadow-inset` | `inset 0 1px 2px rgba(0, 0, 0, 0.3)` | Code editor, recessed areas |

---

## 9. Buttons

### Primary Button (Run / CTA)

```css
.btn-primary {
  background: var(--color-success);
  color: #FFFFFF;
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 13px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
  letter-spacing: 0.02em;
}
.btn-primary:hover { filter: brightness(1.1); }
.btn-primary:active { transform: scale(0.98); }
.btn-primary:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### Secondary Button

```css
.btn-secondary {
  background: transparent;
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms ease;
}
.btn-secondary:hover {
  background: var(--color-bg-quaternary);
  border-color: var(--color-text-tertiary);
}
```

### Ghost Button (Navigation)

```css
.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
}
.btn-ghost:hover {
  background: var(--color-bg-quaternary);
  color: var(--color-text-primary);
}
```

### Icon Button

```css
.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
}
.btn-icon:hover {
  background: var(--color-bg-quaternary);
  color: var(--color-text-primary);
}
```

---

## 10. Inputs

### Text Input

```css
.input {
  background: var(--color-bg-code);
  color: var(--color-text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  width: 100%;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-glow);
}
.input::placeholder {
  color: var(--color-text-tertiary);
}
```

### Select / Dropdown

```css
.select {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 13px;
  padding: 8px 32px 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,..."); /* chevron */
  background-repeat: no-repeat;
  background-position: right 8px center;
}
```

### Search Input

```css
.search-input {
  background: var(--color-bg-code);
  color: var(--color-text-primary);
  font-size: 13px;
  padding: 8px 12px 8px 36px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  width: 100%;
}
/* Search icon positioned absolutely at left */
```

---

## 11. Cards

### Lesson Card

```css
.lesson-card {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.lesson-card:hover {
  border-color: var(--color-accent);
  background: var(--color-bg-quaternary);
}
.lesson-card.completed {
  border-color: var(--color-success);
  opacity: 0.85;
}
```

### Project Card

```css
.project-card {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all 150ms ease;
}
.project-card:hover {
  border-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.project-card__preview {
  aspect-ratio: 16/9;
  background: var(--color-bg-code);
  overflow: hidden;
}
.project-card__body {
  padding: var(--space-4);
}
```

### Code Card (Source Code Display)

```css
.code-card {
  background: var(--color-bg-code);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
}
.code-card__header {
  background: var(--color-bg-secondary);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.code-card__body {
  padding: var(--space-4);
  overflow-x: auto;
}
```

---

## 12. Navigation

### Top Navigation Bar

```css
.navbar {
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  height: 48px;
  padding: 0 var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  position: sticky;
  top: 0;
  z-index: 40;
}
```

**Layout:** Logo | Search (center) | User menu (right)

**Height:** 48px (compact, developer-tool standard)

---

## 13. Sidebar

### Main Sidebar (Course Navigation)

```css
.sidebar {
  width: 280px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0;
}
.sidebar--collapsed {
  width: 48px;
}
```

**Behavior:**
- Collapsible with keyboard shortcut (Cmd/Ctrl + B)
- Shows module groups → lesson items
- Active lesson highlighted with accent left-border
- Scroll independently of main content

### Sidebar Item

```css
.sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 100ms ease;
  border-left: 2px solid transparent;
}
.sidebar-item:hover {
  background: var(--color-bg-quaternary);
  color: var(--color-text-primary);
}
.sidebar-item.active {
  background: var(--color-bg-quaternary);
  color: var(--color-text-primary);
  border-left-color: var(--color-accent);
}
.sidebar-item.completed {
  color: var(--color-text-tertiary);
}
```

---

## 14. Tabs

### Code/Preview Tabs

```css
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
}
.tab {
  padding: var(--space-2) var(--space-4);
  font-size: 13px;
  color: var(--color-text-secondary);
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 150ms ease;
}
.tab:hover {
  color: var(--color-text-primary);
}
.tab.active {
  color: var(--color-text-primary);
  border-bottom-color: var(--color-accent);
}
```

---

## 15. Code Editor

### Layout

```
┌─────────────────────────────────────────────────┐
│ [Tab: main.js] [Tab: scene.ts] [Tab: style.css]│  ← File tabs
├─────────────────────────────────────────────────┤
│ 1  │ import * as THREE from 'three';            │
│ 2  │                                            │  ← Line numbers
│ 3  │ const scene = new THREE.Scene();           │
│ 4  │ const camera = new THREE.Perspective...    │
│ ...│ ...                                        │
├─────────────────────────────────────────────────┤
│ > Run ▶  │ Console: No errors                   │  ← Action bar
└─────────────────────────────────────────────────┘
```

### Styling

```css
.editor {
  background: var(--color-bg-code);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-primary);
}
.editor__gutter {
  color: var(--color-text-tertiary);
  padding-right: var(--space-4);
  border-right: 1px solid var(--color-border-subtle);
  user-select: none;
  text-align: right;
  min-width: 40px;
}
.editor__line:hover {
  background: rgba(99, 102, 241, 0.05);
}
.editor__line.active {
  background: rgba(99, 102, 241, 0.1);
}
```

### Syntax Highlighting Tokens

| Token | Color | Usage |
|-------|-------|-------|
| `--syntax-keyword` | `#C678DD` | import, const, function, class |
| `--syntax-string` | `#98C379` | String literals |
| `--syntax-number` | `#D19A66` | Numeric literals |
| `--syntax-comment` | `#5C6370` | Comments (italic) |
| `--syntax-function` | `#61AFEF` | Function calls |
| `--syntax-type` | `#E5C07B` | Type names, classes |
| `--syntax-variable` | `#E06C75` | Variable names |
| `--syntax-operator` | `#56B6C2` | Operators |
| `--syntax-property` | `#E5C07B` | Object properties |

---

## 16. 3D Preview Panel

### Layout

```css
.preview-panel {
  background: var(--color-bg-code);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  position: relative;
  overflow: hidden;
}
.preview-panel__canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.preview-panel__overlay {
  position: absolute;
  bottom: var(--space-3);
  right: var(--space-3);
  display: flex;
  gap: var(--space-2);
}
```

### 3D Viewport Controls

```css
.viewport-controls {
  position: absolute;
  bottom: var(--space-3);
  left: var(--space-3);
  display: flex;
  gap: var(--space-1);
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  border-radius: var(--radius-sm);
  padding: var(--space-1);
}
```

**Controls:** Rotate | Zoom | Pan | Reset | Fullscreen

### FPS/Performance Display

```css
.fps-badge {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  background: rgba(0, 0, 0, 0.7);
  color: var(--color-success);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
```

---

## 17. Lesson Flow Components

### Lesson Page Layout

```
┌──────────┬──────────────────────────────────────┐
│          │  Breadcrumb: Three.js > Basics > ...  │
│ Sidebar  │──────────────────────────────────────│
│          │  Lesson Title                         │
│ Modules  │  ─────────────────────────────────── │
│          │  Explanation / Text Content           │
│ ▸ Intro  │  ─────────────────────────────────── │
│ ▸ Setup  │  Source Code Editor                   │
│ ● Scene  │  [Run ▶] [Reset] [Copy]              │
│ ▸ Camera │──────────────────────────────────────│
│ ▸ Light  │  3D Preview / Live Canvas             │
│          │  [FPS: 60] [Fullscreen]               │
│ Projects │──────────────────────────────────────│
│          │  Console / Errors                     │
│ ▸ Solar  │  > Scene created successfully         │
│ ▸ Galaxy │  > 3 objects rendered                 │
│          │──────────────────────────────────────│
│          │  Challenge                            │
│          │  "Add a rotating cube to the scene"   │
│          │  [Show Solution] [Submit]             │
│          │──────────────────────────────────────│
│          │  [← Previous] [Next Lesson →]         │
└──────────┴──────────────────────────────────────┘
```

---

## 18. Progress Indicators

### Progress Bar (Course)

```css
.progress-bar {
  height: 4px;
  background: var(--color-bg-quaternary);
  border-radius: 2px;
  overflow: hidden;
}
.progress-bar__fill {
  height: 100%;
  background: var(--color-success);
  border-radius: 2px;
  transition: width 300ms ease;
}
```

### Completion Status

- **Not started:** Empty circle outline (color: `--color-text-tertiary`)
- **In progress:** Half-filled circle (color: `--color-accent`)
- **Completed:** Filled circle with checkmark (color: `--color-success`)

---

## 19. Badges & Difficulty Indicators

### Difficulty Badges

```css
.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.badge--beginner {
  background: rgba(59, 130, 246, 0.15);
  color: #60A5FA;
  border: 1px solid rgba(59, 130, 246, 0.3);
}
.badge--intermediate {
  background: rgba(245, 158, 11, 0.15);
  color: #FBBF24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}
.badge--advanced {
  background: rgba(239, 68, 68, 0.15);
  color: #F87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}
```

### Other Badges

| Badge | Color | Usage |
|-------|-------|-------|
| `badge--new` | Green (success) | New content |
| `badge--updated` | Blue (info) | Recently updated |
| `badge--premium` | Gold | Premium content |
| `badge--community` | Purple | Community contributions |

---

## 20. Command Palette

### Trigger: Cmd/Ctrl + K

```css
.command-palette-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
}
.command-palette {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  width: 560px;
  max-height: 420px;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}
.command-palette__input {
  /* Uses .input styles */
  border: none;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
  padding: var(--space-3) var(--space-4);
  font-size: 15px;
}
.command-palette__results {
  overflow-y: auto;
  max-height: 320px;
  padding: var(--space-2);
}
.command-palette__item {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: 13px;
}
.command-palette__item:hover,
.command-palette__item.selected {
  background: var(--color-bg-quaternary);
}
```

---

## 21. Search

### Global Search

- Triggered from navbar search or Cmd/Ctrl + K
- Searches lessons, projects, concepts, API references
- Results grouped by category
- Keyboard navigable (↑↓ to select, Enter to go, Esc to close)

---

## 22. Breadcrumbs

```css
.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: 12px;
  color: var(--color-text-tertiary);
}
.breadcrumb__link {
  color: var(--color-text-secondary);
  text-decoration: none;
  cursor: pointer;
  transition: color 100ms ease;
}
.breadcrumb__link:hover {
  color: var(--color-accent);
}
.breadcrumb__separator {
  color: var(--color-text-tertiary);
}
.breadcrumb__current {
  color: var(--color-text-primary);
}
```

---

## 23. Tooltips

```css
.tooltip {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-size: 12px;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
  max-width: 240px;
  z-index: 50;
  pointer-events: none;
}
```

---

## 24. Dialogs / Modals

```css
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dialog {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  max-width: 480px;
  width: 90%;
  box-shadow: var(--shadow-lg);
}
.dialog__title {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 600;
  margin-bottom: var(--space-4);
}
.dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-6);
}
```

---

## 25. Empty States

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
  text-align: center;
}
.empty-state__icon {
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-4);
}
.empty-state__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-2);
}
.empty-state__description {
  font-size: 13px;
  color: var(--color-text-secondary);
  max-width: 320px;
}
```

---

## 26. Loading States

### Skeleton Loader

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-bg-tertiary) 25%,
    var(--color-bg-quaternary) 50%,
    var(--color-bg-tertiary) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Spinner

```css
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 600ms linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### 3D Preview Loading

Show a centered spinner with "Compiling shaders..." or "Loading scene..." text over a dark background matching the viewport.

---

## 27. Error States

```css
.error-state {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
.error-state__title {
  color: #F87171;
  font-size: 13px;
  font-weight: 600;
}
.error-state__message {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-family: var(--font-mono);
  margin-top: var(--space-2);
  white-space: pre-wrap;
}
```

### Console Error Display

```css
.console-error {
  color: #F87171;
  font-family: var(--font-mono);
  font-size: 12px;
  padding: var(--space-1) 0;
}
.console-warning {
  color: #FBBF24;
  font-family: var(--font-mono);
  font-size: 12px;
}
.console-info {
  color: #60A5FA;
  font-family: var(--font-mono);
  font-size: 12px;
}
.console-success {
  color: #34D399;
  font-family: var(--font-mono);
  font-size: 12px;
}
```

---

## 28. Responsive Behavior

### Breakpoints

| Token | Width | Usage |
|-------|-------|-------|
| `--bp-sm` | 640px | Mobile landscape |
| `--bp-md` | 768px | Tablet |
| `--bp-lg` | 1024px | Small desktop |
| `--bp-xl` | 1280px | Desktop |
| `--bp-2xl` | 1536px | Large desktop |

### Layout Rules

| Breakpoint | Sidebar | Code/Preview | Layout |
|------------|---------|--------------|--------|
| < 768px | Hidden (toggleable) | Stacked | Single column |
| 768–1024px | Collapsed (icons) | Side by side | Two column |
| > 1024px | Expanded (280px) | Side by side | Full layout |

### Mobile Considerations

- Sidebar becomes a slide-out drawer
- Code editor stacks above 3D preview
- Command palette is full-width
- Navigation simplifies to back button + title

---

## 29. Accessibility

### Color Contrast

| Element | Ratio Required | Current |
|---------|----------------|---------|
| Body text on bg | 4.5:1 | `#E2E8F0` on `#0A0E1A` = 13.2:1 ✓ |
| Secondary text | 4.5:1 | `#94A3B8` on `#0A0E1A` = 6.8:1 ✓ |
| Interactive elements | 3:1 | `#6366F1` on `#0A0E1A` = 4.7:1 ✓ |
| Focus indicators | 3:1 | 2px accent outline on dark bg ✓ |

### ARIA Requirements

- All interactive elements must have accessible names
- Modals must trap focus and return focus on close
- Code editor must have `role="code"` and `aria-label`
- 3D canvas must have `aria-label="3D preview"` and descriptive `aria-roledescription`
- Progress must use `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Navigation landmarks must be properly tagged

---

## 30. Keyboard Navigation

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + B` | Toggle sidebar |
| `Cmd/Ctrl + Enter` | Run code |
| `Cmd/Ctrl + Shift + F` | Toggle fullscreen preview |
| `Escape` | Close modals/palette |
| `Tab` | Move to next interactive element |
| `Shift + Tab` | Move to previous element |

### Code Editor Shortcuts

| Shortcut | Action |
|----------|--------|
| `Tab` | Indent |
| `Shift + Tab` | Dedent |
| `Cmd/Ctrl + /` | Toggle comment |
| `Cmd/Ctrl + D` | Select next occurrence |
| `Alt + ↑/↓` | Move line up/down |

---

## 31. Focus States

```css
/* Global focus visible */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Skip link */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--color-accent);
  color: white;
  padding: var(--space-2) var(--space-4);
  z-index: 200;
  transition: top 150ms ease;
}
.skip-link:focus {
  top: 0;
}
```

---

## 32. Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .skeleton {
    animation: none;
  }
  .spinner {
    animation: none;
    border-color: var(--color-accent);
  }
}
```

---

## 33. Animation Guidelines

### Micro-interactions

| Element | Duration | Easing | Property |
|---------|----------|--------|----------|
| Hover states | 150ms | ease | background, color, border-color |
| Focus ring | 150ms | ease | outline-offset, box-shadow |
| Button press | 100ms | ease | transform (scale 0.98) |
| Tab switch | 150ms | ease | border-bottom-color |
| Sidebar expand | 200ms | ease | width |
| Modal open | 200ms | ease | opacity, transform |
| Tooltip appear | 100ms | ease | opacity |

### Principles

- Use `transform` and `opacity` only — never animate layout properties
- Respect `prefers-reduced-motion`
- 3D preview animations are handled by Three.js, not CSS
- Loading shimmer is the only continuous animation

---

## 34. Scene Hierarchy Panel

```css
.scene-hierarchy {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 12px;
  overflow-y: auto;
}
.scene-hierarchy__item {
  padding: var(--space-1) var(--space-2);
  padding-left: calc(var(--space-2) + var(--depth, 0) * 16px);
  display: flex;
  align-items: center;
  gap: var(--space-1);
  cursor: pointer;
}
.scene-hierarchy__item:hover {
  background: var(--color-bg-quaternary);
}
.scene-hierarchy__item.selected {
  background: rgba(99, 102, 241, 0.15);
}
```

---

## 35. Camera/Lighting/Material Controls

### Properties Panel

```css
.properties-panel {
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  width: 280px;
  overflow-y: auto;
  padding: var(--space-3);
}
.property-group {
  margin-bottom: var(--space-4);
}
.property-group__title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-2);
}
.property-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}
.property-row__label {
  font-size: 12px;
  color: var(--color-text-secondary);
  min-width: 80px;
}
.property-row__value {
  flex: 1;
}
```

---

## 36. Animation Timeline

```css
.timeline {
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  height: 120px;
  display: flex;
  flex-direction: column;
}
.timeline__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-subtle);
}
.timeline__track {
  flex: 1;
  position: relative;
  overflow-x: auto;
}
.timeline__playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--color-accent);
  z-index: 1;
}
```

---

## 37. Git/Commit History

```css
.git-history {
  font-family: var(--font-mono);
  font-size: 12px;
}
.git-commit {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border-subtle);
}
.git-commit__hash {
  color: var(--color-accent);
  cursor: pointer;
}
.git-commit__hash:hover {
  text-decoration: underline;
}
.git-commit__message {
  color: var(--color-text-primary);
}
.git-commit__author {
  color: var(--color-text-tertiary);
}
```

---

## 38. Code Diffs

```css
.diff {
  font-family: var(--font-mono);
  font-size: 13px;
}
.diff__line--added {
  background: rgba(34, 197, 94, 0.1);
  border-left: 3px solid var(--color-success);
}
.diff__line--removed {
  background: rgba(239, 68, 68, 0.1);
  border-left: 3px solid var(--color-error);
  text-decoration: line-through;
  opacity: 0.7;
}
.diff__line--context {
  border-left: 3px solid transparent;
}
```

---

## 39. Console Output Panel

```css
.console {
  background: var(--color-bg-code);
  border-top: 1px solid var(--color-border);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  max-height: 200px;
  overflow-y: auto;
  padding: var(--space-2) var(--space-3);
}
.console__line {
  padding: 1px 0;
}
.console__timestamp {
  color: var(--color-text-tertiary);
  margin-right: var(--space-2);
}
.console__clear {
  /* Clear button in console header */
}
```

---

## 40. Challenge/Solution Component

```css
.challenge {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-warning);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
.challenge__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: var(--space-2);
}
.challenge__description {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-4);
}
.challenge__hints {
  font-size: 12px;
  color: var(--color-text-tertiary);
}
.solution {
  border-left-color: var(--color-success);
}
```

---

## Pre-Delivery Checklist

- [ ] No emojis used as icons (use Lucide/Heroicons SVG instead)
- [ ] All icons from consistent set (Lucide recommended)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150ms)
- [ ] Text contrast 4.5:1 minimum in dark mode
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content behind fixed navbar
- [ ] No horizontal scroll on mobile
- [ ] Code blocks use monospace font
- [ ] 3D preview has accessible label
- [ ] Loading states for async operations
- [ ] Error states for failed operations
- [ ] Console output is accessible

---
---

## 41. Ultimate Synthesis & Precedence Rules

This document combines the two supplied Three.js Academy design-system sources.

### Source Precedence

1. **Page-specific rules win first:** When building a specific page, check
   `design-system/pages/[page-name].md`. If that file exists, its rules override
   this document.
2. **This Ultimate Skill is the project-wide default:** When no page-specific
   rules exist, follow this document.
3. **Prefer the more explicit rule when sources overlap:** The implementation
   should use the more detailed behavior, accessibility requirement, responsive
   rule, or component specification from the combined sources.
4. **Do not invent visual language:** Stay within the defined tokens, component
   patterns, interaction model, and technical-tool aesthetic.
5. **Performance is a product requirement:** UI motion must never compromise
   the Three.js preview's rendering performance.

### Canonical Product Direction

- Product: **Three.js Academy**
- Type: Interactive Three.js learning platform
- Stack: React + Next.js + Tailwind CSS + Three.js
- Audience: Beginner developers, intermediate frontend developers, advanced
  Three.js developers, creative developers, and WebGL learners
- Personality: Technical, precise, trustworthy, approachable
- Mood: Focused development environment
- Visual direction: Dark-mode-first, VS Code/GitHub/IDE-inspired,
  minimalist, Swiss, geometric, high-contrast, grid-based
- Design dials: Variance 3, Motion 3, Density 7
- Content-first: 3D preview and code are the heroes.

### Non-Negotiable UX Principles

- Progressive disclosure: expose complexity only when it is useful.
- Dense but organized developer-tool information architecture.
- Keyboard, screen-reader, touch, and reduced-motion support are first-class.
- Avoid decorative UI that does not communicate meaning or improve workflow.
- Preserve stable layouts: hover/focus/active states must not create layout shift.
- Use the defined design tokens instead of one-off colors, spacing, radii, or
  shadows.
- Prefer lightweight transitions and transform/opacity animation.
- Never let UI polish take priority over 3D rendering performance.

---

## 42. Master Anti-Patterns — Hard Prohibitions

Avoid all of the following unless a page-specific design explicitly requires
an exception:

- Excessive gradients — keep backgrounds flat and subtle.
- Excessive glassmorphism — use sparingly and primarily for overlays.
- Random neon colors — use the defined color tokens.
- Oversized rounded cards — developer tools use tight radii.
- Meaningless decorative blobs — every element must serve a purpose.
- Inconsistent spacing — use the spacing scale consistently.
- Low-contrast text — maintain at least a 4.5:1 ratio for normal text.
- Inaccessible controls — every interaction must be keyboard accessible.
- Unnecessary animation — animation must communicate meaning.
- Emoji as icons — use SVG icon sets such as Lucide or Heroicons.
- Placeholder-only form labels — use visible labels.
- Light mode as the default — dark mode is primary.
- Generic consumer-app styling that weakens the developer-tool identity.
- Excessive rounded/pill UI where compact IDE-style controls are appropriate.
- Animating layout properties when transform/opacity can achieve the same effect.
- Treating the 3D canvas as decoration rather than a primary learning surface.

---

## 43. Ultimate Pre-Delivery Checklist

### Visual Quality

- [ ] No emojis used as icons; use a consistent SVG icon set.
- [ ] Icons are visually consistent in weight and style.
- [ ] Brand/logo treatment is correct.
- [ ] Defined theme tokens are used instead of arbitrary values.
- [ ] Hover/focus states do not cause layout shift.
- [ ] Cards use tight developer-tool radii.
- [ ] Dark mode is the primary experience.
- [ ] Light mode remains readable and usable.

### Interaction

- [ ] Every clickable element communicates affordance.
- [ ] Clickable elements use `cursor-pointer` where appropriate.
- [ ] Hover states provide clear feedback.
- [ ] Transitions are generally in the 100–300ms range.
- [ ] Focus states are visible.
- [ ] Keyboard shortcuts are implemented and discoverable.
- [ ] Escape closes transient overlays where appropriate.
- [ ] Modal focus is trapped and restored correctly.
- [ ] Loading, success, empty, and error states are represented.

### Accessibility

- [ ] Normal text meets at least 4.5:1 contrast.
- [ ] Interactive elements have accessible names.
- [ ] Icon-only buttons have `aria-label`.
- [ ] Form inputs have visible labels.
- [ ] Images have meaningful alt text where required.
- [ ] Navigation landmarks are correctly identified.
- [ ] Tab order follows the visual/workflow order.
- [ ] Focus rings are visible.
- [ ] `prefers-reduced-motion` is respected.
- [ ] Color is never the sole means of communicating state.
- [ ] Code editor and 3D preview have appropriate accessible roles/labels.
- [ ] Progress indicators expose their current/min/max values.

### Responsive Layout

- [ ] Test at 375px.
- [ ] Test at 640px.
- [ ] Test at 768px.
- [ ] Test at 1024px.
- [ ] Test at 1280px.
- [ ] Test at 1440px.
- [ ] Test at 1536px where relevant.
- [ ] No horizontal scrolling on mobile.
- [ ] Sidebar becomes a drawer/toggleable surface on small screens.
- [ ] Code and preview stack appropriately on mobile.
- [ ] Touch targets are at least 44x44px on mobile.
- [ ] No content is hidden behind fixed navigation.

### Three.js / Developer-Tool Quality

- [ ] 3D preview loads without blocking the surrounding UI.
- [ ] FPS/performance status is visible and meaningful.
- [ ] Console output clearly distinguishes errors, warnings, info, and success.
- [ ] Code editor supports readable monospace presentation and syntax highlighting.
- [ ] Run action has loading/success/error states.
- [ ] Scene hierarchy is navigable and selection is obvious.
- [ ] Camera controls are intuitive: Orbit, Pan, Zoom, Reset, Fit All where relevant.
- [ ] Property controls are organized into compact labeled groups.
- [ ] Timeline/playhead behavior is clear where animation editing exists.
- [ ] Diff views clearly distinguish additions, removals, and context.
- [ ] Git/commit history remains compact and scannable.
- [ ] Challenges clearly separate task, hints, submission, and solution states.

### Performance

- [ ] Avoid unnecessary continuous CSS animations.
- [ ] Respect reduced motion.
- [ ] Prefer transform/opacity for UI animation.
- [ ] Do not add decorative effects that compete with the WebGL render budget.
- [ ] Keep 3D preview FPS higher priority than UI transition smoothness.
- [ ] Loading indicators communicate expensive work such as shader compilation
      or scene loading.

---

## 44. Implementation Contract

When generating UI from this skill:

1. Start from the information architecture, not decoration.
2. Apply the canonical tokens before adding component-specific styling.
3. Build the content, code, and 3D preview surfaces first.
4. Add navigation and progressive-disclosure controls around those surfaces.
5. Implement keyboard and accessibility behavior at the same time as visuals.
6. Implement responsive behavior before polishing desktop-only details.
7. Add loading/error/empty/success states before considering the feature complete.
8. Verify the pre-delivery checklist before shipping.
9. If a page-specific design-system file exists, follow it over this document.
10. If two rules appear to conflict, choose the rule that is more explicit and
    more accessible, unless the page-specific file says otherwise.

### Definition of Done

A Three.js Academy interface is complete only when it is:

- visually consistent with the IDE/developer-tool aesthetic,
- token-driven,
- keyboard accessible,
- responsive,
- reduced-motion aware,
- explicit about loading and errors,
- performant for the 3D preview,
- and verified against the Ultimate Pre-Delivery Checklist.