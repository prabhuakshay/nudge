import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

// Module constants, not inline objects: dnd-kit memoizes sensors on these options. A mouse drag
// starts after 5 px so clicks still follow a row's link; touch needs a press and hold so the
// sidebar still scrolls; the keyboard picks up with Space, leaving Enter to follow the link.
const MOUSE = { activationConstraint: { distance: 5 } };
const TOUCH = { activationConstraint: { delay: 220, tolerance: 6 } };
const KEYBOARD = {
  coordinateGetter: sortableKeyboardCoordinates,
  keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
};

/** The sensors every sortable list in the sidebar drags with: mouse, touch and keyboard. */
export function useSidebarSensors() {
  return useSensors(
    useSensor(MouseSensor, MOUSE),
    useSensor(TouchSensor, TOUCH),
    useSensor(KeyboardSensor, KEYBOARD),
  );
}
