const test = require("node:test");
const assert = require("node:assert/strict");
const Growth = require("../growth-score.js");

const month = "2026-10";
const day = value => `2026-10-${String(value).padStart(2, "0")}`;
const goal = (id, taskIds) => ({ id, taskIds });
const task = (id, { goalId = null, due = "", done = false, doneOn = null, createdOn = "2026-09-01" } = {}) =>
  ({ id, goalId, due, done, doneOn, createdOn });
const habit = (id, { kind = "daily", target = 1, createdOn = "2026-10-01", log = {} } = {}) =>
  ({ id, kind, target, createdOn, log });
const snapshot = (date, goals = [], tasks = [], habits = []) => ({ date, at: `${date}T12:00:00`, goals, tasks, habits });

test("goal progress from 20% to 50% credits only October's 30 points", () => {
  const tasks = Array.from({ length: 10 }, (_, i) => task(`t${i}`, { goalId: "g", done: i < 2, doneOn: i < 2 ? "2026-09-15" : null }));
  const snapshots = [
    snapshot("2026-09-30", [goal("g", tasks.map(item => item.id))], tasks),
    snapshot(day(5), [goal("g", tasks.map(item => item.id))], tasks.map((item, i) => i < 5 ? { ...item, done: true, doneOn: day(i + 1) } : item))
  ];
  assert.equal(Growth.scoreAtMonth(month, "2026-10-31", snapshots).details.goals.score, 30);
});

test("a goal with 50% completed before October earns no new October credit", () => {
  const tasks = Array.from({ length: 10 }, (_, i) => task(`t${i}`, { goalId: "g", done: i < 5, doneOn: i < 5 ? "2026-09-15" : null }));
  const snapshots = [
    snapshot("2026-09-30", [goal("g", tasks.map(item => item.id))], tasks),
    snapshot(day(31), [goal("g", tasks.map(item => item.id))], tasks)
  ];
  assert.equal(Growth.scoreAtMonth(month, "2026-10-31", snapshots).details.goals.score, 0);
});

test("existing users get credit for dated goal progress before tracking began", () => {
  const tasks = [
    task("done", { goalId: "g", done: true, doneOn: day(10) }),
    task("open", { goalId: "g" })
  ];
  const snapshots = [
    snapshot(day(17), [goal("g", ["done", "open"])], tasks)
  ];
  const score = Growth.scoreAtMonth(month, day(17), snapshots);
  assert.equal(score.details.goals.score, 50);
  assert.equal(score.partial, true);
});

test("20 scheduled daily occurrences and 15 completions score 75%", () => {
  const log = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [day(i + 1), 1]));
  const snapshots = [snapshot("2026-09-30", [], [], [habit("h", { createdOn: "2026-10-01", log })])];
  const score = Growth.scoreAtMonth(month, "2026-10-20", snapshots);
  assert.equal(score.details.habits.scheduled, 20);
  assert.equal(score.details.habits.completed, 15);
  assert.equal(score.details.habits.score, 75);
});

test("a late task receives completion credit once and is marked late", () => {
  const snapshots = [
    snapshot("2026-09-30", [], [task("t", { due: day(2) })]),
    snapshot(day(4), [], [task("t", { due: day(2), done: true, doneOn: day(4) })]),
    snapshot(day(8), [], [task("t", { due: day(2), done: false })]),
    snapshot(day(9), [], [task("t", { due: day(2), done: true, doneOn: day(9) })])
  ];
  const details = Growth.scoreAtMonth(month, "2026-10-31", snapshots).details.tasks;
  assert.equal(details.score, 100);
  assert.equal(details.completed, 1);
  assert.equal(details.late, 1);
  assert.equal(details.onTime, 0);
  assert.equal(details.timeliness, 0);
});

test("a habit created halfway through the month counts only its eligible days", () => {
  const log = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [day(i + 16), 1]));
  const snapshots = [snapshot(day(16), [], [], [habit("h", { createdOn: day(16), log })])];
  const details = Growth.scoreAtMonth(month, "2026-10-31", snapshots).details.habits;
  assert.equal(details.scheduled, 16);
  assert.equal(details.completed, 8);
  assert.equal(details.score, 50);
});

test("weekly habit creation and completions use snapshots from throughout the week", () => {
  const snapshots = [
    snapshot("2026-10-12"),
    snapshot(day(16), [], [], [habit("h", { kind: "weekly", target: 2, createdOn: day(16), log: { [day(16)]: 1 } })]),
    snapshot(day(17), [], [], [habit("h", { kind: "weekly", target: 2, createdOn: day(16), log: { [day(16)]: 1, [day(17)]: 1 } })])
  ];
  const details = Growth.scoreAtMonth(month, day(18), snapshots).details.habits;
  assert.equal(details.scheduled, 6 / 7);
  assert.equal(details.completed, 6 / 7);
  assert.equal(details.score, 100);
});

test("months without tracked records display no data instead of zero", () => {
  const score = Growth.scoreAtMonth(month, "2026-10-31", []);
  assert.equal(score.score, null);
  assert.equal(score.missing[0], "No saved Growth history for this month.");
});

test("future months do not count scheduled occurrences as missed", () => {
  const score = Growth.scoreAtMonth("2026-11", "2026-10-31", [
    snapshot("2026-10-31", [], [], [habit("h", { createdOn: "2026-10-01" })])
  ]);
  assert.equal(score.score, null);
  assert.equal(score.missing[0], "No data yet.");
});

