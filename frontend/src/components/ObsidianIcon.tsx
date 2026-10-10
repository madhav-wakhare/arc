/** Simple gem glyph in Lucide's stroke style for "export to Obsidian". */
export function ObsidianIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9.5 2.5 5 9l2 9.5 5 3 4.5-4L19 9l-4-6.5z" />
      <path d="M9.5 2.5 12 10l3-7.5M12 10l-7 -1M12 10l7-1M12 10l-5 8.5M12 10l4.5 7.5" />
    </svg>
  );
}
