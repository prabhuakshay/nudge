import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { afterAll, afterEach } from "vitest";

// jsdom has no pointer capture, which sonner and Radix call on pointer down.
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.hasPointerCapture = () => false;

// jsdom doesn't scroll, and logs each call to scrollTo, which the router makes on navigation.
window.scrollTo = () => undefined;

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

// cmdk measures its list and scrolls the active option into view, which jsdom can't do.
globalThis.ResizeObserver = class {
  observe() {
    return undefined;
  }
  unobserve() {
    return undefined;
  }
  disconnect() {
    return undefined;
  }
};
Element.prototype.scrollIntoView = () => undefined;

afterEach(() => {
  cleanup();
  // Toasts live in sonner's module state, which a new Toaster replays; start each test without any.
  toast.dismiss();
});

/** The longest timer a component leaves running as it closes or unmounts: vaul's drawer close. */
const LONGEST_UI_TIMER_MS = 500;

// Unmounting leaves timers running: Radix hands focus back, sonner removes toasts, dnd-kit detaches
// its listeners and vaul finishes closing a drawer. After a file's last test they would fire once
// the environment is torn down and fail with "window is not defined", so let them run first.
afterAll(() => new Promise((resolve) => setTimeout(resolve, LONGEST_UI_TIMER_MS + 100)));
