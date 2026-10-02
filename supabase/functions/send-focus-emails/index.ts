import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Task = { t?: string; due?: string; done?: boolean; doneOn?: string };
type Habit = { name?: string; target?: number; kind?: string; log?: Record<string, number> };
type Profile = {
  timezone?: string;
  notifications?: boolean;
  emailPreferences?: {
    dailyReminder?: boolean;
    dailyTime?: string;
    weeklyMetrics?: boolean;
    weeklyDay?: number;
    monthlyWins?: boolean;
    monthlyDay?: number;
  };
};
type Subscriber = { user_id: string; email: string; state: Record<string, any> };

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const formatDate = (date: string) => new Intl.DateTimeFormat("en", {
  month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
}).format(new Date(`${date}T12:00:00.000Z`));

const getTasks = (state: Record<string, any>): Task[] =>
  (Array.isArray(state.goals) ? state.goals : []).flatMap((goal: any) =>
    (Array.isArray(goal.projects) ? goal.projects : []).flatMap((project: any) =>
      (Array.isArray(project.tasks) ? project.tasks : [])));

const getHabits = (state: Record<string, any>): Habit[] =>
  Array.isArray(state.habits) ? state.habits : [];

const dailyEmail = (state: Record<string, any>, today: string) => {
  const due = getTasks(state).filter(task => !task.done && task.due && task.due <= today)
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const habits = getHabits(state).filter(habit => habit.kind !== "weekly")
    .filter(habit => (habit.log?.[today] || 0) < (habit.target || 1));
  const dueHtml = due.length
    ? `<ul>${due.slice(0, 8).map(task => `<li>${escapeHtml(task.t)} <small>${task.due! < today ? "Overdue" : "Due today"}</small></li>`).join("")}</ul>`
    : "<p>You have no overdue or due-today tasks.</p>";
  const habitHtml = habits.length
    ? `<ul>${habits.slice(0, 8).map(habit => `<li>${escapeHtml(habit.name)}</li>`).join("")}</ul>`
    : "<p>Your daily habits are complete.</p>";
  return {
    subject: `Your Hoptasks plan for ${formatDate(today)}`,
    html: emailLayout("A fresh day, a clear plan", `Here is your Hoptasks check-in for ${formatDate(today)}.`, [
      ["Tasks to review", dueHtml], ["Habits to keep moving", habitHtml],
    ]),
  };
};

const weeklyEmail = (state: Record<string, any>, start: string) => {
  const end = shiftDate(start, 6);
  const days = [...Array(7)].map((_, index) => shiftDate(start, index));
  const goals = Array.isArray(state.goals) ? state.goals : [];
  const weekTasks = goals.flatMap((goal: any) =>
    (Array.isArray(goal.projects) ? goal.projects : []).flatMap((project: any) =>
      (Array.isArray(project.tasks) ? project.tasks : [])
        .filter((task: Task) => task.due && task.due >= start && task.due <= end)
        .map((task: Task) => ({ task, goal }))));
  const completedTasks = weekTasks.filter(({ task }) => task.done && (!task.doneOn || task.doneOn <= end));
  const completionRate = weekTasks.length ? Math.round(completedTasks.length / weekTasks.length * 100) : 0;
  const deadlinesMet = weekTasks.filter(({ task }) => task.done && task.doneOn && task.doneOn <= task.due!).length;
  const weeklyGoals = new Map(weekTasks.map(({ goal }) => [goal.id || goal.title, goal]));
  const progressedGoals = new Set(completedTasks.map(({ goal }) => goal.id || goal.title)).size;
  const habits = getHabits(state);
  const habitRows = habits.map(habit => {
    if (habit.kind === "weekly") {
      const sessions = days.reduce((sum, day) => sum + (habit.log?.[day] || 0), 0);
      return `<li>${escapeHtml(habit.name)}: ${sessions}/${habit.target || 1} sessions</li>`;
    }
    const daysMet = days.filter(day => (habit.log?.[day] || 0) >= (habit.target || 1)).length;
    return `<li>${escapeHtml(habit.name)}: ${daysMet}/7 days</li>`;
  });
  const habitHtml = habitRows.length ? `<ul>${habitRows.join("")}</ul>` : "<p>No habits tracked this week.</p>";
  return {
    subject: `Your weekly Hoptasks progress · ${formatDate(start)}`,
    html: emailLayout("Your week in Hoptasks", `${formatDate(start)} – ${formatDate(end)}`, [
      ["Tasks completed", `<strong>${completedTasks.length}/${weekTasks.length}</strong>`],
      ["Completion rate", `<strong>${completionRate}%</strong>`],
      ["Goals progressed", `<strong>${progressedGoals}/${weeklyGoals.size}</strong>`],
      ["Deadlines met", `<strong>${deadlinesMet}/${weekTasks.length}</strong>`],
      ["Consistency", habitHtml],
    ]),
  };
};

