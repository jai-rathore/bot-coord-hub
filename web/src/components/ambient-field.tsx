/** Soft, living color field behind public heroes. Decorative only. */
export function AmbientField() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="hm-orb hm-orb-a" />
      <div className="hm-orb hm-orb-b" />
      <div className="hm-orb hm-orb-c" />
      <span className="hm-mote hm-mote-1" />
      <span className="hm-mote hm-mote-2" />
      <span className="hm-mote hm-mote-3" />
      <span className="hm-mote hm-mote-4" />
      <span className="hm-mote hm-mote-5" />
    </div>
  );
}
