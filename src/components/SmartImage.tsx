import React, { useEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';

const loadedImageUrls = new Set<string>();

interface SmartImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export const SmartImage: React.FC<SmartImageProps> = ({
  src,
  alt,
  className = '',
  fallbackTitle,
}) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(() => Boolean(src && loadedImageUrls.has(src)));
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
    if (!src) {
      setLoaded(false);
      return;
    }
    if (loadedImageUrls.has(src) || imgRef.current?.complete) {
      loadedImageUrls.add(src);
      setLoaded(true);
    } else {
      setLoaded(false);
    }
  }, [src]);

  if (!src || errored) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[var(--sx-primary-container)]/50 via-[var(--sx-surface-high)] to-[var(--sx-surface-container)] p-3 text-center select-none ${className}`}
      >
        <Film className="w-6 h-6 text-[var(--sx-primary)] opacity-70 mb-1.5 shrink-0" />
        {fallbackTitle && (
          <span className="text-[11px] font-semibold text-[var(--sx-on-surface-muted)] line-clamp-2 leading-tight">
            {fallbackTitle}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-[var(--sx-surface-high)] ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-[var(--sx-surface-high)]" />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={() => {
          if (src) loadedImageUrls.add(src);
          setLoaded(true);
        }}
        onError={() => setErrored(true)}
        className={`w-full h-full object-cover transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform ${
          loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.035]'
        }`}
      />
    </div>
  );
};
