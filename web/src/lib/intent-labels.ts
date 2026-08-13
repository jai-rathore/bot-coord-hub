const LABELS: Record<string, string> = {
  schedule_meeting: "Schedule a meeting",
  coordinate_interviews: "Coordinate interviews",
  hiring_compatibility: "Check hiring compatibility",
};

export function intentLabel(slug: string): string {
  return (
    LABELS[slug] ??
    slug
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

export function taskStatusLabel(status: string): string {
  return (
    {
      open: "Getting started",
      proposed: "Time proposed",
      accepted: "Needs approval",
      confirmed: "Completed",
      declined: "Declined",
      cancelled: "Stopped",
    }[status] ?? status
  );
}
