# Employee Task Tracker: User Flow

Oct 12, 2026 · @KRISHNA

## 1. Login (both roles)

1. User opens the app. With no valid session they land on the Login screen.
2. User enters email and password and submits.
3. If the credentials are wrong, an error message shows and they stay on Login.
4. If correct, the app stores the session and redirects by role: admin goes to the admin task list, employee goes to the employee task list.

## 2. Admin flow

**View and filter**

1. Admin sees the list of all tasks from every employee. Each row shows title, assignee, priority, deadline and status.
2. Admin filters by status, by assignee, or both. The list updates to match.
3. Clearing the filters shows all tasks again.

**Create and assign a task**

1. Admin clicks Create task.
2. Admin fills in title, description, assignee (chosen from the employee list), priority and deadline.
3. Admin submits. If a field is missing or invalid, the form shows the error and stays open.
4. On success the form closes and the new task appears in the list as To Do.

**Update status**

1. Admin changes the status of any task to To Do, In Progress or Done.
2. The row updates.

**Logout.** Admin logs out and returns to Login.

## 3. Employee flow

1. Employee sees only the tasks assigned to them. There is no Create task option and no assignee filter.
2. Employee filters their tasks by status.
3. Employee reads a task's title, description, priority and deadline in the list.
4. Employee changes the status of a task to To Do, In Progress or Done. The row updates.
5. Employee logs out and returns to Login.

## 4. Task status flow

A task is created as To Do. It normally moves To Do, then In Progress, then Done. Any status can be set from any other, by the assignee or an admin.

## 5. Access rules and edge cases

| Situation | Result |
| --- | --- |
| Not logged in and opens any screen | Redirected to Login |
| Session expired (401 from API) | Session cleared, redirected to Login |
| Employee opens an admin screen | Redirected to the employee task list |
| Employee calls an admin API (create task, list users) | 403 |
| Employee tries to change another employee's task | 403 |
| Admin creates a task with invalid data | 400, form shows the error |
| A filter matches no tasks | Empty list with a short message |
