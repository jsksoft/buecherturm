import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Library' };

export default function LibraryPage() {
  return (
    <div>
      <h2 className="mb-1 text-2xl font-semibold">My Library</h2>
      <p className="text-[oklch(50%_0.02_75)]">Your books will appear here.</p>
    </div>
  );
}
