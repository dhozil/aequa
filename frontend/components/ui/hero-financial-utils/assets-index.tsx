import * as React from "react";

/**
 * Decorative artwork for the hero-financial section.
 *
 * The original template kept a stock dashboard image in `assets-index.tsx`
 * (EcommerceDash). Aequa Grants renders its dashboard frame with live on-chain
 * data instead, so this module only carries the brand glow artwork used as the
 * hero background accent (blurred rotated bars, same geometry as the template's
 * SVG, recolored to the paper/forest/brass palette).
 */
export function GlowBars({ className, ...rest }: React.ComponentProps<"svg">) {
  return (
    <svg
      width="358"
      height="483"
      viewBox="0 0 358 483"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...rest}
    >
      <g filter="url(#aq-fin-blur-a)">
        <rect
          x="-86.9961"
          y="-33.114"
          width="72"
          height="541"
          rx="36"
          transform="rotate(-30.8182 -86.9961 -33.114)"
          fill="url(#aq-fin-glow-a)"
        />
      </g>
      <g filter="url(#aq-fin-blur-b)">
        <rect
          x="-17"
          y="-135.113"
          width="50.0937"
          height="541"
          rx="25.0469"
          transform="rotate(-30.8182 -17 -135.113)"
          fill="url(#aq-fin-glow-b)"
        />
      </g>
      <defs>
        <filter
          id="aq-fin-blur-a"
          x="-137.641"
          y="-120.646"
          width="440.285"
          height="602.787"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="32" result="effect1_foregroundBlur_0_1" />
        </filter>
        <filter
          id="aq-fin-blur-b"
          x="-71.707"
          y="-215.486"
          width="429.598"
          height="599.69"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="32" result="effect1_foregroundBlur_0_1" />
        </filter>
        <linearGradient
          id="aq-fin-glow-a"
          x1="-50.9961"
          y1="-33.114"
          x2="-50.9961"
          y2="507.886"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#91bbfb" stopOpacity="0.55" />
          <stop offset="1" stopColor="#E6F1FF" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient
          id="aq-fin-glow-b"
          x1="8.04686"
          y1="-135.113"
          x2="8.04686"
          y2="405.887"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#8dbafd" stopOpacity="0.5" />
          <stop offset="1" stopColor="#c1d9f8" stopOpacity="0.8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default GlowBars;
