---
name: Task Tracker
description: Calm surfaces. White cards float on a pale page; colour only marks meaning.
colors:
  ground: "#f7f9fb"
  surface: "#ffffff"
  sunken: "#f2f4f6"
  container: "#eceef0"
  container-high: "#e6e8ea"
  rule: "#eceef0"
  rule-strong: "#c6c6cd"
  ink: "#191c1e"
  ink-2: "#45464d"
  ink-3: "#5d5f66"
  accent: "#131b2e"
  accent-hover: "#2a3349"
  on-accent: "#ffffff"
  lit: "#0051d5"
  lit-ink: "#003ea8"
  lit-tint: "#dbe1ff"
  lit-soft: "#f3f6ff"
  late: "#ba1a1a"
  late-ink: "#93000a"
  late-soft: "#ffdad6"
  done: "#146c2e"
  done-ink: "#0f5c26"
  done-soft: "#d7f0dc"
  todo-dot: "#76777d"
  line-0: "#316bf3"
  line-1: "#00875a"
  line-2: "#a3307f"
  line-3: "#b06a12"
  line-4: "#00788a"
  line-5: "#7d36c9"
  line-6: "#5a7d12"
  line-7: "#56607a"
typography:
  display:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 2.75rem)"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.022em"
  figure:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.018em"
    fontFeature: "\"tnum\""
  title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.014em"
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.006em"
  body-sm:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.06em"
rounded:
  control: "8px"
  panel: "12px"
  pill: "9999px"
spacing:
  xs: "0.4rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: "0 0.9rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 0.9rem"
    height: "2.25rem"
  button-quiet-hover:
    backgroundColor: "{colors.sunken}"
  filter-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "0 0.85rem"
    height: "2rem"
  filter-chip-hover:
    backgroundColor: "{colors.container}"
    textColor: "{colors.ink}"
  filter-chip-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  count-pill:
    backgroundColor: "{colors.container}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "0.05rem 0.4rem"
  status-todo:
    backgroundColor: "{colors.container}"
    textColor: "{colors.ink-2}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0.18rem 0.55rem"
  status-in-progress:
    backgroundColor: "{colors.lit-tint}"
    textColor: "{colors.lit-ink}"
    rounded: "{rounded.pill}"
    padding: "0.18rem 0.55rem"
  status-done:
    backgroundColor: "{colors.done-soft}"
    textColor: "{colors.done-ink}"
    rounded: "{rounded.pill}"
    padding: "0.18rem 0.55rem"
  status-late:
    backgroundColor: "{colors.late-soft}"
    textColor: "{colors.late-ink}"
    rounded: "{rounded.pill}"
    padding: "0.18rem 0.55rem"
  changed-tag:
    backgroundColor: "{colors.lit-tint}"
    textColor: "{colors.lit}"
    rounded: "{rounded.pill}"
    padding: "0.12rem 0.5rem"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "1rem"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.75rem"
    height: "2.5rem"
  nav-link:
    textColor: "{colors.ink-2}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "2.5rem"
  nav-link-active:
    backgroundColor: "{colors.container-high}"
    textColor: "{colors.ink}"
  change-bar:
    backgroundColor: "{colors.lit-tint}"
    textColor: "{colors.lit-ink}"
    rounded: "{rounded.panel}"
    padding: "0.5rem 0.5rem 0.5rem 0.6rem"
---

# Design System: Task Tracker

## Overview

**Creative North Star: "Calm Surfaces"**

A quiet, familiar task app for office staff who keep it open all day. The page is a pale blue grey; content sits on white cards with rounded corners and a barely there shadow, so the surfaces seem to float rather than be fenced in. Nothing is decorated. Colour appears only where it means something: blue for what changed since you last looked, red for late, green for done, and a small coloured dot that names each project.

Density is moderate and legible rather than packed: one family (Inter), a small and tight type scale, full pill chips and badges, and navy black for every action that moves work forward. Dark mode keeps the same structure, swapping the navy for a near white and the blue for a pale periwinkle.

The world was pinned by the user's own reference design after two earlier directions were rejected. It explicitly refuses heavy colour blocks, black bands and costume type.

**Key Characteristics:**
- Pale ground, white floating cards, no borders on primary surfaces.
- Colour is a signal, never a decoration.
- One typeface, Inter, at small sizes with slightly negative tracking.
- Three radii only: controls, panels, pills.
- Navy black actions; blue reserved for "changed, new for you".

## Colors

A near monochrome cool grey system with four semantic signals and an eight hue project palette used only as dots.

### Primary
- **Navy Ink** (accent): every primary action. Fills primary buttons, the active filter chip, the checked status option, the logo tile, the user avatar and the progress bar fill on project cards. Hover lifts to **Slate Navy** (accent-hover). In dark mode it inverts to a near white with dark text.

### Secondary
- **Changed Blue** (lit): the single meaning of blue is "this changed since you last looked". Icon colour in the change banner, text of the "Show them" action, the changed tag on rows and cards, the dot before upcoming groups, and the chart "this week" line. **Pale Periwinkle** (lit-tint) is its pill and banner fill; **Deep Blue** (lit-ink) is its text on tint; **Mist** (lit-soft) washes a changed row. In progress status reuses the same blue pair.

