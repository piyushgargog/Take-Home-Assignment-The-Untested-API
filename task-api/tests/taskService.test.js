const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

describe('create', () => {
  test('creates a task with defaults applied', () => {
    const task = taskService.create({ title: 'Write tests' });

    expect(task.title).toBe('Write tests');
    expect(task.description).toBe('');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.dueDate).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(typeof task.id).toBe('string');
    expect(typeof task.createdAt).toBe('string');
  });

  test('creates a task with all fields provided', () => {
    const task = taskService.create({
      title: 'Ship feature',
      description: 'details',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });

    expect(task.description).toBe('details');
    expect(task.status).toBe('in_progress');
    expect(task.priority).toBe('high');
    expect(task.dueDate).toBe('2030-01-01T00:00:00.000Z');
  });

  test('appends the created task to the store', () => {
    taskService.create({ title: 'One' });
    taskService.create({ title: 'Two' });

    expect(taskService.getAll()).toHaveLength(2);
  });
});

describe('getAll', () => {
  test('returns an empty array when no tasks exist', () => {
    expect(taskService.getAll()).toEqual([]);
  });

  test('returns a copy, not a reference to the internal store', () => {
    taskService.create({ title: 'One' });
    const result = taskService.getAll();
    result.push({ id: 'fake' });

    expect(taskService.getAll()).toHaveLength(1);
  });
});

describe('findById', () => {
  test('returns the matching task', () => {
    const created = taskService.create({ title: 'Findable' });

    expect(taskService.findById(created.id)).toEqual(created);
  });

  test('returns undefined for an unknown id', () => {
    expect(taskService.findById('does-not-exist')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  test('returns only tasks with an exact status match', () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'done' });
    taskService.create({ title: 'C', status: 'todo' });

    const result = taskService.getByStatus('todo');

    expect(result).toHaveLength(2);
    expect(result.every((t) => t.status === 'todo')).toBe(true);
  });

  // Known bug (see BUGS.md #2) - getByStatus does a substring match instead
  // of an exact match, so "on" incorrectly matches "done". Not fixing this one.
  test('matches statuses that merely contain the filter as a substring (known bug)', () => {
    taskService.create({ title: 'A', status: 'done' });
    taskService.create({ title: 'B', status: 'todo' });

    const result = taskService.getByStatus('on');

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('done');
  });

  test('returns an empty array when nothing matches', () => {
    taskService.create({ title: 'A', status: 'todo' });

    expect(taskService.getByStatus('done')).toEqual([]);
  });
});

describe('getPaginated', () => {
  beforeEach(() => {
    for (let i = 1; i <= 25; i++) {
      taskService.create({ title: `Task ${i}` });
    }
  });

  test('page 1 returns the first "limit" items, not an offset batch', () => {
    const result = taskService.getPaginated(1, 10);
    const all = taskService.getAll();

    expect(result).toHaveLength(10);
    expect(result[0].id).toBe(all[0].id);
    expect(result[9].id).toBe(all[9].id);
  });

  test('page 2 returns the next batch of items', () => {
    const result = taskService.getPaginated(2, 10);
    const all = taskService.getAll();

    expect(result).toHaveLength(10);
    expect(result[0].id).toBe(all[10].id);
    expect(result[9].id).toBe(all[19].id);
  });

  test('a page past the end returns an empty array', () => {
    expect(taskService.getPaginated(10, 10)).toEqual([]);
  });

  test('the last partial page returns only the remaining items', () => {
    const result = taskService.getPaginated(3, 10);

    expect(result).toHaveLength(5);
  });
});

describe('getStats', () => {
  test('counts tasks by status', () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'todo' });
    taskService.create({ title: 'C', status: 'in_progress' });
    taskService.create({ title: 'D', status: 'done' });

    const stats = taskService.getStats();

    expect(stats.todo).toBe(2);
    expect(stats.in_progress).toBe(1);
    expect(stats.done).toBe(1);
  });

  test('counts a task with a past dueDate as overdue', () => {
    taskService.create({ title: 'Late', dueDate: '2020-01-01T00:00:00.000Z' });

    expect(taskService.getStats().overdue).toBe(1);
  });

  test('does not count a done task as overdue even with a past dueDate', () => {
    const task = taskService.create({ title: 'Late but done', dueDate: '2020-01-01T00:00:00.000Z' });
    taskService.completeTask(task.id);

    expect(taskService.getStats().overdue).toBe(0);
  });

  test('does not count a task with a future dueDate as overdue', () => {
    taskService.create({ title: 'Future', dueDate: '2099-01-01T00:00:00.000Z' });

    expect(taskService.getStats().overdue).toBe(0);
  });

  test('does not count a task with no dueDate as overdue', () => {
    taskService.create({ title: 'No due date' });

    expect(taskService.getStats().overdue).toBe(0);
  });

  test('returns zeroed counts when there are no tasks', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });
});