test("switching months calculates each month's own progress delta", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const snapshots = [
    snapshot("2026-08-31", [goal("g", ids)], ids.map((id, i) => task(id, { goalId: "g", done: i === 0, doneOn: i === 0 ? "2026-08-20" : null }))),
    snapshot("2026-09-30", [goal("g", ids)], ids.map((id, i) => task(id, { goalId: "g", done: i < 2, doneOn: i < 2 ? (i === 0 ? "2026-08-20" : "2026-09-20") : null }))),
    snapshot("2026-10-31", [goal("g", ids)], ids.map((id, i) => task(id, { goalId: "g", done: i < 3, doneOn: i < 3 ? ["2026-08-20", "2026-09-20", "2026-10-20"][i] : null })))
  ];
  assert.equal(Growth.scoreAtMonth("2026-09", "2026-10-31", snapshots).details.goals.score, 20);
  assert.equal(Growth.scoreAtMonth("2026-10", "2026-10-31", snapshots).details.goals.score, 20);
});

test("monthly score uses equal weights when no category weights are configured", () => {
  const snapshots = [
    snapshot("2026-09-30", [goal("g", ["goal-task"])], [
      task("goal-task", { goalId: "g", due: day(1) }),
      task("open-task", { due: day(1) })
    ], [habit("h", { createdOn: day(1) })]),
    snapshot(day(1), [goal("g", ["goal-task"])], [
      task("goal-task", { goalId: "g", due: day(1), done: true, doneOn: day(1) }),
      task("open-task", { due: day(1) })
    ], [habit("h", { createdOn: day(1) })])
  ];
  const score = Growth.scoreAtMonth(month, day(1), snapshots);
  assert.deepEqual(score.categories, { goals: 100, habits: 0, tasks: 50 });
  assert.equal(score.score, 50);
});

test("categories without eligible records are excluded and remaining weights renormalized", () => {
  const snapshots = [
    snapshot("2026-09-30", [goal("g", ["goal-task"])], [
      task("goal-task", { goalId: "g", due: day(1) }),
      task("open-task", { due: day(1) })
    ]),
    snapshot(day(1), [goal("g", ["goal-task"])], [
      task("goal-task", { goalId: "g", due: day(1), done: true, doneOn: day(1) }),
      task("open-task", { due: day(1) })
    ])
  ];
  const score = Growth.scoreAtMonth(month, day(1), snapshots);
  assert.deepEqual(score.categories, { goals: 100, habits: null, tasks: 50 });
  assert.equal(score.score, 75);
});

test("reopened goal tasks are scored from net progress at month end", () => {
  const snapshots = [
    snapshot("2026-09-30", [goal("g", ["done", "open"])], [
      task("done", { goalId: "g", done: true, doneOn: "2026-09-10" }),
      task("open", { goalId: "g" })
    ]),
    snapshot(day(5), [goal("g", ["done", "open"])], [
      task("done", { goalId: "g", done: true, doneOn: "2026-09-10" }),
      task("open", { goalId: "g", done: true, doneOn: day(5) })
    ]),
    snapshot(day(10), [goal("g", ["done", "open"])], [
      task("done", { goalId: "g", done: true, doneOn: "2026-09-10" }),
      task("open", { goalId: "g" })
    ])
  ];
  assert.equal(Growth.scoreAtMonth(month, "2026-10-31", snapshots).details.goals.score, 0);
});

test("editing or rescheduling records does not create duplicate goal or task credit", () => {
  const snapshots = [
    snapshot("2026-09-30", [goal("g", ["a", "b"])], [
      task("a", { goalId: "g", done: true, doneOn: "2026-09-10" }),
      task("b", { goalId: "g", due: day(5) })
    ]),
    snapshot(day(10), [goal("g", ["a", "b", "c"])], [
      task("a", { goalId: "g", done: true, doneOn: "2026-09-10" }),
      task("b", { goalId: "g", due: day(5) }),
      task("c", { goalId: "g", due: day(20) })
    ]),
    snapshot(day(20), [goal("g", ["a", "b", "c"])], [
      task("a", { goalId: "g", done: true, doneOn: "2026-09-10" }),
      task("b", { goalId: "g", due: "2026-11-05" }),
      task("c", { goalId: "g", due: day(20) })
    ])
  ];
  const result = Growth.scoreAtMonth(month, "2026-10-31", snapshots);
  assert.equal(result.details.goals.score, 0);
  assert.equal(result.details.tasks.eligible, 2);
  assert.equal(result.details.tasks.overdue, 1);
  assert.equal(result.details.tasks.completed, 0);
});

test("a task reopened before month end is no longer counted as complete", () => {
  const snapshots = [
    snapshot("2026-09-30", [], [task("t", { due: day(2) })]),
    snapshot(day(4), [], [task("t", { due: day(2), done: true, doneOn: day(4) })]),
    snapshot(day(8), [], [task("t", { due: day(2), done: false, doneOn: null })])
  ];
  const details = Growth.scoreAtMonth(month, "2026-10-31", snapshots).details.tasks;
  assert.equal(details.score, 0);
  assert.equal(details.completed, 0);
  assert.equal(details.overdue, 1);
});

test("months before the earliest tracked snapshot are explicitly unavailable", () => {
  const score = Growth.scoreAtMonth("2026-09", "2026-10-31", [snapshot(day(10))]);
  assert.equal(score.score, null);
  assert.match(score.missing[0], /No saved Growth history/);
});

test("recalculating unchanged snapshots is deterministic", () => {
  const snapshots = [
    snapshot("2026-09-30", [], [task("t", { due: day(2) })]),
    snapshot(day(5), [], [task("t", { due: day(2), done: true, doneOn: day(5) })])
  ];
  assert.deepEqual(
    Growth.scoreAtMonth(month, "2026-10-31", snapshots),
    Growth.scoreAtMonth(month, "2026-10-31", snapshots)
  );
});
