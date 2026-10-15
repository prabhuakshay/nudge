import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no pointer capture, which sonner and Radix call on pointer down.
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.hasPointerCapture = () => false;

afterEach(() => {
  cleanup();
});
