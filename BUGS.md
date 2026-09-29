# Bug Report

Found while writing unit tests (`task-api/tests/taskService.test.js`) and integration
tests (`task-api/tests/tasks.routes.test.js`) for the Task API.

---

## 1. `getPaginated` returns the wrong page (off-by-one) — **FIXED**

- **Expected:** `GET /tasks?page=1&limit=10` returns the first 10 tasks.
- **Actual:** It skipped the first 10 tasks and returned tasks 11–20 instead. Every
  page was shifted forward by one `limit`-sized block, and the final page of results
  was silently dropped entirely.
- **Location:** `src/services/taskService.js`, `getPaginated` (was line 12).
- **How I found it:** Writing a test for `getPaginated` with 25 seeded tasks -
  page 1 was returning task 11 instead of task 1. The same thing showed up in
  the `GET /tasks?page=1&limit=10` integration test.
- **Root cause:** `offset = page * limit` treats `page` as 0-indexed, but callers
  pass 1-indexed page numbers (per the assignment's own example, `?page=1&limit=10`
  is page one). With `page=1, limit=10`, `offset` evaluated to `10` instead of `0`.
- **Fix:** Changed the offset calculation to `(page - 1) * limit`.

---

## 2. `getByStatus` matches on substring, not exact status — **NOT FIXED**

- **Expected:** `GET /tasks?status=done` (or a direct `getByStatus('done')` call)
  returns only tasks whose status is exactly `"done"`.
- **Actual:** It also matches any status that merely *contains* the filter string.
  For example, filtering by `status=on` incorrectly returns tasks with status
  `"done"`, because `"done".includes("on")` is `true`.
- **Location:** `src/services/taskService.js`, `getByStatus` (line 9):
  `tasks.filter((t) => t.status.includes(status))`.
- **How I found it:** While testing `getByStatus`, filtering by "on" returned
  tasks with status "done", which shouldn't match at all.
- **Root cause:** `String.prototype.includes` was used where `===` (exact
  equality) was intended.
- **Proposed fix:** `tasks.filter((t) => t.status === status)`.

---

## 3. `completeTask` silently resets priority to `medium` — **NOT FIXED**

- **Expected:** Marking a task complete changes its `status` to `done` and sets
  `completedAt`, without touching unrelated fields like `priority`.
- **Actual:** A `high` (or `low`) priority task has its priority silently
  overwritten to `medium` the moment it's completed.
- **Location:** `src/services/taskService.js`, `completeTask` (line 69):
  the `updated` object hardcodes `priority: 'medium'`.
- **How I found it:** Created a `high` priority task, called `completeTask`
  on it, and the priority came back as `medium` instead of staying `high`.
- **Root cause:** Looks like a copy-paste or default-value mistake — nothing in
  the spec calls for priority to change on completion, and no other field is
  reset this way.
- **Proposed fix:** Remove the `priority: 'medium'` line from the `updated`
  object in `completeTask` so priority carries over unchanged, i.e.
  `{ ...task, status: 'done', completedAt: new Date().toISOString() }`.

---

## 4. `update` (PUT) allows overwriting protected fields, including `id` — **NOT FIXED**

- **Expected:** `PUT /tasks/:id` updates the editable fields of a task
  (`title`, `description`, `status`, `priority`, `dueDate`) without letting the
  client change server-assigned fields like `id`, `createdAt`, or `completedAt`.
- **Actual:** `update` merges the entire request body onto the existing task with
  no field allow-list. A request body containing `{ "id": "something-else" }`
  overwrites the task's own `id` while it stays at the same array index. After
  that, `findById` (and therefore every route that looks up the task by its
  original id) can no longer find it — the task effectively becomes unreachable
  by its original id.
- **Location:** `src/services/taskService.js`, `update` (line 50):
  `const updated = { ...tasks[index], ...fields };`. Also reachable via
  `validateUpdateTask` in `src/utils/validators.js`, which never checks for or
  rejects `id`/`createdAt`/`completedAt` in the body.
- **How I found it:** Tried updating a task with `{ id: 'hijacked-id' }` in
  the body, and `findById` couldn't find the task by its original id anymore.
- **Root cause:** No allow-list/denylist on which fields a client-supplied
  update object may touch.
- **Proposed fix:** Build the updated object from an explicit list of editable
  fields, e.g. destructure `{ title, description, status, priority, dueDate }`
  from `fields` before merging, mirroring how `create` already destructures its
  input instead of trusting the raw body.

---

## 5. Empty-string `status`/`priority`/`dueDate` bypass validation

- **Expected:** `POST /tasks` (or `PUT /tasks/:id`) with `status: ""` (or
  `priority: ""`, `dueDate: ""`) is rejected the same way an invalid value like
  `"bogus"` would be.
- **Actual:** The validators skip the check entirely for falsy values, so an
  empty string is silently accepted and stored on the task, producing a task
  with e.g. `status: ""` that then doesn't match any bucket in `getStats` and
  behaves unpredictably in `getByStatus`.
- **Location:** `src/utils/validators.js`, e.g. line 8:
  `if (body.status && !VALID_STATUSES.includes(body.status))` — the leading
  `body.status &&` short-circuits when `body.status` is `""`. Same pattern for
  `priority` (line 11) and `dueDate` (line 14).
- **How I found it:** Noticed this while reading `validators.js` while
  writing tests. Not covered by a dedicated test in this submission.
- **Root cause:** Using truthiness (`body.status && ...`) instead of an
  explicit `!== undefined` check to decide whether a field was provided.
- **Proposed fix:** `if (body.status !== undefined && !VALID_STATUSES.includes(body.status))`,
  and the equivalent for `priority` and `dueDate`.

---

## 6. Generic error handler always returns 500

- **Expected:** A client error such as malformed JSON in the request body
  (which Express's `express.json()` middleware rejects with a `SyntaxError`
  carrying `status: 400`) surfaces as a 4xx response.
- **Actual:** `src/app.js`'s error-handling middleware always responds with
  `500 Internal server error`, ignoring `err.status`/`err.statusCode`.
- **Location:** `src/app.js`, lines 9–12.
- **How I found it:** Sent a request with broken JSON in the body and got a
  500 back instead of something like a 400.
- **Root cause:** The handler hardcodes the status code instead of respecting
  one already attached to the error.
- **Proposed fix:** `res.status(err.status || err.statusCode || 500).json(...)`.

---

## Notes on documentation

`README.md` describes task statuses as `pending | in-progress | completed`,
but the actual code (and `ASSIGNMENT.md`) uses `todo | in_progress | done`.
Not a code bug, but worth flagging — a consumer of the API following the
README would send requests that fail validation.
