import React, { memo, useState } from 'react';
import { cn } from '@/utils/cn';

/** 显示国家/地区旗帜 (FlagCDN) */
export const RegionFlag = memo(function RegionFlag({
  code,
  className,
  fallback,
}: {
  code?: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const regionCode = (code || '').trim().toLowerCase();
  const [error, setError] = useState(false);

  if (!regionCode || regionCode.length !== 2 || error) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <span className={cn('font-mono font-bold text-gray-500 text-xs', className)} title={code}>
        {code || '?'}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${regionCode}.png`}
      srcSet={`https://flagcdn.com/w80/${regionCode}.png 2x`}
      alt={code}
      className={cn('w-6 h-auto object-contain rounded-xs shadow-sm inline-block', className)}
      loading="lazy"
      onError={() => setError(true)}
    />
  );
});

// Helper to check if a char is a regional indicator symbol
function isRegionalIndicator(char: string) {
  const codePoint = char.codePointAt(0);
  return codePoint && codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

// Helper to convert regional indicator pair to country code
function regionalIndicatorsToCode(first: string, second: string) {
  const A = 0x41;
  const REGIONAL_A = 0x1f1e6;
  const firstCode = first.codePointAt(0)! - REGIONAL_A + A;
  const secondCode = second.codePointAt(0)! - REGIONAL_A + A;
  return String.fromCodePoint(firstCode) + String.fromCodePoint(secondCode);
}

/**
 * 文本中包含 Emoji 旗帜时，替换为图片
 */
export const TextWithFlag = memo(function TextWithFlag({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  let buffer = '';
  const chars = Array.from(text);

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const nextChar = chars[i + 1];

    if (isRegionalIndicator(char) && nextChar && isRegionalIndicator(nextChar)) {
      // Flush buffer
      if (buffer) {
        parts.push(<span key={`text-${i}`}>{buffer}</span>);
        buffer = '';
      }
      // Add flag
      const code = regionalIndicatorsToCode(char, nextChar);
      parts.push(
        <RegionFlag
          key={`flag-${i}`}
          code={code}
          className="w-[1.4em] align-middle -mt-0.5 mx-0.5 shadow-none rounded-none"
          // If image fails, show the original emoji (fallback)
          // We can reconstruct the emoji from code or just use the chars
          fallback={
            <span className="font-emoji">
              {char}
              {nextChar}
            </span>
          }
        />
      );
      i++; // Skip next char
    } else {
      buffer += char;
    }
  }
  if (buffer) {
    parts.push(<span key="last">{buffer}</span>);
  }

  // If no flags found, return plain text wrapped in span
  if (parts.length === 0) return <span className={className}>{text}</span>;

  return <span className={className}>{parts}</span>;
});
