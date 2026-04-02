/**
 * MetricTooltip Component
 *
 * Displays an info icon (ℹ️) with a tooltip containing metric definition,
 * context, and healthy ranges.
 *
 * Features:
 * - Desktop: Shows on hover
 * - Mobile: Shows on tap, closes on tap outside
 * - Accessible: Proper aria labels and keyboard support
 */

'use client';

import { useState, useRef, useEffect } from 'react';

export interface TooltipContent {
  title: string;
  definition: string;
  whyItMatters: string;
  healthyRange?: string;
}

interface MetricTooltipProps {
  content: TooltipContent;
}

export function MetricTooltip({ content }: MetricTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{
    horizontal: 'left' | 'right';
    vertical: 'bottom' | 'top';
  }>({ horizontal: 'left', vertical: 'bottom' });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Calculate optimal tooltip position based on viewport
  useEffect(() => {
    if (isVisible && buttonRef.current && tooltipRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const padding = 16; // Padding from viewport edges

      // Determine horizontal position
      let horizontal: 'left' | 'right' = 'left';
      if (buttonRect.left + tooltipRect.width + padding > viewportWidth) {
        horizontal = 'right';
      }

      // Determine vertical position
      let vertical: 'bottom' | 'top' = 'bottom';
      const spaceBelow = viewportHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;

      // If not enough space below, show above
      if (
        spaceBelow < tooltipRect.height + padding &&
        spaceAbove > spaceBelow
      ) {
        vertical = 'top';
      }

      setPosition({ horizontal, vertical });
    }
  }, [isVisible]);

  // Handle click outside to close tooltip on mobile
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        tooltipRef.current &&
        buttonRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsVisible(false);
      }
    }

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isVisible]);

  return (
    <div className="relative inline-block">
      {/* Info Icon Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsVisible(!isVisible)}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="inline-flex items-center justify-center w-4 h-4 ml-1 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-full"
        aria-label={`More information about ${content.title}`}
        aria-expanded={isVisible}
      >
        <svg
          className="w-4 h-4"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Tooltip Popup */}
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`absolute w-64 sm:w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-[100] text-left ${
            position.horizontal === 'left' ? 'left-0' : 'right-0'
          } ${position.vertical === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'}`}
          role="tooltip"
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={() => setIsVisible(false)}
        >
          {/* Tooltip Arrow */}
          <div
            className={`absolute w-4 h-4 bg-white border-gray-200 transform ${
              position.vertical === 'bottom'
                ? '-top-2 border-l border-t rotate-45'
                : '-bottom-2 border-r border-b rotate-45'
            } ${position.horizontal === 'left' ? 'left-1' : 'right-1'}`}
          ></div>

          {/* Tooltip Content */}
          <div className="relative space-y-3">
            <div>
              <h4 className="font-semibold text-gray-900 text-sm mb-1">
                {content.title}
              </h4>
              <div className="border-b border-gray-200"></div>
            </div>

            <div>
              <p className="text-xs text-gray-700 leading-relaxed">
                {content.definition}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-600 leading-relaxed">
                <span className="font-medium">Why it matters:</span>{' '}
                {content.whyItMatters}
              </p>
            </div>

            {content.healthyRange && (
              <div className="bg-blue-50 border border-blue-100 rounded px-3 py-2">
                <p className="text-xs text-blue-900">
                  <span className="font-medium">Healthy range:</span>{' '}
                  {content.healthyRange}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
