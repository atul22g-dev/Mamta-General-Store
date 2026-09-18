---
name: freebuff-unified
description: "Unified Freebuff toolkit combining ALL skills and MCP: UI/UX design intelligence (67 styles, 96 palettes, 57 fonts), AI component generation (21st.dev MCP), Three.js Academy design system, and UX best practices. Actions: create, build, design, generate, modernize, update, refresh, redesign, refactor, review, fix, improve, optimize, enhance. Use for: landing pages, dashboards, components, forms, cards, 3D learning platforms, modernize old UI, upgrade legacy design, any UI/UX task."
---

# 🎯 Freebuff Unified — All Skills + MCP

One skill to rule them all. Combines **design intelligence**, **AI component generation**, **3D platform design**, and **UX best practices** into a single unified workflow.

## What's Included

| Skill | Purpose | Capabilities |
|-------|---------|-------------|
| **UI/UX Pro Max** | Design intelligence | 67 styles, 96 palettes, 57 font pairings, 25 charts, 13 stacks |
| **MCP 21st.dev** | AI component generation | Generate, iterate, search, install, publish components |
| **Three.js Academy** | 3D platform design system | Dark-mode-first, developer-tool aesthetic, code editor UI |
| **UX Guidelines** | Best practices | Accessibility, performance, touch, animation, layout |

---

## 🚀 Quick Start

**Just say what you want:**

```
Build a landing page for a SaaS app
Create a pricing card with glassmorphism
Make a dashboard with dark mode
Modernize this old design
Build a Three.js learning platform
Generate a hero section
```

The agent automatically:
1. Detects the right skill(s) to use
2. Generates a design system
3. Creates components via MCP
4. Applies UX best practices

---

## 🔄 Unified Workflow

### Flow: Design → Generate → Build → Validate

```
User Request
     ↓
┌─────────────────────────────────────────┐
│ 1. Skill Detection                      │  ← Auto-detect which skills to use
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ 2. Design System                        │  ← UI/UX Pro Max (styles, colors, fonts)
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ 3. Generate Code                        │  ← MCP 21st.dev (AI component generation)
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ 4. Refine & Fix                         │  ← UX guidelines + iteration
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│ 5. Validate                             │  ← Accessibility, contrast, responsive
└─────────────────────────────────────────┘
     ↓
  Final UI Code
```

---

## 🎨 Skill 1: UI/UX Pro Max — Design Intelligence

### Generate Design System (REQUIRED for new projects)

```bash
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "<product> <industry> <keywords>" --design-system -p "Project Name"
```

**Examples:**
```bash
# SaaS landing page
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "saas product tech" --design-system -p "My SaaS"

# Healthcare dashboard
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "healthcare dashboard" --design-system -p "MedApp"

# E-commerce store
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "ecommerce store fashion" --design-system -p "FashionShop"

# Three.js learning platform
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "developer tool education 3d" --design-system -p "Three.js Academy"
```

### Persist Design System (Master + Overrides)

```bash
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name"
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name" --page "dashboard"
```

### Domain Searches

| Need | Command |
|------|---------|
| Style options | `--domain style "glassmorphism dark"` |
| Color palettes | `--domain color "saas tech"` |
| Typography | `--domain typography "elegant luxury"` |
| Chart types | `--domain chart "real-time dashboard"` |
| UX practices | `--domain ux "animation accessibility"` |
| Landing structure | `--domain landing "hero social-proof"` |

### Stack-Specific Guidance

```bash
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "<keywords>" --stack <stack>
```

