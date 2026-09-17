import React from 'react';

/**
 * Shared skeleton for server-rendered pages.
 *
 * Without a loading state an App Router navigation leaves the previous page on
 * screen for the whole server render — several hundred milliseconds in which
 * nothing acknowledges the click. Showing the page frame immediately is what
 * makes navigation feel instant.
 */
export const PageSkeleton: React.FC<{
  /** Rough shape of the page so the skeleton matches what arrives. */
  variant?: 'list' | 'cards' | 'form';
  title?: string;
}> = ({ variant = 'list', title }) => (
  <div className="animate-pulse" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading{title ? ` ${title}` : ''}…</span>

    <div className="mb-8 space-y-2">
      <div className="h-7 w-56 rounded-md bg-slate-200" />
      <div className="h-4 w-80 rounded bg-slate-100" />
    </div>

    {variant === 'cards' && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-4 w-24 rounded bg-slate-100" />
            <div className="mt-3 h-7 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    )}

    {variant === 'list' && (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-4"
          >
            <div className="h-9 w-9 rounded-full bg-slate-100 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-slate-200" />
              <div className="h-3 w-1/2 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    )}

    {variant === 'form' && (
      <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-10 w-full rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>
    )}
  </div>
);

export default PageSkeleton;
