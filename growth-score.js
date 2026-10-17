(function (root, factory) {
  const growth = factory();
  if (typeof module === "object" && module.exports) module.exports = growth;
  else root.HoptasksGrowth = growth;
})(globalThis, function () {
  const CATEGORY_WEIGHTS = { goals: 1, habits: 1, tasks: 1 };

  function validDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function monthBounds(month, today) {
    if (!/^\d{4}-\d{2}$/.test(month)) return null;
    const [year, monthNumber] = month.split("-").map(Number);
    const first = `${month}-01`;
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const last = `${month}-${String(lastDay).padStart(2, "0")}`;
    const todayMonth = today?.slice(0, 7);
    const cutoff = todayMonth && month > todayMonth
      ? addDays(first, -1)
      : today && month === todayMonth
        ? (today < last ? today : last)
        : last;
    return { first, last, cutoff };
  }

  function normalizeSnapshots(snapshots) {
    return (Array.isArray(snapshots) ? snapshots : [])
      .filter(snapshot => snapshot && validDate(snapshot.date))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.at || "").localeCompare(String(b.at || "")));
  }

  function scoreAtMonth(month, today, snapshots, weights = CATEGORY_WEIGHTS) {
    const bounds = monthBounds(month, today);
    if (!bounds || bounds.cutoff < bounds.first) {
      return { month, score: null, categories: { goals: null, habits: null, tasks: null }, details: {}, partial: false, missing: ["No data yet."] };
    }

    const history = normalizeSnapshots(snapshots);
    const available = history.filter(snapshot => snapshot.date <= bounds.cutoff);
    if (!available.length) {
      return {
        month,
        score: null,
        categories: { goals: null, habits: null, tasks: null },
        details: {},
        partial: false,
        missing: ["No saved Growth history for this month."]
      };
    }

    const before = available.filter(snapshot => snapshot.date < bounds.first);
    const anchor = before.length ? before[before.length - 1] : available[0];
    const partial = anchor.date >= bounds.first;
    const categories = {
      goals: scoreGoals(anchor, available, bounds),
      habits: scoreHabits(anchor, available, bounds),
      tasks: scoreTasks(available, bounds)
    };
    const configured = { ...CATEGORY_WEIGHTS, ...(weights || {}) };
    const eligible = Object.entries(categories).filter(([, item]) => item.score !== null);
    const totalWeight = eligible.reduce((sum, [key]) => sum + Math.max(0, Number(configured[key]) || 0), 0);
    const weighted = totalWeight
      ? eligible.reduce((sum, [key, item]) => sum + item.score * (Math.max(0, Number(configured[key]) || 0) / totalWeight), 0)
      : eligible.reduce((sum, [, item]) => sum + item.score / eligible.length, 0);
    const missing = eligible.length
      ? Object.values(categories).filter(item => item.score === null).map(item => item.reason)
      : [Object.values(categories).map(item => item.reason).filter(Boolean).join(" ") || "No data yet."];
    return {
      month,
      score: eligible.length ? Math.round(Math.max(0, Math.min(100, weighted))) : null,
      categories: Object.fromEntries(Object.entries(categories).map(([key, item]) => [key, item.score])),
      details: Object.fromEntries(Object.entries(categories).map(([key, item]) => [key, item])),
      partial,
      missing: missing.filter(Boolean)
    };
  }

  function scoreGoals(anchor, snapshots, bounds) {
    if (!Array.isArray(snapshots)) return { score: null, reason: "Goal history is unavailable for this month.", eligible: 0 };
    const goals = new Set(snapshots
      .filter(snapshot => snapshot.date <= bounds.cutoff)
      .flatMap(snapshot => (snapshot.goals || []).map(goal => goal.id)));
    let eligible = 0;
    let total = 0;
    for (const id of goals) {
      const goalSnapshots = snapshots.filter(snapshot => snapshot.date <= bounds.cutoff && (snapshot.goals || []).some(goal => goal.id === id));
      const anchorHasGoal = (anchor.goals || []).some(goal => goal.id === id);
      const baselineSnapshot = anchorHasGoal
        ? anchor
        : goalSnapshots.find(snapshot => snapshot.date >= bounds.first);
      if (!baselineSnapshot) continue;
      const finalSnapshot = goalSnapshots[goalSnapshots.length - 1];
      const baselineGoal = (baselineSnapshot.goals || []).find(goal => goal.id === id);
      const taskIds = new Set(baselineGoal?.taskIds || []);
      const usesCompletionDates = baselineSnapshot.date >= bounds.first;
      if (usesCompletionDates) {
        for (const snapshot of goalSnapshots) {
          const snapshotGoal = (snapshot.goals || []).find(goal => goal.id === id);
          for (const taskId of snapshotGoal?.taskIds || []) {
            const task = (snapshot.tasks || []).find(item => item.id === taskId);
            if (task?.createdOn && task.createdOn >= bounds.first && task.createdOn <= bounds.cutoff) taskIds.add(taskId);
          }
        }
      }
      if (!taskIds.size) continue;
      const finalTasks = new Map((finalSnapshot.tasks || []).map(task => [task.id, task]));
      if (usesCompletionDates) {
        const gained = [...taskIds].filter(taskId => {
          const task = finalTasks.get(taskId);
          return task?.done && validDate(task.doneOn) && task.doneOn >= bounds.first && task.doneOn <= bounds.cutoff;
        }).length;
        eligible++;
        total += gained / taskIds.size * 100;
        continue;
      }
      const baselineTasks = new Map((baselineSnapshot.tasks || []).map(task => [task.id, task]));
      const started = [...taskIds].filter(taskId => baselineTasks.get(taskId)?.done).length;
      const finished = [...taskIds].filter(taskId => finalTasks.get(taskId)?.done).length;
      eligible++;
      total += Math.max(0, (finished - started) / taskIds.size * 100);
    }
    if (!eligible) return { score: null, reason: "No measurable goal-task progress is recorded for this month.", eligible: 0 };
    return { score: clamp(total / eligible), reason: "", eligible };
  }

  function scoreHabits(anchor, snapshots, bounds) {
    if (!Array.isArray(snapshots)) return { score: null, reason: "Habit history is unavailable for this month.", scheduled: 0, completed: 0 };
    const allDates = calendarDates(bounds.first, bounds.cutoff);
    let scheduled = 0;
    let completed = 0;
    for (const date of allDates) {
      const snapshot = snapshotAt(snapshots, date) || (date >= anchor.date ? anchor : null);
      if (!snapshot) continue;
      for (const habit of snapshot.habits || []) {
        if (habit.createdOn && date < habit.createdOn) continue;
        if (Array.isArray(habit.scheduleDays) && habit.scheduleDays.length && !habit.scheduleDays.includes(weekday(date))) continue;
        if (habit.kind === "weekly") continue;
        scheduled++;
        if ((Number(habit.log?.[date]) || 0) >= Math.max(1, Number(habit.target) || 1)) completed++;
      }
    }
    if (!allDates.length || !snapshots.length) return { score: null, reason: "Habit history is unavailable for this month.", scheduled: 0, completed: 0 };

    const weeks = new Map();
    for (const date of allDates) {
      const week = weekStart(date);
      if (!weeks.has(week)) weeks.set(week, []);
      weeks.get(week).push(date);
    }
    for (const weekDates of weeks.values()) {
      const weekHabits = new Map();
      for (const date of weekDates) {
        const snapshot = snapshotAt(snapshots, date) || (date >= anchor.date ? anchor : null);
        if (!snapshot) continue;
        for (const habit of snapshot.habits || []) {
          if (habit.kind !== "weekly" || (habit.createdOn && date < habit.createdOn)) continue;
          if (Array.isArray(habit.scheduleDays) && habit.scheduleDays.length && !habit.scheduleDays.includes(weekday(date))) continue;
          const record = weekHabits.get(habit.id) || { expected: 0, sessions: 0 };
          record.expected += Math.max(1, Number(habit.target) || 1) / 7;
          record.sessions += Number(habit.log?.[date]) || 0;
          weekHabits.set(habit.id, record);
        }
      }
      for (const record of weekHabits.values()) {
        scheduled += record.expected;
        completed += Math.min(record.expected, record.sessions);
      }
    }
    if (!scheduled) return { score: null, reason: "No scheduled habit occurrences are eligible for this month.", scheduled: 0, completed: 0 };
    return { score: clamp(completed / scheduled * 100), reason: "", scheduled, completed };
  }

  function scoreTasks(snapshots, bounds) {
    if (!Array.isArray(snapshots)) return { score: null, reason: "Task history is unavailable for this month.", eligible: 0, completed: 0, onTime: 0, late: 0, overdue: 0, notYetDue: 0 };
    const taskStates = new Map();
    for (const snapshot of snapshots) {
      for (const task of snapshot.tasks || []) {
        if (!taskStates.has(task.id)) taskStates.set(task.id, []);
        taskStates.get(task.id).push({ date: snapshot.date, task });
      }
    }

    let eligible = 0, completed = 0, onTime = 0, late = 0, overdue = 0, notYetDue = 0;
    for (const states of taskStates.values()) {
      const initial = states[0].task;
      if (initial.createdOn && initial.createdOn > bounds.cutoff) continue;
      const dueDatesInMonth = states
        .filter(({ date, task }) => date <= bounds.cutoff && validDate(task.due) && task.due >= bounds.first && task.due <= bounds.cutoff)
        .map(({ task }) => task.due)
        .sort();
      const dueInMonth = dueDatesInMonth.length > 0;
      const monthCompletion = states
        .map(({ task }) => task.doneOn)
        .filter(date => validDate(date) && date >= bounds.first && date <= bounds.cutoff)
        .sort()[0];
      const currentDue = states.filter(({ date }) => date <= bounds.cutoff).at(-1)?.task.due || "";
      const overdueCompletion = monthCompletion && validDate(currentDue) && currentDue < bounds.first;
      const noDueCompletion = monthCompletion && !validDate(currentDue);
      const dueAtEnd = states.filter(({ date }) => date <= bounds.cutoff).at(-1)?.task.due || "";
      const dueThisMonth = dueInMonth;
      const isEligible = dueThisMonth || overdueCompletion || noDueCompletion;
      if (!isEligible) {
        if (validDate(dueAtEnd) && dueAtEnd > bounds.cutoff && dueAtEnd.startsWith(bounds.first.slice(0, 7))) notYetDue++;
        continue;
      }
      const finalState = states.filter(({ date }) => date <= bounds.cutoff).at(-1)?.task;
      if (finalState?.done && validDate(finalState.doneOn) && finalState.doneOn < bounds.first) continue;
      eligible++;
      const completionDate = validDate(finalState?.doneOn) ? finalState.doneOn : null;
      const wasCompletedByEnd = !!finalState?.done && (!completionDate || completionDate <= bounds.cutoff);
      if (wasCompletedByEnd) {
        completed++;
        if (completionDate) {
          const dueWhenCompleted = states.filter(({ date, task }) => date <= completionDate && validDate(task.due)).at(-1)?.task.due || dueAtEnd;
          if (!validDate(dueWhenCompleted) || completionDate <= dueWhenCompleted) onTime++;
          else late++;
        }
      } else if (validDate(dueAtEnd) && dueAtEnd <= bounds.cutoff) overdue++;
    }
    if (!eligible) return { score: null, reason: "No tasks were due or completed in this month.", eligible: 0, completed: 0, onTime: 0, late: 0, overdue, notYetDue };
    const timed = onTime + late + overdue;
    return {
      score: clamp(completed / eligible * 100),
      reason: "",
      eligible,
      completed,
      onTime,
      late,
      overdue,
      notYetDue,
      timeliness: timed ? clamp(onTime / timed * 100) : null
    };
  }

  function snapshotAt(snapshots, date) {
    let result = null;
    for (const snapshot of snapshots) {
      if (snapshot.date > date) break;
      result = snapshot;
    }
    return result;
  }

  function calendarDates(first, last) {
    if (!validDate(first) || !validDate(last) || last < first) return [];
    const dates = [];
    for (let date = first; date <= last; date = addDays(date, 1)) dates.push(date);
    return dates;
  }

  function addDays(date, amount) {
    const value = new Date(`${date}T12:00:00`);
    value.setDate(value.getDate() + amount);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  function weekday(date) {
    return new Date(`${date}T12:00:00`).getDay();
  }

  function weekStart(date) {
    return addDays(date, -((weekday(date) + 6) % 7));
  }

  function clamp(value) {
    return Math.max(0, Math.min(100, value));
  }

  return { CATEGORY_WEIGHTS, scoreAtMonth, scoreGoals, scoreHabits, scoreTasks };
});
