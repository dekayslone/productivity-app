import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Task = { t?: string; due?: string; done?: boolean; doneOn?: string };
type Habit = { name?: string; target?: number; kind?: string; log?: Record<string, number> };
type Profile = {
  timezone?: string;
  notifications?: boolean;
  accountabilityPartners?: { id?: string; email?: string; goalIds?: string[] }[];
  emailPreferences?: {
    dailyReminder?: boolean;
    dailyTime?: string;
    weeklyMetrics?: boolean;
    weeklyDay?: number;
    monthlyWins?: boolean;
    monthlyDay?: number;
    weeklyQuote?: boolean;
    weeklyQuoteDay?: number;
    weeklyQuoteTime?: string;
    whatsNew?: boolean;
    newsletter?: boolean;
  };
};
type Subscriber = { user_id: string; email: string; state: Record<string, any> };
type WelcomeSubscriber = { user_id: string; email: string; name: string };
type Campaign = { id: string; campaign_type: "whats_new" | "newsletter"; title: string; subject: string; content: string; publish_at: string };

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
  const sections: [string, string][] = [["Tasks to review", dueHtml]];
  if (!state.accountabilityScoped) sections.push(["Habits to keep moving", habitHtml]);
  return {
    subject: `Your Hoptasks plan for ${formatDate(today)}`,
    html: emailLayout("A fresh day, a clear plan", `Here is your Hoptasks check-in for ${formatDate(today)}.`, sections),
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
  const sections: [string, string][] = [
    ["Tasks completed", `<strong>${completedTasks.length}/${weekTasks.length}</strong>`],
    ["Completion rate", `<strong>${completionRate}%</strong>`],
    ["Goals progressed", `<strong>${progressedGoals}/${weeklyGoals.size}</strong>`],
    ["Deadlines met", `<strong>${deadlinesMet}/${weekTasks.length}</strong>`],
  ];
  if (!state.accountabilityScoped) sections.push(["Consistency", habitHtml]);
  return {
    subject: `Your weekly Hoptasks progress · ${formatDate(start)}`,
    html: emailLayout("Your week in Hoptasks", `${formatDate(start)} – ${formatDate(end)}`, sections),
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
  const sections: [string, string][] = [["Tasks completed", `<strong>${completed.length}</strong>`]];
  if (!state.accountabilityScoped) sections.push(["Habit sessions", `<strong>${habitSessions}</strong> <span>across ${activeDays.size} task-active days</span>`]);
  sections.push(["Goals completed", goalHtml]);
  if (!state.accountabilityScoped) sections.push(["Wins from your monthly review", reviewHtml]);
  return {
    subject: `Your Hoptasks wins from ${new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${start}T12:00:00.000Z`))}`,
    html: emailLayout("A month of progress", `${formatDate(start)} – ${formatDate(end)}`, sections),
  };
};

const weeklyQuotes = [
  "Start with one action that moves something important forward.",
  "A clear next step makes a large goal easier to approach.",
  "Protect a little time for the work you most want to finish.",
  "Progress grows when you return to what matters.",
  "Choose the next task with intention, then begin.",
  "A short, focused effort is still meaningful progress.",
];

const weeklyQuoteEmail = (periodStart: string) => {
  const weekNumber = Math.floor(Date.parse(`${periodStart}T00:00:00.000Z`) / 604800000);
  const quote = weeklyQuotes[((weekNumber % weeklyQuotes.length) + weeklyQuotes.length) % weeklyQuotes.length];
  return {
    subject: "A thought for your week · Hoptasks",
    html: emailLayout("A thought for your week", formatDate(periodStart), [["Your weekly quote", `<blockquote style="margin:0;font-size:20px">${escapeHtml(quote)}</blockquote>`]]),
  };
};

const welcomeEmail = (fullName: string) => {
  const name = String(fullName || "").trim().split(/\s+/)[0] || "there";
  return {
    subject: "Welcome to Hoptasks",
    html: emailLayout(`Welcome, ${name}!`, "Your account is verified and ready.", [[
      "Find your frog",
      `<p>There will always be something to do. The trick is knowing what to do first.</p>
      <p>Your biggest task is usually the one you’re most tempted to avoid. So don’t overthink it.</p>
      <p>Find the frog (task) and hop on it.</p>
      <p>One task at a time. One day at a time. One goal closer.</p>
      <p>Because productivity isn’t about doing everything. It’s about doing what matters. Your first task is waiting.</p>
      <p><strong>Ready to hop on it?</strong></p>
      <p style="margin:24px 0"><a href="https://dekayslone.github.io/productivity-app/" style="display:inline-block;padding:12px 24px;border-radius:8px;background:#267b65;color:#fff;font-weight:bold;text-decoration:none">Get Started →</a></p>
      <p>Welcome to HopTasks. 🐸</p>`,
    ]]),
  };
};

const campaignEmail = (campaign: Campaign, unsubscribeUrl: string) => ({
  subject: campaign.subject,
  html: emailLayout(campaign.title, formatDate(campaign.publish_at.slice(0, 10)),
    [["Message", campaign.content.split(/\r?\n/).filter(Boolean).map(line => `<p>${escapeHtml(line)}</p>`).join("")]])
    .replace("</main>", `<p style="margin:24px 0 0;color:#718078;font-size:12px"><a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe from these emails</a></p></main>`),
});

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

function parseMailSender(value: string) {
  const match = value.trim().match(/^(.*?)\s*<([^<>]+)>$/);
  const email = (match ? match[2] : value).trim();
  const name = (match?.[1] || "Hoptasks").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("MAIL_FROM must be a verified sender email address.");
  return { name, email };
}

async function sendEmail(to: string, subject: string, html: string, sender: { name: string; email: string }) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": Deno.env.get("BREVO_API_KEY")!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!response.ok) throw new Error(`Brevo returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