**Available stacks:** `html-tailwind`, `react`, `nextjs`, `vue`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose`

---

## ⚡ Skill 2: MCP 21st.dev — AI Component Generation

### Available MCP Tools

| Tool | When to Use | Example |
|------|-------------|---------|
| `generate` | Create new components from text | "Generate a pricing card with glassmorphism" |
| `iterate` | Refine existing components | "Make the button larger and add hover animation" |
| `search` | Find components in catalog | "Search for dashboard sidebar components" |
| `install` | Add components to project | "Install this component into src/components" |
| `publish` | Share your components | "Publish my button component" |
| `theme` | Create/manage themes | "Create a dark theme for the project" |

### MCP + Design System Integration

For best results, combine MCP generation with the design system:

```
Generate a dashboard card component using:
- Colors: slate-900 background, blue-500 accent
- Typography: Inter font, text-lg for headings
- Style: glassmorphism with subtle border
- Responsive: stack on mobile
```

### MCP Prompt Templates

**Component Generation:**
```
Generate a [component type] with [style] style:
- Purpose: [what it does]
- Colors: [color scheme]
- Size: [dimensions]
- States: [hover, active, disabled]
```

**Search & Install:**
```
Search for [component category] components that are:
- Compatible with [framework: React/Vue/HTML]
- Style: [minimal/glassmorphism/brutalist]
- Install the best match into [directory]
```

**Theme Creation:**
```
Create a theme for [product type] with:
- Primary: [color]
- Secondary: [color]
- Accent: [color]
- Dark mode: [yes/no]
```

---

## 🎮 Skill 3: Three.js Academy — 3D Platform Design System

### When to Apply

Use this design system when building:
- Interactive learning platforms
- Code editor UIs
- 3D preview panels
- Developer tools
- Dark-mode-first applications

### Design Principles

1. **Content-first:** The 3D preview and code are the heroes
2. **Progressive disclosure:** Show what's needed now
3. **Consistent density:** Developer tools pack information densely
4. **Accessible by default:** Keyboard, screen reader, reduced motion
5. **Dark by design:** Dark theme is primary
6. **Performance-aware:** 3D FPS matters more than UI transitions

### Color Tokens

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-bg-primary` | `#0A0E1A` | Main background |
| `--color-bg-secondary` | `#0F1629` | Sidebar, panels |
| `--color-bg-tertiary` | `#151D33` | Cards, elevated surfaces |
| `--color-bg-quaternary` | `#1A2340` | Hover states, active items |
| `--color-bg-code` | `#0D1117` | Code editor background |
| `--color-accent` | `#6366F1` | Primary actions (Indigo) |
| `--color-success` | `#22C55E` | Run, completion |
| `--color-warning` | `#F59E0B` | Warnings |
| `--color-error` | `#EF4444` | Errors, advanced |

### Typography

- **Headings:** JetBrains Mono (technical, code-aligned)
- **Body:** IBM Plex Sans (clean, readable)
- **Code:** JetBrains Mono (monospace, ligatures)

### Component Patterns

- **Buttons:** Primary (green), Secondary (border), Ghost (navigation), Icon
- **Cards:** Lesson, Project, Code cards with hover states
- **Navigation:** 48px navbar, 280px collapsible sidebar
- **Code Editor:** Line numbers, syntax highlighting, action bar
- **3D Preview:** Canvas with viewport controls, FPS badge

---

## 📋 Skill 4: UX Guidelines — Best Practices

### Critical Rules (Auto-Applied)

| Priority | Rule | Check |
|----------|------|-------|
| 1 | Color contrast 4.5:1 | `--domain ux "accessibility"` |
| 2 | Touch targets 44x44px | `--domain ux "touch target"` |
| 3 | Cursor pointer on clickable | `cursor-pointer` class |
| 4 | Hover transitions 150-300ms | `transition-colors duration-200` |
| 5 | Focus rings for keyboard | `focus-visible:ring-2` |
| 6 | Responsive at 375/768/1024px | Responsive breakpoints |
| 7 | No emoji icons | Use SVG (Lucide/Heroicons) |
| 8 | prefers-reduced-motion | Respect motion preferences |

### Visual Quality Checklist

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] Hover states don't cause layout shift
- [ ] Light mode text has sufficient contrast
- [ ] Glass/transparent elements visible in light mode
- [ ] Borders visible in both light/dark modes
- [ ] Floating elements have proper spacing from edges
- [ ] No content hidden behind fixed navbars
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile

