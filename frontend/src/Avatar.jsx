// A simple 2D instructor. The mouth animates while `speaking` is true.
// Stage 5 will drive `speaking` from the real audio instead of a timer.
  export default function Avatar({ speaking, openness = 0 }) {
  return (
    <svg
      className={`avatar${speaking ? " speaking" : ""}`}
      viewBox="0 0 200 240"
      role="img"
      aria-label="Animated instructor"
    >
      {/* jacket */}
      <path
        d="M20 240 C20 190 55 172 100 172 C145 172 180 190 180 240 Z"
        fill="#6B7A3A"
      />
      {/* shirt collar */}
      <path d="M80 174 L100 204 L120 174 Z" fill="#E8E4D0" />
      {/* neck */}
      <rect x="86" y="138" width="28" height="38" rx="10" fill="#C98F63" />
      {/* head */}
      <ellipse cx="100" cy="100" rx="46" ry="54" fill="#D9A06F" />
      {/* hair */}
      <path
        d="M56 88 C56 56 78 44 100 44 C122 44 144 56 144 88 C136 72 120 68 100 68 C80 68 64 72 56 88 Z"
       fill="#2B2A24"
      />
      {/* eyebrows */}
      <path d="M72 88 L90 85" stroke="#2B2A24" strokeWidth="4" strokeLinecap="round" />
      <path d="M110 85 L128 88" stroke="#2B2A24" strokeWidth="4" strokeLinecap="round" />
      {/* eyes */}
      <ellipse className="eye" cx="81" cy="103" rx="5" ry="6" fill="#2B2A24" />
      <ellipse className="eye" cx="119" cy="103" rx="5" ry="6" fill="#2B2A24" />
      {/* nose */}
      <path
        d="M100 108 C97 120 97 123 103 124"
        stroke="#B57A50"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* mouth */}
      <ellipse className="mouth" cx="100" cy="140" rx="14" ry="3" fill="#6B2D2D" style={{ transform: `scaleY(${1 + openness * 2})` }} />
    </svg>
  );
}
