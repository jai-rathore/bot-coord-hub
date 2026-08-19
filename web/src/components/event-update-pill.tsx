export function EventUpdatePill({
  unreadCount,
  active = false,
}: {
  unreadCount: number;
  active?: boolean;
}) {
  if (unreadCount <= 0) return null;
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold ${
        active
          ? "bg-white text-matcha-deep"
          : "bg-honey-soft/70 text-[#7a5610]"
      }`}
    >
      {unreadCount === 1 ? "New" : `${unreadCount} updates`}
    </span>
  );
}
