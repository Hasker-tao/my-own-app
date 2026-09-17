import type { AppStore, Entity } from "./store.js";

function plusDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function buildDashboard(store: AppStore, date: string): Record<string, any> {
  const horizon = plusDays(date, 3);

  const attention: Entity[] = [];
  attention.push(
    ...store
      .list("consultingDeliverables")
      .filter((item) => item.due_date && item.due_date <= horizon && item.status !== "done")
      .map((item) => ({ ...item, attention_type: "deliverable", module: "consulting" })),
  );
  attention.push(
    ...store
      .list("consultingFollowups")
      .filter((item) => item.followup_at?.slice(0, 10) <= date && item.status !== "done")
      .map((item) => ({ ...item, attention_type: "followup", module: "consulting", title: item.content })),
  );
  attention.push(
    ...store
      .list("workouts")
      .filter((item) => item.workout_date === date && item.status !== "completed")
      .map((item) => ({ ...item, attention_type: "workout", module: "fitness", title: item.name })),
  );

  const media = store.list("mediaContents");
  const devItems = store.list("devWorkItems");
  const followups = store.list("consultingFollowups");
  const workouts = store.list("workouts");
  const meals = store.list("meals");
  const entertainment = store.list("entertainmentItems");

  return {
    date,
    attention: attention.slice(0, 12),
    summaries: {
      media: media.filter((item) => ["producing", "ready"].includes(item.stage)).slice(0, 3),
      development: devItems.filter((item) => item.priority === "high" && item.status !== "done").slice(0, 3),
      consulting: followups.filter((item) => item.status !== "done").slice(0, 3),
      fitness: workouts.filter((item) => item.workout_date >= date).slice(0, 3),
      diet: meals.filter((item) => item.meal_date === date).slice(0, 4),
      entertainment: entertainment.filter((item) => item.status === "playing").slice(0, 3),
    },
  };
}