const monthlyEmail = (state: Record<string, any>, start: string, end: string) => {
  const tasks = getTasks(state);
  const completed = tasks.filter(task => task.done && task.doneOn && task.doneOn >= start && task.doneOn <= end);
  const activeDays = new Set(completed.map(task => task.doneOn));
  const habitSessions = getHabits(state).reduce((sum, habit) => sum + Object.entries(habit.log || {})
    .filter(([date]) => date >= start && date <= end).reduce((total, [date, value]) => {
      if (Number(value) > 0) activeDays.add(date);
      return total + (Number(value) || 0);
    }, 0), 0);
  const reviews = (Array.isArray(state.reviews) ? state.reviews : [])
    .filter((review: any) => review.type === "month" && review.date >= start && review.date <= end && review.w);
  const goalWins = (Array.isArray(state.goals) ? state.goals : []).filter((goal: any) => {
    const goalTasks = getTasks({ goals: [goal] });
    return goalTasks.length > 0 && goalTasks.every(task => task.done)
      && goalTasks.some(task => task.doneOn && task.doneOn >= start && task.doneOn <= end);
  });
  const reviewHtml = reviews.length
    ? `<ul>${reviews.slice(0, 4).map((review: any) => `<li>${escapeHtml(review.w)}</li>`).join("")}</ul>`
    : "<p>Keep a note of the moments you are proud of. They belong in next month’s recap.</p>";
  const goalHtml = goalWins.length
    ? `<ul>${goalWins.slice(0, 5).map((goal: any) => `<li>${escapeHtml(goal.title)}</li>`).join("")}</ul>`
    : "<p>Keep building; every completed task adds up.</p>";
  return {
    subject: `Your Hoptasks wins from ${new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${start}T12:00:00.000Z`))}`,
    html: emailLayout("A month of progress", `${formatDate(start)} – ${formatDate(end)}`, [
      ["Tasks completed", `<strong>${completed.length}</strong>`],
      ["Habit sessions", `<strong>${habitSessions}</strong> <span>across ${activeDays.size} task-active days</span>`],
      ["Goals completed", goalHtml],
      ["Wins from your monthly review", reviewHtml],
    ]),
  };
};

function emailLayout(title: string, subtitle: string, sections: [string, string][]) {
  return `<!doctype html><html><body style="margin:0;background:#f3f7f4;color:#20312b;font:16px/1.6 Arial,sans-serif"><main style="max-width:600px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dce8e2;border-radius:14px"><div style="color:#267b65;font-weight:bold;letter-spacing:2px;font-size:12px">HOPTASKS</div><h1 style="margin:12px 0 4px;font-size:27px">${escapeHtml(title)}</h1><p style="margin:0 0 24px;color:#687b72">${escapeHtml(subtitle)}</p>${sections.map(([heading, content]) => `<section style="padding:16px 0;border-top:1px solid #e5eee8"><h2 style="margin:0 0 8px;font-size:17px">${escapeHtml(heading)}</h2>${content}</section>`).join("")}<p style="margin:24px 0 0;color:#718078;font-size:12px">You received this because email updates are enabled in your Hoptasks settings.</p></main></body></html>`;
}

const normalizeTimezone = (timezone?: string) => ({
  "GMT+1": "Africa/Lagos", "GMT+2": "Europe/Paris", "GMT+5:30": "Asia/Kolkata",
}[timezone || ""] || timezone || "UTC");

const localClock = (now: Date, timezone: string) => {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
  }
  const part = (type: string) => parts.find(value => value.type === type)?.value || "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
    weekday: ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[part("weekday")] || 1,
  };
};

async function sendEmail(to: string, subject: string, html: string, idempotencyKey: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from: Deno.env.get("MAIL_FROM"), to: [to], subject, html }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

Deno.serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const cronSecret = Deno.env.get("EMAIL_CRON_SECRET");
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!Deno.env.get("RESEND_API_KEY") || !Deno.env.get("MAIL_FROM")) {
    return Response.json({ error: "Mail provider secrets are not configured." }, { status: 500 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("get_focus_email_subscribers");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];
  const now = new Date();
  for (const subscriber of (data || []) as Subscriber[]) {
    const profile = (subscriber.state?.profile || {}) as Profile;
    const prefs = profile.emailPreferences || {
      dailyReminder: profile.notifications !== false,
      dailyTime: "08:00",
      weeklyMetrics: false,
      weeklyDay: 1,
      monthlyWins: false,
      monthlyDay: 1,
    };
    const clock = localClock(now, normalizeTimezone(profile.timezone));
    const previousMonthEnd = shiftDate(`${clock.date.slice(0, 7)}-01`, -1);
    const previousMonthStart = `${previousMonthEnd.slice(0, 7)}-01`;
    const mondayOffset = clock.weekday === 7 ? 6 : clock.weekday - 1;
    const previousWeekStart = shiftDate(clock.date, -mondayOffset - 7);
    const candidates: { kind: "daily" | "weekly" | "monthly"; period: string; email: { subject: string; html: string } }[] = [];

    if (prefs.dailyReminder && /^\d{2}:\d{2}$/.test(prefs.dailyTime || "") && prefs.dailyTime === clock.time) {
      candidates.push({ kind: "daily", period: clock.date, email: dailyEmail(subscriber.state, clock.date) });
    }
    if (prefs.weeklyMetrics && Number(prefs.weeklyDay) === clock.weekday) {
      candidates.push({ kind: "weekly", period: previousWeekStart, email: weeklyEmail(subscriber.state, previousWeekStart) });
    }
    if (prefs.monthlyWins && Number(prefs.monthlyDay || 1) === Number(clock.date.slice(8, 10))) {
      candidates.push({ kind: "monthly", period: previousMonthStart, email: monthlyEmail(subscriber.state, previousMonthStart, previousMonthEnd) });
    }
    for (const candidate of candidates) {
      const { data: claimed, error: claimError } = await supabase.rpc("claim_focus_email_delivery", {
        p_user_id: subscriber.user_id,
        p_email_kind: candidate.kind,
        p_period_start: candidate.period,
      });
      if (claimError) {
        failures.push(`${subscriber.user_id}: ${claimError.message}`);
        continue;
      }
      if (!claimed) {
        skipped++;
        continue;
      }
      try {
        await sendEmail(subscriber.email, candidate.email.subject, candidate.email.html,
          `focus-${subscriber.user_id}-${candidate.kind}-${candidate.period}`);
        sent++;
      } catch (sendError) {
        await supabase.rpc("release_focus_email_delivery", {
          p_user_id: subscriber.user_id,
          p_email_kind: candidate.kind,
          p_period_start: candidate.period,
        });
        failures.push(`${subscriber.user_id}: ${String(sendError)}`);
      }
    }
  }
  return Response.json({ sent, skipped, failures });
});