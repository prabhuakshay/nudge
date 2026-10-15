import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach } from "vitest";

// jsdom has no pointer capture, which sonner and Radix call on pointer down.
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.hasPointerCapture = () => false;

// jsdom has no media queries either; without a stub nothing matches, like a narrow phone screen.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    media: query,
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

afterEach(() => {
  cleanup();
  // Toasts live in sonner's module state, which a new Toaster replays; start each test without any.
  toast.dismiss();
});