async function deliverTrackedEmail(
  supabase: ReturnType<typeof createClient>,
  to: string,
  email: { subject: string; html: string },
  sender: { name: string; email: string },
  claimRpc: string,
  claimArgs: Record<string, unknown>,
  markRpc: string,
  markArgs: Record<string, unknown>,
  releaseRpc: string,
  releaseArgs: Record<string, unknown>,
) {
  const { data: claimed, error: claimError } = await supabase.rpc(claimRpc, claimArgs);
  if (claimError) throw new Error(`Could not claim email delivery: ${claimError.message}`);
  if (!claimed) return false;
  try {
    await sendEmail(to, email.subject, email.html, sender);
  } catch (error) {
    const { error: releaseError } = await supabase.rpc(releaseRpc, releaseArgs);
    if (releaseError) throw new Error(`Email failed and retry status could not be released: ${releaseError.message}`);
    throw error;
  }
  const { error: markError } = await supabase.rpc(markRpc, markArgs);
  if (markError) throw new Error(`Email sent but delivery status could not be saved: ${markError.message}`);
  return true;
}

async function unsubscribeSignature(userId: string, preference: "whatsNew" | "newsletter") {
  const secret = Deno.env.get("EMAIL_CRON_SECRET");
  if (!secret) throw new Error("Unsubscribe signing secret is not configured.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = `${userId}:${preference}`;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return btoa(String.fromCharCode(...signature)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function unsubscribeResponse(request: Request) {
  const requestUrl = new URL(request.url);
  const params = request.method === "GET" ? requestUrl.searchParams : new URLSearchParams(await request.text());
  const userId = params.get("user") || "";
  const preference = params.get("type");
  const signature = params.get("signature") || "";
  if (!userId || (preference !== "whatsNew" && preference !== "newsletter")) return new Response("Invalid unsubscribe link.", { status: 400 });
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return new Response("Invalid unsubscribe link.", { status: 403 });
  const secret = Deno.env.get("EMAIL_CRON_SECRET");
  if (!secret) return new Response("Unsubscribe service is not configured.", { status: 500 });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const payload = `${userId}:${preference}`;
  const signatureBytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/") + "="), character => character.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(payload));
  if (!valid) return new Response("Invalid unsubscribe link.", { status: 403 });
  if (request.method === "GET") {
    const action = `${requestUrl.origin}${requestUrl.pathname}?unsubscribe=confirm`;
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Manage email preferences</title><main><h1>Unsubscribe</h1><p>Confirm to stop receiving these emails.</p><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="user" value="${escapeHtml(userId)}"><input type="hidden" name="type" value="${preference}"><input type="hidden" name="signature" value="${signature}"><button type="submit">Unsubscribe</button></form></main></html>`, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: updated, error } = await supabase.rpc("unsubscribe_focus_email", {
    p_user_id: userId,
    p_preference: preference,
  });
  if (error) return new Response("Could not update email preferences. Please try again later.", { status: 500 });
  if (!updated) return new Response("Account data was not found.", { status: 404 });
  return new Response("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Email preferences updated</title><main><h1>You are unsubscribed</h1><p>Your email preferences have been updated. You will continue to receive account and task emails you have enabled separately.</p></main></html>", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function campaignUnsubscribeUrl(userId: string, preference: "whatsNew" | "newsletter", signature: string) {
  const url = new URL(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-focus-emails`);
  url.searchParams.set("user", userId);
  url.searchParams.set("type", preference);
  url.searchParams.set("signature", signature);
  return url.toString();
}

Deno.serve(async request => {
  if (request.method === "GET") return await unsubscribeResponse(request);
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (new URL(request.url).searchParams.has("unsubscribe")) return await unsubscribeResponse(request);
  const cronSecret = Deno.env.get("EMAIL_CRON_SECRET");
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const brevoApiKey = Deno.env.get("BREVO_API_KEY"), mailFrom = Deno.env.get("MAIL_FROM");
  if (!brevoApiKey || !mailFrom) {
    return Response.json({ error: "Mail provider secrets are not configured." }, { status: 500 });
  }
  let sender: { name: string; email: string };
  try {
    sender = parseMailSender(mailFrom);
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: welcomeUsers, error: welcomeError } = await supabase.rpc("get_pending_welcome_emails");
  if (welcomeError) return Response.json({ error: welcomeError.message }, { status: 500 });
  const { data, error } = await supabase.rpc("get_focus_email_subscribers");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const { data: campaigns, error: campaignError } = await supabase.rpc("get_due_email_campaigns");
  if (campaignError) return Response.json({ error: campaignError.message }, { status: 500 });
  const { data: marketingUnsubscribes, error: unsubscribeError } = await supabase.rpc("get_email_marketing_unsubscribes");
  if (unsubscribeError) return Response.json({ error: unsubscribeError.message }, { status: 500 });
  const unsubscribedPreferences = new Set(
    (marketingUnsubscribes || []).map((entry: { user_id: string; preference: string }) => `${entry.user_id}:${entry.preference}`),
  );

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];
  const now = new Date();
  for (const recipient of (welcomeUsers || []) as WelcomeSubscriber[]) {
    const { data: claimed, error: claimError } = await supabase.rpc("claim_welcome_email_delivery", { p_user_id: recipient.user_id });
    if (claimError) {
      failures.push(`${recipient.user_id}: welcome email claim failed: ${claimError.message}`);
      continue;
    }
    if (!claimed) continue;
    try {
      const email = welcomeEmail(recipient.name);
      await sendEmail(recipient.email, email.subject, email.html, sender);
      const { error: markError } = await supabase.rpc("mark_welcome_email_delivery_sent", { p_user_id: recipient.user_id });
      if (markError) failures.push(`${recipient.user_id}: welcome email sent but status could not be saved: ${markError.message}`);
      sent++;
    } catch (sendError) {
      const { error: releaseError } = await supabase.rpc("release_welcome_email_delivery", { p_user_id: recipient.user_id });
      if (releaseError) failures.push(`${recipient.user_id}: welcome email retry cleanup failed: ${releaseError.message}`);
      failures.push(`${recipient.user_id}: welcome email failed: ${String(sendError)}`);
    }
  }
  for (const subscriber of (data || []) as Subscriber[]) {
    const profile = (subscriber.state?.profile || {}) as Profile;
    const prefs = {
      dailyReminder: false,
      dailyTime: "08:00",
      weeklyMetrics: false,
      weeklyDay: 1,
      monthlyWins: false,
      monthlyDay: 1,
      weeklyQuote: false,
      weeklyQuoteDay: 1,
      weeklyQuoteTime: "08:00",
      whatsNew: false,
      newsletter: false,
      ...profile.emailPreferences,
    };
    prefs.whatsNew = profile.emailPreferences?.whatsNew !== false;
    prefs.newsletter = profile.emailPreferences?.newsletter !== false;
    prefs.dailyReminder = profile.emailPreferences?.dailyReminder ?? profile.notifications !== false;
    const clock = localClock(now, normalizeTimezone(profile.timezone));
    const previousMonthEnd = shiftDate(`${clock.date.slice(0, 7)}-01`, -1);
    const previousMonthStart = `${previousMonthEnd.slice(0, 7)}-01`;
    const mondayOffset = clock.weekday === 7 ? 6 : clock.weekday - 1;
    const previousWeekStart = shiftDate(clock.date, -mondayOffset - 7);
    const candidates: { kind: "daily" | "weekly" | "monthly"; period: string; buildEmail: (state: Record<string, any>) => { subject: string; html: string } }[] = [];

    if (prefs.dailyReminder && /^\d{2}:\d{2}$/.test(prefs.dailyTime || "") && prefs.dailyTime === clock.time) {
      candidates.push({ kind: "daily", period: clock.date, buildEmail: state => dailyEmail(state, clock.date) });
    }
    if (prefs.weeklyMetrics && Number(prefs.weeklyDay) === clock.weekday) {
      candidates.push({ kind: "weekly", period: previousWeekStart, buildEmail: state => weeklyEmail(state, previousWeekStart) });
    }
    if (prefs.monthlyWins && Number(prefs.monthlyDay || 1) === Number(clock.date.slice(8, 10))) {
      candidates.push({ kind: "monthly", period: previousMonthStart, buildEmail: state => monthlyEmail(state, previousMonthStart, previousMonthEnd) });
    }
    if (prefs.weeklyQuote && Number(prefs.weeklyQuoteDay || 1) === clock.weekday
      && /^\d{2}:\d{2}$/.test(prefs.weeklyQuoteTime || "08:00") && (prefs.weeklyQuoteTime || "08:00") === clock.time) {
      try {
        const delivered = await deliverTrackedEmail(
          supabase, subscriber.email, weeklyQuoteEmail(previousWeekStart), sender,
          "claim_weekly_quote_delivery", { p_user_id: subscriber.user_id, p_period_start: previousWeekStart },
          "mark_weekly_quote_delivery_sent", { p_user_id: subscriber.user_id, p_period_start: previousWeekStart },
          "release_weekly_quote_delivery", { p_user_id: subscriber.user_id, p_period_start: previousWeekStart },
        );
        if (delivered) sent++; else skipped++;
      } catch (quoteError) {
        failures.push(`${subscriber.user_id}: weekly quote failed: ${String(quoteError)}`);
      }
    }
    for (const candidate of candidates) {
      const recipients: { email: string; key: string; state: Record<string, any> }[] = [
        { email: subscriber.email, key: "owner", state: subscriber.state },
      ];
      const recipientByEmail = new Map([[subscriber.email.toLowerCase(), recipients[0]]]);
      const stateGoals = Array.isArray(subscriber.state?.goals) ? subscriber.state.goals : [];
      for (const [index, partner] of (Array.isArray(profile.accountabilityPartners) ? profile.accountabilityPartners : []).entries()) {
        const email = String(partner?.email || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.toLowerCase() === subscriber.email.toLowerCase()) continue;
        const goalIds = Array.isArray(partner.goalIds) ? partner.goalIds : [];
        const goals = stateGoals.filter((goal: any) => goalIds.includes(String(goal.id)));
        if (!goals.length) continue;
        const emailKey = email.toLowerCase(), existing = recipientByEmail.get(emailKey);
        if (existing) {
          existing.state.goals = [...new Map([...existing.state.goals, ...goals].map((goal: any) => [String(goal.id), goal])).values()];
          continue;
        }
        const scopedState = { ...subscriber.state, goals, habits: [], reviews: [], tasks: [], accountabilityScoped: true };
        const recipient = { email, key: String(partner.id || `partner-${index}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80), state: scopedState };
        recipientByEmail.set(emailKey, recipient);
        recipients.push(recipient);
      }
      for (const recipient of recipients) {
        const email = candidate.buildEmail(recipient.state);
        const ownerName = String(subscriber.state?.profile?.name || "Your accountability partner").trim();
        const outgoingEmail = recipient.key === "owner" ? email : {
          subject: email.subject.replace(/^Your /, `${ownerName}'s `),
          html: email.html
            .replace("</h1>", `</h1><p style="margin:0 0 16px;color:#687b72">${escapeHtml(ownerName)} shared this accountability update with you.</p>`)
            .replace("You received this because email updates are enabled in your Hoptasks settings.", `${escapeHtml(ownerName)} shared selected goal updates with you through Hoptasks.`),
        };
        const partnerRecipient = recipient.key !== "owner";
        const claimRpc = partnerRecipient ? "claim_accountability_email_delivery" : "claim_focus_email_delivery";
        const claimArgs = partnerRecipient ? {
          p_user_id: subscriber.user_id,
          p_recipient_key: recipient.key,
          p_email_kind: candidate.kind,
          p_period_start: candidate.period,
        } : {
          p_user_id: subscriber.user_id,
          p_email_kind: candidate.kind,
          p_period_start: candidate.period,
        };
        const { data: claimed, error: claimError } = await supabase.rpc(claimRpc, claimArgs);
        if (claimError) {
          failures.push(`${subscriber.user_id}/${recipient.key}: ${claimError.message}`);
          continue;
        }
        if (!claimed) {
          skipped++;
          continue;
        }
        try {
          await sendEmail(recipient.email, outgoingEmail.subject, outgoingEmail.html, sender);
          sent++;
          const markRpc = partnerRecipient ? "mark_accountability_email_delivery_sent" : "mark_focus_email_delivery_sent";
          const markArgs = partnerRecipient ? {
            p_user_id: subscriber.user_id,
            p_recipient_key: recipient.key,
            p_email_kind: candidate.kind,
            p_period_start: candidate.period,
          } : {
            p_user_id: subscriber.user_id,
            p_email_kind: candidate.kind,
            p_period_start: candidate.period,
          };
          const { error: markError } = await supabase.rpc(markRpc, markArgs);
          if (markError) failures.push(`${subscriber.user_id}/${recipient.key}: email sent but delivery status could not be saved: ${markError.message}`);
        } catch (sendError) {
          const releaseRpc = partnerRecipient ? "release_accountability_email_delivery" : "release_focus_email_delivery";
          const releaseArgs = partnerRecipient ? {
            p_user_id: subscriber.user_id,
            p_recipient_key: recipient.key,
            p_email_kind: candidate.kind,
            p_period_start: candidate.period,
          } : {
            p_user_id: subscriber.user_id,
            p_email_kind: candidate.kind,
            p_period_start: candidate.period,
          };
          const { error: releaseError } = await supabase.rpc(releaseRpc, releaseArgs);
          if (releaseError) failures.push(`${subscriber.user_id}/${recipient.key}: delivery retry cleanup failed: ${releaseError.message}`);
          failures.push(`${subscriber.user_id}/${recipient.key}: ${String(sendError)}`);
        }
      }
    }
  }
  for (const campaign of (campaigns || []) as Campaign[]) {
    for (const subscriber of (data || []) as Subscriber[]) {
      const prefs = subscriber.state?.profile?.emailPreferences || {};
      const preference = campaign.campaign_type === "whats_new" ? "whatsNew" : "newsletter";
      if (prefs[preference] === false || unsubscribedPreferences.has(`${subscriber.user_id}:${preference}`)) continue;
      try {
        const signature = await unsubscribeSignature(subscriber.user_id, preference);
        const delivered = await deliverTrackedEmail(
          supabase, subscriber.email, campaignEmail(campaign, campaignUnsubscribeUrl(subscriber.user_id, preference, signature)), sender,
          "claim_email_campaign_delivery", { p_campaign_id: campaign.id, p_user_id: subscriber.user_id },
          "mark_email_campaign_delivery_sent", { p_campaign_id: campaign.id, p_user_id: subscriber.user_id },
          "release_email_campaign_delivery", { p_campaign_id: campaign.id, p_user_id: subscriber.user_id },
        );
        if (delivered) sent++; else skipped++;
      } catch (campaignSendError) {
        failures.push(`${subscriber.user_id}/${campaign.id}: campaign email failed: ${String(campaignSendError)}`);
      }
    }
  }
  return Response.json({ sent, skipped, failures });
});