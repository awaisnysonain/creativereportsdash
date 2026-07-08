import "@/lib/load-env";
import express from "express";
import path from "node:path";
import { startWeeklyScheduler } from "@/lib/scheduler/weekly";
import { helpers } from "@/web/helpers";
import { pagesRouter } from "@/web/routes/pages";
import { apiRouter } from "@/web/routes/api";
import { renderPage } from "@/web/render";

/**
 * Creative Reports — Node.js (Express + EJS) server.
 *
 * Replaces the previous Next.js app. All business logic (services, parser,
 * analytics, jobs, db) is framework-agnostic and shared with the CLI scripts.
 */

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.locals.h = helpers;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "web", "views"));
app.set("x-powered-by", false);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public"), { maxAge: "1h" }));

// Helpers + nav state available to every view.
app.use((req, res, next) => {
  res.locals.h = helpers;
  res.locals.path = req.path;
  res.locals.title = "Creative Reports";
  res.locals.subtitle = "";
  res.locals.actions = "";
  next();
});

app.use("/api", apiRouter);
app.use("/", pagesRouter);

// 404
app.use((req, res) => {
  renderPage(res, "not-found", { title: "Not found", subtitle: req.path, actions: "" }, 404);
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server] error:", err.message);
  if (res.headersSent) return;
  res.status(500);
  if (_req.path.startsWith("/api")) {
    res.json({ ok: false, error: err.message });
  } else {
    renderPage(res, "error", { title: "Server error", subtitle: err.message, actions: "", message: err.message }, 500);
  }
});

app.listen(PORT, () => {
  const sched = startWeeklyScheduler();
  console.log(`\n  Creative Reports running → http://localhost:${PORT}`);
  if (sched.enabled && sched.started) {
    console.log(`  Weekly cron active → ${sched.day} ${sched.hour}:00 ${sched.timezone}\n`);
  } else {
    console.log("");
  }
});
