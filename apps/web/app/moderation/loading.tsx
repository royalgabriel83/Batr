// Skeleton rows while cases load (milestone 8, W10; ui-context.md:
// skeletons, not spinners).
const bar = "animate-pulse rounded bg-bg-subtle motion-reduce:animate-none";

export default function ModerationLoading() {
  return (
    <main aria-busy="true" className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10 lg:px-8">
      <span className="sr-only" role="status">
        Loading cases
      </span>
      <div className={`h-10 w-40 ${bar}`} />
      <ul aria-hidden="true" className="flex flex-col divide-y divide-border-default rounded-xl bg-bg-surface ring-1 ring-border-default/70">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex flex-col gap-2 px-5 py-4">
            <div className={`h-3 w-1/3 ${bar}`} />
            <div className={`h-4 w-2/3 ${bar}`} />
            <div className={`h-3 w-1/2 ${bar}`} />
          </li>
        ))}
      </ul>
    </main>
  );
}