describe('update', () => {
  test('merges the given fields into the existing task', () => {
    const task = taskService.create({ title: 'Original' });

    const updated = taskService.update(task.id, { title: 'Updated', priority: 'high' });

    expect(updated.title).toBe('Updated');
    expect(updated.priority).toBe('high');
    expect(updated.id).toBe(task.id);
  });

  test('returns null for an unknown id', () => {
    expect(taskService.update('does-not-exist', { title: 'X' })).toBeNull();
  });

  test('persists the update in the store', () => {
    const task = taskService.create({ title: 'Original' });
    taskService.update(task.id, { title: 'Updated' });

    expect(taskService.findById(task.id).title).toBe('Updated');
  });

  // Known bug (see BUGS.md #4) - update() doesn't restrict which fields can
  // be changed, so passing id in the body overwrites it and the task can't
  // be found by its original id anymore. Not fixing this one for now.
  test('allows the id field to be overwritten, breaking findById (known bug)', () => {
    const task = taskService.create({ title: 'Original' });

    const updated = taskService.update(task.id, { id: 'hijacked-id' });

    expect(updated.id).toBe('hijacked-id');
    expect(taskService.findById(task.id)).toBeUndefined();
  });
});

describe('remove', () => {
  test('removes an existing task and returns true', () => {
    const task = taskService.create({ title: 'Removable' });

    expect(taskService.remove(task.id)).toBe(true);
    expect(taskService.findById(task.id)).toBeUndefined();
  });

  test('returns false for an unknown id', () => {
    expect(taskService.remove('does-not-exist')).toBe(false);
  });

  test('does not affect other tasks', () => {
    const keep = taskService.create({ title: 'Keep' });
    const drop = taskService.create({ title: 'Drop' });

    taskService.remove(drop.id);

    expect(taskService.getAll()).toHaveLength(1);
    expect(taskService.findById(keep.id)).toBeDefined();
  });
});

describe('completeTask', () => {
  test('sets status to done and stamps completedAt', () => {
    const task = taskService.create({ title: 'Finish me' });

    const completed = taskService.completeTask(task.id);

    expect(completed.status).toBe('done');
    expect(completed.completedAt).not.toBeNull();
  });

  // Known bug (see BUGS.md #3) - completeTask always sets priority back to
  // 'medium', even if the task was high/low priority. Not fixing this one.
  test('resets priority to medium on completion (known bug)', () => {
    const task = taskService.create({ title: 'Finish me', priority: 'high' });

    const completed = taskService.completeTask(task.id);

    expect(completed.priority).toBe('medium');
  });

  test('returns null for an unknown id', () => {
    expect(taskService.completeTask('does-not-exist')).toBeNull();
  });

  test('persists the completion in the store', () => {
    const task = taskService.create({ title: 'Finish me' });
    taskService.completeTask(task.id);

    expect(taskService.findById(task.id).status).toBe('done');
  });
});

describe('assignTask', () => {
  test('assigns a task to the given name', () => {
    const task = taskService.create({ title: 'Assign me' });

    const assigned = taskService.assignTask(task.id, 'Alex');

    expect(assigned.assignee).toBe('Alex');
    expect(assigned.id).toBe(task.id);
  });

  test('returns null for an unknown id', () => {
    expect(taskService.assignTask('does-not-exist', 'Alex')).toBeNull();
  });

  test('allows reassigning a task that already has an assignee', () => {
    const task = taskService.create({ title: 'Assign me' });
    taskService.assignTask(task.id, 'Alex');

    const reassigned = taskService.assignTask(task.id, 'Jamie');

    expect(reassigned.assignee).toBe('Jamie');
  });

  test('persists the assignment in the store', () => {
    const task = taskService.create({ title: 'Assign me' });
    taskService.assignTask(task.id, 'Alex');

    expect(taskService.findById(task.id).assignee).toBe('Alex');
  });
});
