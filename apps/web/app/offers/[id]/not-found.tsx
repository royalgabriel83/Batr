import Link from "next/link";

/** Same page whether the offer doesn't exist or isn't readable: its state is never revealed. */
export default function OfferNotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-12 md:px-6">
      <h1 className="text-h1">This offer isn&apos;t available</h1>
      <p className="text-body text-text-secondary">It may have been removed, or it isn&apos;t shown to others.</p>
      <Link href="/explore" className="inline-flex h-11 items-center self-start text-body-sm font-semibold text-accent-primary underline">
        Back to Explore
      </Link>
    </main>
  );
}
