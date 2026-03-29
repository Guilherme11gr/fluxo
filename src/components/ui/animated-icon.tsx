"use client";

import { useEffect, useRef } from "react";
import { BotIcon, BotIconHandle } from "./bot";
import { SparklesIcon, SparklesIconHandle } from "./sparkles";
import { ZapIcon, ZapHandle } from "./zap";
import { BrainIcon, BrainIconHandle } from "./brain";

interface AnimatedIconProps {
  name: "bot" | "sparkles" | "zap" | "brain";
  size?: number;
  className?: string;
  interval?: number;
}

export function AnimatedIcon({ 
  name, 
  size = 28, 
  className,
  interval = 2000 
}: AnimatedIconProps) {
  const iconRef = useRef<BotIconHandle | SparklesIconHandle | ZapHandle | BrainIconHandle>(null);

  useEffect(() => {
    const animate = () => {
      iconRef.current?.startAnimation();
      setTimeout(() => {
        iconRef.current?.stopAnimation();
      }, 1000);
    };

    // Anima imediatamente
    animate();
    
    // Loop a cada intervalo
    const timer = setInterval(animate, interval);
    
    return () => clearInterval(timer);
  }, [interval]);

  switch (name) {
    case "bot":
      return <BotIcon ref={iconRef as React.RefObject<BotIconHandle>} size={size} className={className} />;
    case "sparkles":
      return <SparklesIcon ref={iconRef as React.RefObject<SparklesIconHandle>} size={size} className={className} />;
    case "zap":
      return <ZapIcon ref={iconRef as React.RefObject<ZapHandle>} size={size} className={className} />;
    case "brain":
      return <BrainIcon ref={iconRef as React.RefObject<BrainIconHandle>} size={size} className={className} />;
    default:
      return null;
  }
}
