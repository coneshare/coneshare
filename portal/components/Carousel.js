"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Carousel({ images, autoPlayInterval = 5000 }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const goToPrevious = () => {
    const isFirstSlide = currentIndex === 0;
    const newIndex = isFirstSlide ? images.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
  };

  const goToNext = () => {
    const isLastSlide = currentIndex === images.length - 1;
    const newIndex = isLastSlide ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
  };

  const goToSlide = (slideIndex) => {
    setCurrentIndex(slideIndex);
  };

  useEffect(() => {
    if (!autoPlayInterval) return;
    const interval = setInterval(() => {
      goToNext();
    }, autoPlayInterval);
    return () => clearInterval(interval);
  }, [currentIndex, autoPlayInterval, goToNext]);

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="overflow-hidden rounded-lg shadow-xl border">
        <div
          className="flex transition-transform ease-in-out duration-500"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {images.map((image, index) => (
            <div key={index} className="w-full flex-shrink-0 bg-gray-100">
              <Image
                src={image.src}
                alt={image.alt}
                width={1200}
                height={750}
                className="w-full h-auto object-contain"
                priority={index === 0}
              />
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={goToPrevious}
        className="absolute top-1/2 left-2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-2 rounded-full shadow-md transition"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        onClick={goToNext}
        className="absolute top-1/2 right-2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-2 rounded-full shadow-md transition"
        aria-label="Next slide"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2">
        {images.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`h-3 w-3 rounded-full transition-all duration-300 ${
              currentIndex === index ? 'bg-white scale-125' : 'bg-white/50 hover:bg-white/80'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
