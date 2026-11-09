'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/core/utils';
import { tutorialVideoSources } from '@/lib/tour/welcome-tour';

interface StepVideoProps {
  /** File base name in public/tutorial (no extension), e.g. "discover". */
  name: string;
  /** Short description for assistive tech. */
  label: string;
  className?: string;
}

/**
 * A short muted looping screen recording. Renders nothing until the file has
 * actually loaded, so a step without a recording shows no empty box or broken
 * player. With reduced motion preferred it doesn't autoplay and shows controls.
 */
export function StepVideo({ name, label, className }: StepVideoProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // Server-rendered clips can finish loading before React attaches onLoadedData,
  // so the event is missed. Catch up from the element's own state on mount.
  useEffect(() => {
    const el = videoRef.current;
    if (el && el.readyState >= 2) setReady(true);
  }, []);

  if (failed) return null;

  const sources = tutorialVideoSources(name);

  return (
    <video
      ref={videoRef}
      className={cn(
        // No fixed aspect ratio: clips keep their own shape instead of being cropped.
        'h-auto w-full rounded-md border bg-muted',
        // Not display:none — the browser may defer loading a non-rendered video.
        !ready && 'invisible absolute',
        className,
      )}
      muted
      loop
      playsInline
      autoPlay={!reducedMotion}
      controls={reducedMotion}
      preload="metadata"
      aria-label={label}
      onLoadedData={() => setReady(true)}
      onCanPlay={() => setReady(true)}
    >
      {sources.map((source, i) => (
        <source
          key={source.src}
          src={source.src}
          type={source.type}
          // A <source> error doesn't bubble; the last one failing means none loaded.
          onError={i === sources.length - 1 ? () => setFailed(true) : undefined}
        />
      ))}
    </video>
  );
}
