import createClient, { type Middleware } from "openapi-fetch";

import { needsCsrfToken, readCsrfToken } from "./csrf";
import type { paths } from "./schema";

const csrf: Middleware = {
  onRequest({ request }) {
    const token = readCsrfToken();
    if (token && needsCsrfToken(request.method)) {
      request.headers.set("X-CSRFToken", token);
    }
    return request;
  },
};

/**
 * Typed client for the Nudge API. Paths, parameters and responses come from the backend's
 * OpenAPI schema; run `npm run api:generate` after changing the API.
 */
export const api = createClient<paths>({
  baseUrl: globalThis.location.origin,
  credentials: "same-origin",
  // Look fetch up on every call rather than once at import, so tests can stub it.
  fetch: (request) => globalThis.fetch(request),
});
api.use(csrf);
