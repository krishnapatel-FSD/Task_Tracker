# Task list surface: direction contract

Development-only. Do not copy into source or shipped files.

Scope: Login, AdminTasks, EmployeeTasks. Mode: Operate (people come here to see and update their work).
Audience: office staff checking their own tasks several times a day; one admin assigning and tracking everyone's.

THESIS: The task list is a timetable. Work is read the way a departure board is read: by when it is due, with a clear "now" line. Refuses the category default of a stack of identical cards with coloured left edges and pill badges.

OWN-WORLD: Station signage. Deep ink header band, cool white ground, one signal-yellow accent reserved for focus, selection and the "now" line. Archivo variable: condensed widths for dates and headings, normal width for reading. Tabular figures for every date. Employees get desaturated "line colours" (data series). Hairline rules between rows, square-ish corners (4px controls, 6px panels), no drop-shadow cards.

STORY: Open the app, see what is late, what is due today and what comes next, without reading any labels. Change a status in one move. Admin creates a task without leaving the list.

FIRST VIEWPORT: Ink header band (wordmark left, user and log out right). Title row: "All tasks" / "My tasks" with count, "New task" primary at the right (admin only). Status segmented control (+ assignee select for admin). Then the timetable: Past due group, the yellow "Today" line, Due today, This week, Next week, Later. Each row: lead column with condensed date and relative time ("2 days late" in signal red, "in 6 days"), then title and one-line description, assignee with line colour (admin), priority, status select.

FORM: Timetable (first of three directions considered; chosen over "Work docket" and the plain issue-tracker look).

FINISH: the surface is done when it has been reviewed at desktop and mobile widths in both themes and DESIGN.md describes what was built.
