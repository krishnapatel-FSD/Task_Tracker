# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Employees** of a small office team (roughly 5 to 50 people) in a small business or department. Not very technical. They keep Task Tracker open in a browser tab on a work desktop and check it many times a day to see what they have to do, what is late, and to move their own tasks forward.
- **One admin** (a manager or team lead) on a desktop, who creates and assigns work, keeps an eye on what is overdue, and reads the reports.

## Product Purpose

An internal task tracker: the admin assigns tasks to employees within projects; employees see only their own work and update its status. Success means nobody has to ask "what am I supposed to do today?" or "is this late?", and the admin can see the state of the team's work at a glance without chasing people.

## Positioning

A deliberately small tool for a small office: one admin, a handful of people, deadline-first. It does less than a project-management suite on purpose, so first-time and non-technical users can use it without training.

## Operating Context

- Used during the working day in a desktop browser tab; phones are a secondary case.
- Daily rhythm: open the list, see what is late or due today, start or finish tasks. The admin also creates tasks, reassigns, and checks reports; a weekly report arrives every Monday.
- Notifications arrive in-app and by email (assignments, status changes, due-tomorrow and overdue reminders).

## Capabilities and Constraints

- Roles: admin and employee. Employees only change status and add files on their own tasks; edit, reassign and delete are admin-only.
- Tasks: title, description, project, assignee, priority (Low, Medium, High), deadline (a date, no time), status (To do, In progress, Done). Overdue means not done and past the deadline.
- Features: projects, task create/edit/reassign, soft delete with an 8-second Undo, activity log, notifications (in-app plus email, instant or daily), file attachments (10 MB, 10 per task), admin reports with charts and CSV export, weekly report snapshot.
- Stack in place: React 19 + TypeScript + Vite client, Express + Postgres API.
- No sign-up or password reset; accounts come from a seed script.

## Brand Commitments

- Name: "Task Tracker". No logo, company name or brand colours to follow.
- No modals for routine actions (delete uses Undo, not a confirm dialog). No fancy or heavy animation.
- Copy is plain and short, in sentence case, with no em or en dashes.

## Evidence on Hand

- Sample data only (seeded projects, people and 8 weeks of history). No real customers, testimonials or metrics; none may be invented.

## Product Principles

1. **Obvious next step.** Every task shows what to do with it right now; nothing important hides behind an unlabelled click.
2. **Late work can't be missed.** Overdue and due-today work is the first thing anyone sees.
3. **Plain words for non-technical people.** Labels say what things are; no jargon, no clever names.
4. **Small on purpose.** Prefer fewer, clearer screens over more features or options.
5. **Calm, not busy.** Colour and emphasis mark state and action, not decoration.

## Accessibility & Inclusion

Users are non-technical, so legibility and clear affordances matter more than density: readable text sizes, visible labels on controls, status never shown by colour alone, keyboard support.