### Tertiary
- **Late Red** (late): overdue and only overdue. Late dates, late status pills on **Blush** (late-soft) with **Oxblood** text (late-ink), late counts, danger buttons and the overdue group dot.
- **Done Green** (done): the checked Done option and the done status pill on **Pale Mint** (done-soft) with **Forest** text (done-ink).

### Neutral
- **Pale Slate Ground** (ground): the page and the sidebar; the panel column also sits on it.
- **White** (surface): cards, the board, inputs, quiet buttons and filter chips.
- **Mist Grey** (sunken): row selection and hover, the progress block inside project cards, the segmented control track.
- **Fog** (container) and **Cloud** (container-high): count pills, hairline row dividers, and the current nav item.
- **Graphite** (ink), **Iron** (ink-2), **Pewter** (ink-3): primary text, secondary text, and labels or metadata.
- **Steel Hairline** (rule-strong): input hover border, dashed empty and dropzone borders, unselected status options.
- **Project dots** (line-0 to line-7): blue, green, plum, amber, teal, violet, olive, slate. One per project, as a 0.55rem dot beside the project name, as a tint behind avatar initials, and as chart series. Never as a fill for anything larger.

### Named Rules
**The Meaning Only Rule.** Every non grey pixel answers a question: is it changed (blue), late (red), done (green), or which project (dot)? If a colour answers none of these, it is grey.

**The Blue Is News Rule.** Blue never fills a button. It is reserved for change and progress so that "new for you" stays unmistakable.

**The Never By Colour Alone Rule.** Late, done and changed always carry a word or an icon with the colour: "Late" with a warning icon, "1 new", a struck through title for done.

## Typography

**Display Font:** Inter Variable (with Inter, system-ui, sans-serif)
**Body Font:** Inter Variable (same family)

**Character:** One neutral grotesque used at small, slightly tight sizes. Hierarchy comes from size and a narrow weight range (400 to 650), not from a second face.

### Hierarchy
- **Display** (600, clamp(2rem, 3.4vw, 2.75rem), 1.12): the login statement only, max 14ch, balanced.
- **Headline** (600, 1.625rem, 1.25, -0.022em): page titles and the task title in the panel.
- **Figure** (600, 1.375rem, 1.1, tabular): the due date on the task panel.
- **Title** (600, 1.0625rem, 1.3, -0.014em): project card names, group titles on the board, the day number in board rows (tabular).
- **Body** (400 to 500, 0.875rem, 1.5): default text, row titles, nav links, inputs.
- **Body small** (500 to 600, 0.8125rem): buttons, filter chips, field labels, card descriptions.
- **Caption** (500, 0.75rem): metadata, status pills, month and relative date.
- **Label** (600, 0.6875rem, 0.06em, uppercase): column heads on the board, field names in the task panel, panel section heads, the page count pill and the project state on cards. Always names the data directly beneath or beside it.

### Named Rules
**The Narrow Weight Rule.** Weights stay between 400 and 650; titles are 600, not bold. Emphasis is a step in size or a shift from ink-3 to ink, not a heavier face.

**The Tabular Dates Rule.** Day numbers and counts use tabular figures so columns of dates align.

## Layout

A fixed 236px sidebar on the left and a centred main column (max 72rem for pages, 78rem for task boards, 80rem wide pages). Pages pad 2rem top and sides and stack sections with a 1.25rem gap. When a task is opened, the board shares the row with a 440px task panel on the right, sticky to the viewport.

The project home is an auto fill grid of cards (min 18rem, 0.75rem gap). Task boards are a single white card holding a fixed column grid: Date, Task, Assigned to, Status, Next step on All tasks; Task, Assigned to, Date, Status, Next step on a project page. Rows are at least 3.75rem tall with 1rem side padding and a 1rem column gap.

Responsive: below 900px the sidebar becomes a translucent top bar plus a bottom tab bar, page padding drops to 1.25rem by 1rem, and the task panel covers the screen with a back button. The board responds to its own width through container queries: under 760px the column header hides and rows reflow into a two line grid (date on the left; title and action; status and initials); under 440px the day number shrinks and titles clamp to three lines. Filter chips scroll sideways on narrow widths instead of wrapping.

## Elevation & Depth

