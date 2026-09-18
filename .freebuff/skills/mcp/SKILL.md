---
name: mcp-21st
description: "21st.dev MCP integration for UI component generation, search, install, and publish. Tools: generate, iterate, search, install, publish, theme. Integrates with UI/UX Pro Max for design system workflow."
---

# 21st.dev MCP - UI Component Toolkit

MCP (Model Context Protocol) server integration for 21st.dev. Provides AI-powered UI component generation, catalog search, and publishing tools.

## When to Apply

Use this skill when:
- **Generating UI components** from natural language descriptions
- **Searching** the 21st.dev catalog for existing components
- **Installing** components into your project
- **Iterating** on generated components with follow-up prompts
- **Publishing** your own components to the catalog
- **Managing themes** for consistent design systems

## Prerequisites

1. **API Key**: Already configured in `.freebuff/mcp.json`
2. **MCP Client**: Your editor/agent must connect to `https://21st.dev/api/mcp`

## Available Tools

| Tool | Description | Example Use |
|------|-------------|-------------|
| `generate` | Create UI components from text prompts | "Generate a pricing card with glassmorphism" |
| `iterate` | Refine existing components | "Make the button larger and add hover animation" |
| `search` | Find components in 21st.dev catalog | "Search for dashboard sidebar components" |
| `install` | Add components to your project | "Install this component into src/components" |
| `publish` | Share your components | "Publish my button component" |
| `theme` | Create/manage design themes | "Create a dark theme for the project" |

## Workflow: Generate + UI/UX Pro Max

For best results, combine MCP generation with the UI/UX Pro Max design system:

### Step 1: Generate Design System (UI/UX Pro Max)
```bash
python3 .freebuff/skills/ui-ux-pro-max/scripts/search.py "saas dashboard dark" --design-system -p "My App"
```

### Step 2: Generate Components (MCP)
Use the generated design system colors, typography, and patterns in your MCP prompts:

```
Generate a dashboard card component using:
- Colors: slate-900 background, blue-500 accent
- Typography: Inter font, text-lg for headings
- Style: glassmorphism with subtle border
```

### Step 3: Iterate
```
Make the card responsive for mobile, add a loading skeleton state
```

## MCP Prompt Templates

### Component Generation
```
Generate a [component type] with [style] style:
- Purpose: [what it does]
- Colors: [color scheme]
- Size: [dimensions]
- States: [hover, active, disabled]
```

### Search & Install
```
Search for [component category] components that are:
- Compatible with [framework: React/Vue/HTML]
- Style: [minimal/glassmorphism/brutalist]
- Install the best match into [directory]
```

### Theme Creation
```
Create a theme for [product type] with:
- Primary: [color]
- Secondary: [color]
- Accent: [color]
- Dark mode: [yes/no]
```

## Integration with UI/UX Pro Max

The MCP skill works best alongside `ui-ux-pro-max`:

| UI/UX Pro Max | MCP | Result |
|---------------|-----|--------|
| `--design-system` | `generate` | Components match design system |
| `--domain style` | `iterate` | Style-accurate refinements |
| `--stack react` | `install` | Framework-specific output |
| `--domain ux` | `generate` | UX-compliant components |

## Tips

1. **Be specific** - Include colors, sizes, and behaviors in prompts
2. **Use design system** - Reference your design system values for consistency
3. **Iterate** - Start simple, refine with follow-up prompts
4. **Check UX rules** - Review generated components against UX guidelines
5. **Publish winners** - Share your best components with the community

## Common Patterns

### Landing Page Section
```
Generate a hero section with:
- Full-width gradient background
- Centered heading (text-5xl, font-bold)
- Subtitle (text-xl, text-gray-400)
- CTA button (primary color, rounded-lg)
- Responsive: stack on mobile
```

### Dashboard Widget
```
Generate a stats card showing:
- Icon (Lucide icon)
- Value (text-3xl, font-bold)
- Label (text-sm, text-muted)
- Trend indicator (up/down arrow)
- Glass border effect
```

### Form Component
```
Generate a login form with:
- Email input with icon
- Password input with show/hide toggle
- Submit button with loading state
- Error message styling
- Accessible labels
```
