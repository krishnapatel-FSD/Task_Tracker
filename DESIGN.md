# Task Tracker design system

The task list reads like a timetable: work ordered by when it is due, with a yellow "now" line between what is past and what is coming. The look borrows from station signage: an ink header band, a cool white ground and one signal yellow.

Source of truth: `client/src/styles.css` (tokens on `:root`, dark values under `prefers-color-scheme: dark`).

## Colour

Restrained palette. Colour only does a job: focus, state, lateness, or identifying a person.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ground` | `#f3f4f7` | `#0d121b` | Page background |
| `--surface` | `#ffffff` | `#141a25` | Rows, panels, inputs |
| `--sunken` | `#eceef2` | `#1a2130` | Segmented control track, "To do" status, skeletons |
| `--ink` / `--ink-2` / `--ink-3` | `#141c2e` / `#465065` / `#636c80` | `#e8ebf1` / `#aab2c2` / `#8c95a8` | Text, in three steps (all at least 4.5:1 on surface) |
| `--band` | `#141c2e` | `#1b2539` | Header band, login panel |
| `--signal` | `#f5c518` | same | **The one accent.** Focus ring, text selection, "Today" line, new-task panel edge, row flash. Never used for text on white. |
| `--late` | `#b42318` | `#ff8f80` | Overdue dates, errors |
| `--done` / `--done-soft` | `#2c6a4a` / `#e2f0e7` | `#86d3a6` / `#16291f` | "Done" status |
| `--progress-ink` / `--progress-soft` | `#5c4600` / `#fdf1c2` | `#f7d65a` / `#3b3112` | "In progress" status |
| `--line-0` to `--line-7` | rust, blue, green, ochre, violet, teal, magenta, slate | lighter equivalents | Each employee's "line colour", shown as a 4px swatch beside their name (admin only) |

## Type

One family: **Archivo Variable** (self-hosted via `@fontsource-variable/archivo`, width axis 62 to 125%). Width does the work a second typeface would:

- Condensed (75 to 82%), weight 700 to 750: page titles, dates in the timetable, login statement, wordmark.
- Normal width: everything people read or click.
- Tabular figures everywhere (`font-variant-numeric: tabular-nums` on `body`).

Fixed rem scale, ratio about 1.2: 12 / 13 / 15 (body) / 18 / 26px.

## Shape and depth

- Corners: 4px for controls (`--radius-control`), 6px for panels and row groups (`--radius-panel`). Nothing is pill-shaped.
- One shadow (`--shadow-panel`), tinted with the ink colour, used on row groups and the composer only.
- Rows are separated by a single 1px hairline. The column header sits on a 2px ink rule.

## Components

- **Timetable** (`components/Timetable.tsx`): groups Past due date / Due today / This week / Next week / Later (weeks run Monday to Sunday). Lead column is the condensed date plus a relative label ("In 6 days", "1 day late" in red). Titles expand the full description. The "Today" line sits after the past group.
- **Status select**: native `<select>` tinted by status. On change the row flashes signal-soft for 1.6s.
- **Priority**: three ascending bars plus the word. High is set in ink and bold.
- **Segmented control**: real radio inputs drawn as one strip (status filter, composer priority).
- **Composer** (`components/TaskComposer.tsx`): inline panel that opens above the list (no modal). Field errors sit under each field. Uses `overflow: clip` so focus can never scroll the collapsed panel.
- **Buttons**: primary (ink fill), quiet (outline), link (underlined text), on-band (outline on the header).
- **Focus**: 2px yellow ring hugging the control with a 2px ink ring outside it, readable on white and on the band.
- **Empty states** say what will appear and how; filtered-empty offers "Clear filters". Loading uses skeleton rows.

## Motion

150 to 250ms, exponential ease-out, only for state: composer open and close, row flash, hover and press (1px press-down). Everything collapses under `prefers-reduced-motion`.

## Don'ts

No modals for simple tasks, no pill badges, no coloured card edges, no gradients, no em or en dashes in copy, no icon set other than Phosphor (bold weight), no second accent colour.
