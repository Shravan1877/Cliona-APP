import React, { useEffect, useRef } from "react";
import gsap from "gsap";

interface GsapSerifHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * The heading text or node elements. Can be a string (supports multi-line split) or an array of lines.
   */
  children?: string | string[];
  lines?: string[];
  className?: string;
  tag?: "h1" | "h2" | "h3" | "h4" | "span" | "div";
  key?: any;
}

export default function GsapSerifHeader({
  children,
  lines: propLines,
  className = "",
  tag: Tag = "h1",
}: GsapSerifHeaderProps) {
  const containerRef = useRef<HTMLHeadingElement>(null);

  const finalLines: string[] = React.useMemo(() => {
    if (propLines && propLines.length > 0) return propLines;
    if (typeof children === "string") {
      return children.split("\n");
    }
    if (Array.isArray(children)) {
      return children.filter((c) => typeof c === "string") as string[];
    }
    return [];
  }, [children, propLines]);

  useEffect(() => {
    if (!containerRef.current || finalLines.length === 0) return;

    const elements = containerRef.current.querySelectorAll(".mask-line-content");
    if (elements.length === 0) return;

    // Set initial state
    gsap.set(elements, { y: "100%" });

    // Rhythmic, high-end editorial cascade on mount
    gsap.to(elements, {
      y: 0,
      duration: 1.0,
      ease: "power2.out", // Smooth easeOutQuart transition
      stagger: 0.15, // exactly 0.15s stagger
      force3D: true,
    });
  }, [finalLines]);

  return (
    <Tag
      ref={containerRef as any}
      className={`font-serif tracking-tight text-[var(--text-primary)] ${className}`}
    >
      {finalLines.map((line, idx) => (
        <span
          key={idx}
          className="block overflow-hidden relative"
          style={{ verticalAlign: "top" }}
        >
          <span className="mask-line-content block transform will-change-transform">
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
}
