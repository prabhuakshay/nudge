import "@fontsource-variable/bricolage-grotesque";
import "./styles/globals.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createAppRouter, createQueryClient } from "./router";

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("index.html is missing the #root element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