Depth is ambient and quiet. Primary surfaces lift off the pale ground with a soft two layer shadow and no border; hover deepens it slightly. Floating menus get a longer shadow plus a hairline ring. Within cards, depth is tonal: a sunken grey block holds progress, a grey row marks selection.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 2px rgb(0 0 0 / 5%), 0 1px 3px rgb(0 0 0 / 4%)`): cards, the board, inputs, quiet buttons, filter chips, the change banner's white button.
- **Hover** (`box-shadow: 0 4px 12px -2px rgb(0 0 0 / 8%), 0 2px 4px rgb(0 0 0 / 4%)`): project card hover.
- **Float** (`box-shadow: 0 12px 32px -10px rgb(0 0 0 / 18%), 0 0 0 1px var(--rule)`): the phone account menu.
- **Toast** (`box-shadow: 0 10px 28px -8px rgb(0 0 0 / 35%)`): the dark undo toast.

### Named Rules
**The Floating Card Rule.** A surface separates from the ground by the panel shadow, not by a border. Hairlines are for dividing rows inside a card.

## Shapes

Soft, consistent geometry with three radii: gently rounded controls (8px) for buttons, inputs, nav items and inner blocks; rounded panels (12px) for cards, the board, the task panel card and the change banner; full pills for filter chips, count pills, status badges, tags and icon buttons. Project identity is a small circle. Dividers are 1px hairlines in the container grey. Dashed 1px or 1.5px borders mean "empty" or "drop here".

### Named Rules
**The Three Radii Rule.** 8px, 12px or pill. Nothing else.

## Components

### Buttons
Calm, solid, unshowy.
- **Shape:** gently rounded (8px), 2.25rem tall; large 2.875rem.
- **Primary:** navy fill, white text, 600 weight at 0.8125rem, panel shadow. Used for "Mark done", "New task", "Mark as done".
- **Hover / Focus:** fill lifts to slate navy over 150ms; press scales to 0.98; focus is a 2px navy outline offset 2px.
- **Quiet:** white with panel shadow and ink text; hover to mist grey. **Danger quiet:** white with red text, hover to blush. **Link:** navy text, underline on hover. **Icon button:** 2.25rem round, ink-2, fog fill on hover.

### Chips
- **Filter chips:** white pills (2rem) with panel shadow and a count pill inside. Active chip is navy with white text and a translucent white count. Count pills turn blush and red for late filters, periwinkle and blue for changed.
- **Status badges:** pill, caption size, icon plus word. To do grey, In progress blue, Done green, Late red.
- **Changed tag:** periwinkle pill with blue text ("1 new", "Status changed") in front of the row title or on the card head; disappears once opened.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** white on the pale ground.
- **Shadow Strategy:** panel shadow at rest; project cards lift to hover shadow.
- **Border:** none.
- **Internal Padding:** 1rem; 0.75rem gap between card parts.
- **Project card:** dot and name, changed and late pills, a two line description, a sunken progress block (open and done counts, percent, 6px navy bar on a fog track), and a footer with the next date and an uppercase state label. The whole card is the link.

### Inputs / Fields
- **Style:** white fill, transparent 1px border, panel shadow, 8px radius, 2.5rem minimum height.
- **Focus:** 2px navy outline offset 2px; hover reveals the steel hairline border.
- **Error / Disabled:** invalid fields take a red border and a red message below; disabled controls drop to 55% opacity.
- **Segmented control:** sunken track with 3px padding; the checked option is a white tile with a small shadow.

### Navigation
- **Sidebar:** sits on the ground with a hairline right edge. Logo is a navy 1.75rem tile plus "Task Tracker" at title size. Nav links are 2.5rem rows with an icon, ink-2 text, mist grey on hover, and the current page on a cloud grey rounded fill at 600 weight. Unread counts are periwinkle pills. The signed in user sits at the bottom with a navy avatar.
- **Phone:** a translucent blurred top bar with the logo and account menu, and a fixed bottom tab bar whose current item shows its icon in a cloud grey pill.

### Change Banner (signature)
A full width 12px rounded strip in periwinkle mixed with the ground, blue text: a white icon tile on the left, "N tasks changed since you last looked", and a white "Show them" button on the right. It is the first thing under the page title and the only place blue fills a large area.

### Task Board
One white card. Uppercase label column heads, group titles at title size with a small coloured dot (red for Late, ink for Today, blue otherwise) and a count pill. Rows lead with a large tabular day number (red when late), the title with project dot and priority below it, a status pill, the assignee's initials, and a navy "Next step" button on the right. Changed rows wash in mist blue and set the title at 600; done rows strike the title through in pewter.

### Task Panel
A 440px column on the ground. Its main card shows the project and status, the task title at headline size, a two by two grid of labelled facts divided by hairlines (due date as a figure, assignee, priority, created), then a full width navy primary action and a three way status switch. Description, edit and delete, and Files and Activity tabs follow on the ground.

## Do's and Don'ts

### Do:
- **Do** keep primary surfaces white on the pale ground, separated by the panel shadow and 12px corners.
- **Do** use navy (#131b2e) for every action that moves a task forward, and blue (#0051d5) only for changed or in progress.
- **Do** pair every state colour with a word or icon.
- **Do** mark projects with a small dot in their line colour, never a coloured block.
- **Do** use the 11px uppercase label only to name the data it sits on: column heads, field names, section heads.
- **Do** keep transitions at 150ms on the shared ease, and honour reduced motion.

### Don't:
- **Don't** fill large areas with colour or set dark bands inside the working app; the navy half of the login screen is the one exception.
- **Don't** introduce a second typeface, a monospace, or condensed display type.
- **Don't** put borders on cards that already carry the panel shadow.
- **Don't** use a radius outside 8px, 12px and pill.
- **Don't** fill a button with blue or use red for anything except late or destructive actions.
- **Don't** put an uppercase label above a headline as a kicker.
