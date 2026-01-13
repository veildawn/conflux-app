import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/utils/cn';
import { ipc } from '@/services/ipc';

const iconCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

function normalizeKey(processName?: string, processPath?: string) {
  const key = (processPath || processName || '').trim();
  if (!key || key.toLowerCase() === 'unknown') return '';
  return key;
}

async function fetchIcon(processName?: string, processPath?: string) {
  const key = normalizeKey(processName, processPath);
  if (!key) return null;

  const cached = iconCache.get(key);
  if (cached !== undefined) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const p = ipc
    .getProcessIcon({ processName, processPath })
    .then((res) => {
      iconCache.set(key, res ?? null);
      return res ?? null;
    })
    .catch(() => {
      iconCache.set(key, null);
      return null;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, p);
  return p;
}

const defer = (cb: () => void) => {
  if (typeof queueMicrotask === 'function') queueMicrotask(cb);
  else Promise.resolve().then(cb);
};

export function ProcessIcon({
  processName,
  processPath,
  className,
}: {
  processName?: string;
  processPath?: string;
  className?: string;
}) {
  const key = useMemo(() => normalizeKey(processName, processPath), [processName, processPath]);
  const [icon, setIcon] = useState<string | null>(() =>
    key ? (iconCache.get(key) ?? null) : null
  );

  const color = useMemo(() => {
    const s = (processPath || processName || '').trim();
    if (!s) return 0;
    // Simple stable hash
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }, [processName, processPath]);

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      defer(() => {
        if (!cancelled) setIcon(null);
      });
      return () => {
        cancelled = true;
      };
    }

    const cached = iconCache.get(key);
    if (cached !== undefined) {
      defer(() => {
        if (!cancelled) setIcon(cached);
      });
      return () => {
        cancelled = true;
      };
    }

    fetchIcon(processName, processPath).then((res) => {
      if (!cancelled) setIcon(res);
    });

    return () => {
      cancelled = true;
    };
  }, [key, processName, processPath]);

  const fallbackText = (processName || '')
    .trim()
    .replace(/\.exe$/i, '')
    .slice(0, 1)
    .toUpperCase();

  if (icon) {
    return (
      <img
        src={icon}
        alt={processName || 'Process'}
        className={cn('w-5 h-5 rounded-sm shrink-0', className)}
        draggable={false}
      />
    );
  }

  const fallbackColors = [
    // light mode bg / dark mode bg + readable text color
    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200 border-red-200/70 dark:border-red-800/60',
    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200 border-orange-200/70 dark:border-orange-800/60',
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200/70 dark:border-amber-800/60',
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200 border-yellow-200/70 dark:border-yellow-800/60',
    'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-200 border-lime-200/70 dark:border-lime-800/60',
    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200 border-green-200/70 dark:border-green-800/60',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-200/70 dark:border-emerald-800/60',
    'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200 border-teal-200/70 dark:border-teal-800/60',
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200 border-cyan-200/70 dark:border-cyan-800/60',
    'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200 border-sky-200/70 dark:border-sky-800/60',
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200 border-blue-200/70 dark:border-blue-800/60',
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200 border-indigo-200/70 dark:border-indigo-800/60',
    'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200 border-violet-200/70 dark:border-violet-800/60',
    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200 border-purple-200/70 dark:border-purple-800/60',
    'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-200 border-fuchsia-200/70 dark:border-fuchsia-800/60',
    'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-200 border-pink-200/70 dark:border-pink-800/60',
  ];
  const fallbackColor = fallbackColors[color % fallbackColors.length];

  return (
    <div
      className={cn(
        'w-5 h-5 rounded-sm shrink-0 border flex items-center justify-center text-[10px] font-semibold',
        fallbackColor,
        className
      )}
      title={processName || 'Unknown'}
    >
      {fallbackText || '?'}
    </div>
  );
}
