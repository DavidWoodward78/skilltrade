const GRADIENTS = [
  "from-teal-500 to-emerald-600",
  "from-amber-400 to-orange-500",
  "from-sky-500 to-indigo-600",
  "from-rose-400 to-pink-600",
  "from-violet-500 to-purple-600",
  "from-lime-500 to-green-600",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Round profile photo, or initials on a colored gradient when there is no photo. */
export function Avatar({
  name,
  url,
  size = 40,
  className = "",
  ring = false,
}: {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  const ringCls = ring ? "ring-2 ring-white" : "";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className={`shrink-0 rounded-full object-cover ${ringCls} ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ${GRADIENTS[hash(name) % GRADIENTS.length]} ${ringCls} ${className}`}
      style={style}
    >
      {initials(name)}
    </span>
  );
}

/** Large photo panel for the swipe card. */
export function PhotoPanel({ name, url, children }: { name: string; url?: string | null; children?: React.ReactNode }) {
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-stone-200">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br text-7xl font-semibold text-white/90 ${GRADIENTS[hash(name) % GRADIENTS.length]}`}
        >
          {initials(name)}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-5 pt-24 text-white">
        {children}
      </div>
    </div>
  );
}
