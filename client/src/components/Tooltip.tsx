import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../utils/ThemeContext';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  width?: number;
}

const Tooltip: React.FC<TooltipProps> = ({ 
  text, 
  children, 
  position = 'top',
  width = 300
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const { isDarkMode } = useTheme();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isVisible && tooltipRef.current && triggerRef.current) {
      const trigger = triggerRef.current.getBoundingClientRect();
      const tooltip = tooltipRef.current;
      const tooltipRect = tooltip.getBoundingClientRect();
      const padding = 8; // Space between trigger and tooltip
      
      // Reset position styles
      tooltip.style.top = '';
      tooltip.style.bottom = '';
      tooltip.style.left = '';
      tooltip.style.right = '';
      tooltip.style.transform = '';
      
      // Position based on the specified direction
      switch (position) {
        case 'top':
          tooltip.style.bottom = `${window.innerHeight - trigger.top + padding}px`;
          tooltip.style.left = `${trigger.left + trigger.width / 2}px`;
          tooltip.style.transform = 'translateX(-50%)';
          
          // Check if tooltip goes off the screen to the right
          if (trigger.left + tooltipRect.width / 2 > window.innerWidth) {
            tooltip.style.left = '';
            tooltip.style.right = '10px';
            tooltip.style.transform = '';
          }
          
          // Check if tooltip goes off the screen to the left
          if (trigger.left - tooltipRect.width / 2 < 0) {
            tooltip.style.left = '10px';
            tooltip.style.transform = '';
          }
          break;
          
        case 'bottom':
          tooltip.style.top = `${trigger.bottom + padding + window.scrollY}px`;
          tooltip.style.left = `${trigger.left + trigger.width / 2}px`;
          tooltip.style.transform = 'translateX(-50%)';
          
          // Check if tooltip goes off the screen to the right
          if (trigger.left + tooltipRect.width / 2 > window.innerWidth) {
            tooltip.style.left = '';
            tooltip.style.right = '10px';
            tooltip.style.transform = '';
          }
          
          // Check if tooltip goes off the screen to the left
          if (trigger.left - tooltipRect.width / 2 < 0) {
            tooltip.style.left = '10px';
            tooltip.style.transform = '';
          }
          break;
          
        case 'left':
          tooltip.style.right = `${window.innerWidth - trigger.left + padding}px`;
          tooltip.style.top = `${trigger.top + trigger.height / 2 + window.scrollY}px`;
          tooltip.style.transform = 'translateY(-50%)';
          break;
          
        case 'right':
          tooltip.style.left = `${trigger.right + padding}px`;
          tooltip.style.top = `${trigger.top + trigger.height / 2 + window.scrollY}px`;
          tooltip.style.transform = 'translateY(-50%)';
          
          // Check if tooltip goes off the screen to the right
          if (trigger.right + tooltipRect.width > window.innerWidth) {
            tooltip.style.left = '';
            tooltip.style.right = `${window.innerWidth - trigger.left + padding}px`;
          }
          break;
      }
    }
  }, [isVisible, position]);

  return (
    <div 
      ref={triggerRef}
      className="inline-block relative cursor-help"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      
      {isVisible && (
        <div 
          ref={tooltipRef}
          className={`fixed z-50 p-4 rounded-lg shadow-lg text-sm animate-fade-in
            ${isDarkMode 
              ? 'bg-gray-800 text-gray-200 border border-gray-700' 
              : 'bg-white text-gray-800 border border-gray-200'}`}
          style={{ 
            maxWidth: `${width}px`,
            whiteSpace: 'normal',
            pointerEvents: 'none'
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
};

export default Tooltip;
