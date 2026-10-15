const MORNING_ENDS = 12;
const AFTERNOON_ENDS = 18;

/** "Good morning", "Good afternoon" or "Good evening" for the given time. */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < MORNING_ENDS) return "Good morning";
  if (hour < AFTERNOON_ENDS) return "Good afternoon";
  return "Good evening";
}