---

## 🔧 Complete Usage Examples

### Example 1: Build a Landing Page

**User:** "Build a landing page for a fitness app"

**Agent workflow:**
```bash
# Step 1: Generate design system
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "fitness app health" --design-system -p "FitApp"

# Step 2: Get landing page patterns
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "hero social-proof" --domain landing

# Step 3: Get UX guidelines
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "animation accessibility" --domain ux

# Step 4: Generate components via MCP
# Agent creates: hero, features, testimonials, CTA sections

# Step 5: Validate
# Agent checks accessibility, contrast, responsiveness
```

### Example 2: Create a Pricing Card

**User:** "Create a glassmorphism pricing card"

**Agent workflow:**
```bash
# Step 1: Get glassmorphism style
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "glassmorphism card" --domain style

# Step 2: Get color palette
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "saas pricing" --domain color

# Step 3: Generate via MCP
# Agent creates: glass card with pricing tiers, hover effects

# Step 4: Apply UX checklist
# cursor-pointer, hover states, responsive
```

### Example 3: Build a Three.js Learning Platform

**User:** "Build a Three.js learning platform"

**Agent workflow:**
```bash
# Step 1: Use Three.js Academy design system
# (auto-detected from project context)

# Step 2: Get developer tool patterns
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "developer tool dark mode" --design-system -p "Three.js Academy"

# Step 3: Get code editor patterns
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "code editor" --domain style

# Step 4: Generate components via MCP
# Agent builds: sidebar, code editor, 3D preview, lesson cards

# Step 5: Apply Three.js Academy design tokens
# Agent uses --color-bg-primary, --font-mono, etc.
```

### Example 4: Modernize Old Design

**User:** "Modernize this old landing page"

**Agent workflow:**
```bash
# Step 1: Read old code and audit issues
# Agent identifies: outdated colors, small fonts, no spacing

# Step 2: Generate modern design system
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "modern saas landing minimal" --design-system -p "Modernized App"

# Step 3: Get modern patterns
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "modern hero minimalism" --domain style

# Step 4: Rebuild with MCP
# Agent generates modern version with new design system

# Step 5: Validate
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "accessibility contrast" --domain ux
```

### Example 5: Modernize Full Project

**User:** "Modernize this full project with glassmorphism"

**Agent workflow:**
```bash
# Step 1: Scan project
find . -name "*.html" -o -name "*.css" -o -name "*.tsx" -o -name "*.vue"

# Step 2: Generate global design system
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "glassmorphism saas" --design-system --persist -p "ProjectName"

# Step 3: Update each file (one by one)
# - Global styles first
# - Layout components
# - Page templates
# - Feature components

# Step 4: Verify consistency
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "z-index consistency" --domain ux
```

---

## 📊 Available Resources

### Styles (67 total)

| Category | Options |
|----------|---------|
| **Modern** | glassmorphism, neumorphism, bento grid, minimalism |
| **Bold** | brutalism, claymorphism, skeuomorphism |
| **Dark** | dark mode, midnight, carbon |
| **Classic** | flat design, material, fluent |

### Colors (96 palettes)

| Industry | Palettes |
|----------|----------|
| SaaS | tech, startup, enterprise |
| Healthcare | medical, wellness, fitness |
| Finance | banking, crypto, insurance |
| E-commerce | fashion, food, luxury |
| Education | learning, kids, professional |

### Fonts (57 pairings)

| Style | Examples |
|-------|----------|
| Modern | Inter + Inter, Poppins + Open Sans |
| Elegant | Playfair Display + Lato, Cormorant + Montserrat |
| Bold | Space Grotesk + DM Sans, Outfit + Work Sans |
| Mono | JetBrains Mono + Inter, Fira Code + Open Sans |

### Charts (25 types)

