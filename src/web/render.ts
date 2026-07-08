import type { Response } from "express";

/** Merge Express request locals with page data (app.render does not include res.locals). */
function viewLocals(res: Response, data: Record<string, unknown>) {
  return { ...res.locals, ...data, h: res.locals.h };
}

/** Render a page view wrapped in the main layout. */
export function renderPage(res: Response, view: string, data: Record<string, unknown>, status = 200) {
  const locals = viewLocals(res, data);
  res.app.render(`pages/${view}`, locals, (err, body) => {
    if (err) {
      console.error("[render]", err);
      return res.status(500).render("layouts/main", {
        ...locals,
        body: `<div class="banner err"><strong>Render error</strong> — ${(err as Error).message}</div>`,
      });
    }
    res.status(status).render("layouts/main", { ...locals, body });
  });
}
