import Link from "next/link";
export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="font-medium">Not found</p>
      <p className="mt-1 text-sm text-stone-500">It may not exist, or you may not have access.</p>
      <Link href="/orgs" className="mt-4 inline-block text-sm text-teal-700 underline">Back to your communities</Link>
    </div>
  );
}
