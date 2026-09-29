const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

describe('malformed request body', () => {
  // Known bug (see BUGS.md #6) - the error handler in app.js always sends a
  // 500, even for something like bad JSON that should probably be a 400.
  test('a body that is not valid JSON currently produces a 500 (known bug)', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{ this is not valid json');

    expect(res.status).toBe(500);
  });
});

describe('POST /tasks', () => {
  test('creates a task with only a title (happy path)', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Write tests' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Write tests');
    expect(res.body.status).toBe('todo');
    expect(res.body.priority).toBe('medium');
    expect(res.body.id).toBeDefined();
  });

  test('creates a task with all optional fields', async () => {
    const res = await request(app).post('/tasks').send({
      title: 'Ship feature',
      description: 'details',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });

    expect(res.status).toBe(201);
    expect(res.body.description).toBe('details');
    expect(res.body.status).toBe('in_progress');
    expect(res.body.priority).toBe('high');
  });

  test('rejects a missing title', async () => {
    const res = await request(app).post('/tasks').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  test('rejects a whitespace-only title', async () => {
    const res = await request(app).post('/tasks').send({ title: '   ' });

    expect(res.status).toBe(400);
  });

  test('rejects an invalid status', async () => {
    const res = await request(app).post('/tasks').send({ title: 'X', status: 'bogus' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status/i);
  });

  test('rejects an invalid priority', async () => {
    const res = await request(app).post('/tasks').send({ title: 'X', priority: 'urgent' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/priority/i);
  });

  test('rejects an invalid dueDate', async () => {
    const res = await request(app).post('/tasks').send({ title: 'X', dueDate: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/dueDate/i);
  });
});

describe('GET /tasks', () => {
  test('returns all tasks', async () => {
    await request(app).post('/tasks').send({ title: 'A' });
    await request(app).post('/tasks').send({ title: 'B' });

    const res = await request(app).get('/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('returns an empty array when there are no tasks', async () => {
    const res = await request(app).get('/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('filters by exact status match', async () => {
    await request(app).post('/tasks').send({ title: 'A', status: 'todo' });
    await request(app).post('/tasks').send({ title: 'B', status: 'done' });

    const res = await request(app).get('/tasks?status=done');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('done');
  });

  test('returns an empty array for a status with no matching tasks', async () => {
    await request(app).post('/tasks').send({ title: 'A', status: 'todo' });

    const res = await request(app).get('/tasks?status=done');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('paginates results with page and limit', async () => {
    for (let i = 1; i <= 15; i++) {
      await request(app).post('/tasks').send({ title: `Task ${i}` });
    }

    const res = await request(app).get('/tasks?page=1&limit=10');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);
  });

  test('defaults to page 1, limit 10 when only one pagination param is given', async () => {
    for (let i = 1; i <= 15; i++) {
      await request(app).post('/tasks').send({ title: `Task ${i}` });
    }

    const res = await request(app).get('/tasks?page=1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);
  });
});

describe('GET /tasks/stats', () => {
  test('returns counts by status and overdue count', async () => {
    await request(app).post('/tasks').send({ title: 'A', status: 'todo' });
    await request(app).post('/tasks').send({ title: 'B', status: 'done' });
    await request(app)
      .post('/tasks')
      .send({ title: 'C', status: 'todo', dueDate: '2020-01-01T00:00:00.000Z' });

    const res = await request(app).get('/tasks/stats');

    expect(res.status).toBe(200);
    expect(res.body.todo).toBe(2);
    expect(res.body.done).toBe(1);
    expect(res.body.overdue).toBe(1);
  });

  test('returns zeroed stats when there are no tasks', async () => {
    const res = await request(app).get('/tasks/stats');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });
});

describe('PUT /tasks/:id', () => {
  test('updates an existing task (happy path)', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Original' });

    const res = await request(app)
      .put(`/tasks/${created.body.id}`)
      .send({ title: 'Updated', priority: 'high' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
    expect(res.body.priority).toBe('high');
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/does-not-exist').send({ title: 'X' });

    expect(res.status).toBe(404);
  });

  test('rejects an empty title', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Original' });

    const res = await request(app).put(`/tasks/${created.body.id}`).send({ title: '' });

    expect(res.status).toBe(400);
  });

  test('rejects an invalid status', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Original' });

    const res = await request(app).put(`/tasks/${created.body.id}`).send({ status: 'bogus' });

    expect(res.status).toBe(400);
  });

  test('rejects an invalid priority', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Original' });

    const res = await request(app).put(`/tasks/${created.body.id}`).send({ priority: 'urgent' });

    expect(res.status).toBe(400);
  });

  test('rejects an invalid dueDate', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Original' });

    const res = await request(app)
      .put(`/tasks/${created.body.id}`)
      .send({ dueDate: 'not-a-date' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /tasks/:id', () => {
  test('deletes an existing task', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Removable' });

    const res = await request(app).delete(`/tasks/${created.body.id}`);
    expect(res.status).toBe(204);

    const getRes = await request(app).get('/tasks');
    expect(getRes.body).toHaveLength(0);
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/tasks/does-not-exist');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  test('marks a task as done and stamps completedAt', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Finish me' });

    const res = await request(app).patch(`/tasks/${created.body.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).not.toBeNull();
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/tasks/does-not-exist/complete');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /tasks/:id/assign', () => {
  test('assigns a task to a given name (happy path)', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Assign me' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}/assign`)
      .send({ assignee: 'Alex' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Alex');
    expect(res.body.id).toBe(created.body.id);
  });

  test('allows reassigning a task that already has an assignee', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Assign me' });
    await request(app).patch(`/tasks/${created.body.id}/assign`).send({ assignee: 'Alex' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}/assign`)
      .send({ assignee: 'Jamie' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Jamie');
  });

  test('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/tasks/does-not-exist/assign').send({ assignee: 'Alex' });

    expect(res.status).toBe(404);
  });

  test('rejects a missing assignee', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Assign me' });

    const res = await request(app).patch(`/tasks/${created.body.id}/assign`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assignee/i);
  });

  test('rejects an empty string assignee', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Assign me' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}/assign`)
      .send({ assignee: '' });

    expect(res.status).toBe(400);
  });

  test('rejects a whitespace-only assignee', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Assign me' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}/assign`)
      .send({ assignee: '   ' });

    expect(res.status).toBe(400);
  });

  test('rejects a non-string assignee', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Assign me' });

    const res = await request(app)
      .patch(`/tasks/${created.body.id}/assign`)
      .send({ assignee: 123 });

    expect(res.status).toBe(400);
  });
});
