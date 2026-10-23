'use client';

import { useEffect, useRef } from 'react';
import { CATS } from '@/lib/cats';

// A different cat on every visit, as in the home page's name block. Picked
// after load so the server-rendered page stays the same for every request.
export function RandomCat() {
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (imgRef.current) imgRef.current.src = CATS[Math.floor(Math.random() * CATS.length)];
  }, []);
  // eslint-disable-next-line @next/next/no-img-element -- picked at random after load, so it can't be server-rendered
  return <img ref={imgRef} alt="" className="cat" />;
}
