const LABELS: Record<string, string> = {
  schedule_meeting: "Schedule a meeting",
  coordinate_interviews: "Coordinate interviews",
  hiring_compatibility: "Check hiring compatibility",
  local_meetup: "Discover a local meetup",
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
      open: "In progress",
      proposed: "Times suggested",
      accepted: "Needs your OK",
      confirmed: "Booked",
      declined: "Declined",
      cancelled: "Stopped",
    }[status] ?? status
  );
}
