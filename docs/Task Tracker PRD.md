# Employee Task Tracker: PRD

Oct 12, 2026 · @KRISHNA

## 1. Overview

A web app where employees manage their work. An admin creates tasks and assigns them to employees. Employees see and update only the tasks assigned to them.

## 2. Goals

- Admin can create tasks and assign them to employees.
- Employees can see their own tasks and update their status.
- Admin can see all tasks and filter them by status and assignee.

## 3. Roles

| Role | Can do |
| --- | --- |
| Admin | Log in. Create and assign tasks. View all tasks. Filter by status and assignee. Update the status of any task. |
| Employee | Log in. View only tasks assigned to them. Filter them by status. Update the status of their own tasks. |

## 4. Functional requirements

**FR-1 Login.** Users log in with email and password. Their role (admin or employee) decides what they can access. Wrong credentials show an error.

**FR-2 Create task (admin only).** Fields:

- Title: required, max 150 characters
- Description: required
- Assignee: required, one employee
- Priority: required, one of Low, Medium, High
- Deadline: required, a date

A new task starts as To Do.

**FR-3 Update status.** Status is one of To Do, In Progress, Done. The assignee or an admin can change it.

**FR-4 Filter.** Filter the task list by status (admin and employee) and by assignee (admin only). Both filters can be combined.

**FR-5 Visibility.** Admin sees all tasks. An employee sees only tasks assigned to them. The server enforces this, not just the UI.

**FR-6 Logout.** A logged-in user can log out.

## 5. Acceptance criteria

- FR-1: valid credentials open the role's home screen. Invalid credentials show an error and stay on the login screen.
- FR-2: an admin can submit the form only when all fields are valid. The new task appears in the list as To Do under the chosen assignee. An employee has no way to reach the form, and the API rejects the request with 403.
- FR-3: changing the status updates the task immediately. An employee cannot change another employee's task (403).
- FR-4: the list shows only tasks matching every selected filter. Clearing filters shows the full list for that user.
- FR-5: an employee calling the task API never receives another employee's tasks, whatever parameters they send.

## 6. Screens

- Login
- Task list (admin): all tasks, status and assignee filters, Create task button
- Create task form (admin): opened from the admin task list
- Task list (employee): own tasks, status filter, status update control

## 7. Out of scope

Sign-up, password reset, user management screens, editing or deleting tasks, comments, notifications, search, pagination, reports.

## 8. Assumptions and open questions

- User accounts (one admin, several employees) are created by a seed script, since there is no sign-up.
- Priority levels are Low, Medium, High.
- Any status change is allowed in any direction (for example Done back to In Progress).
- Description is required.
- Deadline is a date only, with no time. Open question: should past deadlines be rejected on creation?
