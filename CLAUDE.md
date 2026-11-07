# CLAUDE.md

## Project
SEA Crossing Line: Indonesian-language interactive atlas of Southeast Asia's railways (active, disused, reactivation, colonial). Stack: TanStack Start + React 19 + MapLibre GL + Tailwind 4 + zod. Data: static GeoJSON in public/data. UI strings in src/components/atlas/atlas-i18n.ts.

## Rules
- Make small, focused changes. Touch only files the task needs.
- Never invent data. Every feature in public/data must come from a cited source or a documented script.
- The data validator (src/components/atlas/atlas-data.ts) only accepts LineString for rail files and Polygon/MultiPolygon for land. Explode MultiLineString before writing.
- All UI text goes through atlas-i18n.ts (id + en).
- Colors in styles.css must be oklch tokens; no hard-coded hex in components or map-canvas palette.
- Respect prefers-reduced-motion.
- After each task: run `bun run test` and `bun run build`, fix failures, then summarize what changed in 5 lines or fewer.
- Do not edit .lovable/ or any file whose header says it is generated.
- Keep raw downloads in data-raw/ (gitignored). Only processed output goes to public/data.