Trend, comparison, timeline, funnel, pie, bar, line, area, scatter, heatmap, and more.

---

## 🏗️ Project Types

| Type | Skills Used |
|------|-------------|
| **Landing Page** | UI/UX Pro Max + MCP + UX |
| **Dashboard** | UI/UX Pro Max + MCP + UX |
| **Component Library** | MCP + UI/UX Pro Max |
| **3D Platform** | Three.js Academy + MCP + UI/UX Pro Max |
| **Mobile App** | UI/UX Pro Max (flutter/swiftui) + UX |
| **E-commerce** | UI/UX Pro Max + MCP + UX |
| **Full Project Modernize** | All skills combined |

---

## 💡 Tips

1. **Be specific** — "Glassmorphism pricing card with blue accent" > "Make a card"
2. **Mention stack** — "React component" or "HTML with Tailwind"
3. **Include states** — "With hover, loading, and error states"
4. **Reference industry** — "Healthcare SaaS" gets appropriate colors
5. **Iterate** — "Make it more minimal" or "Add dark mode"
6. **Save progress** — Use `--persist` to save design system
7. **Full project** — Say "Modernize full project" and specify style
8. **3D platforms** — Three.js Academy design system auto-applies
9. **Combine skills** — Agent auto-detects which skills to use
10. **Validate always** — UX checklist auto-applied before delivery

---

## 🔍 Troubleshooting

### Python not found
```bash
# macOS
brew install python3

# Ubuntu/Debian
sudo apt update && sudo apt install python3

# Windows
winget install Python.Python.3.12
```

### Design system not generating
```bash
# Check Python is available
python3 --version

# Check script exists
ls -la .freebuff/skills/ui-ux-pro-max/scripts/search.py
```

### MCP not working
1. Check `.freebuff/mcp.json` exists
2. Verify API key is valid
3. Ensure MCP client is connected to `https://21st.dev/api/mcp`

---

## 📁 File Structure

```
.freebuff/
├── mcp.json                          # MCP server config (21st.dev)
├── skills/
│   ├── skills/
│   │   └── SKILL.md                  # ★ THIS FILE (Unified Master)
│   ├── mcp/
│   │   └── SKILL.md                  # MCP documentation
│   ├── ui-ux-pro-max/
│   │   ├── SKILL.md                  # Design system docs
│   │   ├── data/                     # Search databases
│   │   │   ├── colors.csv
│   │   │   ├── styles.csv
│   │   │   ├── typography.csv
│   │   │   ├── ux-guidelines.csv
│   │   │   ├── charts.csv
│   │   │   ├── landing.csv
│   │   │   ├── products.csv
│   │   │   ├── icons.csv
│   │   │   ├── react-performance.csv
│   │   │   ├── web-interface.csv
│   │   │   ├── ui-reasoning.csv
│   │   │   └── stacks/
│   │   ├── references/               # Additional references
│   │   └── scripts/                  # Python tools
│   │       ├── search.py             # Main search tool
│   │       ├── design_system.py      # Design system generator
│   │       └── core.py               # Core utilities
│   └── three.js-academy/
│       └── SKILL.md                  # 3D platform design system
└── Usage.md                          # Usage guide
```

---

## 🎯 Quick Commands Reference

| What You Want | What to Say |
|---------------|-------------|
| Landing page | "Build a landing page for [product]" |
| Dashboard | "Create a dashboard with [features]" |
| Component | "Make a [component] with [style]" |
| Form | "Design a [form type] form" |
| 3D platform | "Build a Three.js learning platform" |
| Modernize | "Modernize this [page type]" |
| Full project | "Modernize this full project with [style]" |
| Add dark mode | "Add dark mode to this" |
| Glassmorphism | "Create a glassmorphism [component]" |
| Brutalism | "Make a brutalist [component]" |

---

**Remember:** The agent auto-detects which skills to use. Just describe what you want, and the unified system handles the rest! 🚀
