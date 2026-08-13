"use client";

import Image from "next/image";
import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const BRAND_STATES = [
  { id: "ready", label: "Ready" },
  { id: "thinking", label: "Thinking" },
  { id: "coordinating", label: "Coordinating" },
  { id: "done", label: "Done" },
] as const;

type BrandState = (typeof BRAND_STATES)[number]["id"];

const MONOGRAM_PATHS: Record<BrandState, string> = {
  ready:
    "M380 568 C380 526 382 486 405 480 C430 474 440 500 432 522 C425 542 400 554 380 560 C420 526 480 528 486 566 C490 590 482 610 476 622 C506 532 576 536 580 572 C584 596 574 614 560 626",
  thinking:
    "M380 568 C380 520 388 478 414 482 C440 486 442 510 430 532 C420 550 398 558 380 560 C430 538 476 542 484 574 C490 598 480 614 470 624 C512 542 570 546 578 580 C584 604 570 622 552 630",
  coordinating:
    "M380 568 C380 526 382 486 405 480 C430 474 440 500 432 522 C425 542 400 554 380 560 C420 526 480 528 486 566 C490 590 482 610 476 622 C506 532 576 536 590 566 C600 584 620 590 646 582",
  done:
    "M380 568 C380 526 382 486 405 480 C430 474 440 500 432 522 C425 542 400 554 380 560 C420 526 480 528 486 566 C490 590 482 610 476 622 C506 532 544 588 566 600 C580 608 604 572 632 538",
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function AnimatedBrandHero() {
  const [animation, setAnimation] = useState({
    stateIndex: 0,
    fromPath: MONOGRAM_PATHS.ready,
  });
  const stageRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const { stateIndex, fromPath } = animation;
  const state = BRAND_STATES[stateIndex];
  const path = MONOGRAM_PATHS[state.id];

  const showNextState = useCallback(() => {
    setAnimation((current) => {
      const currentState = BRAND_STATES[current.stateIndex];
      return {
        stateIndex: (current.stateIndex + 1) % BRAND_STATES.length,
        fromPath: MONOGRAM_PATHS[currentState.id],
      };
    });
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(showNextState, 3400);
    return () => window.clearInterval(timer);
  }, [reducedMotion, showNextState]);

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (reducedMotion || !stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    stageRef.current.style.setProperty("--hm-pointer-x", `${x * 10}px`);
    stageRef.current.style.setProperty("--hm-pointer-y", `${y * 8}px`);
    stageRef.current.style.setProperty("--hm-rotate-x", `${y * -3}deg`);
    stageRef.current.style.setProperty("--hm-rotate-y", `${x * 4}deg`);
  };

  const resetPointer = () => {
    if (!stageRef.current) return;
    stageRef.current.style.setProperty("--hm-pointer-x", "0px");
    stageRef.current.style.setProperty("--hm-pointer-y", "0px");
    stageRef.current.style.setProperty("--hm-rotate-x", "0deg");
    stageRef.current.style.setProperty("--hm-rotate-y", "0deg");
  };

  return (
    <button
      ref={stageRef}
      type="button"
      className="hm-brand-stage"
      data-state={state.id}
      onClick={showNextState}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      aria-label="Animated HoneyMatcha mark. Activate to show its next state."
    >
      <span className="hm-brand-aura" aria-hidden="true" />

      <Image
        src="/honeymatcha-cup.webp"
        alt=""
        width={865}
        height={702}
        sizes="(max-width: 1024px) 92vw, 34rem"
        className="hm-brand-cup"
        priority
      />

      <Image
        src="/honeymatcha-dipper.webp"
        alt=""
        width={750}
        height={1007}
        sizes="(max-width: 1024px) 58vw, 21rem"
        className="hm-brand-dipper"
        priority
      />

      <svg
        viewBox="0 0 1000 1200"
        className="hm-brand-overlay"
        aria-hidden="true"
      >
        <defs>
          <filter id="hm-monogram-soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="blur" />
            <feOffset dy="2" result="offsetBlur" />
            <feFlood floodColor="#163b29" floodOpacity="0.22" />
            <feComposite in2="offsetBlur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="hm-honey-drop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7de8a" />
            <stop offset="45%" stopColor="#dfaa36" />
            <stop offset="100%" stopColor="#b77918" />
          </linearGradient>
        </defs>

        <path
          d={path}
          className="hm-brand-monogram"
          filter="url(#hm-monogram-soft)"
        >
          {!reducedMotion && fromPath !== path ? (
            <animate
              key={`${state.id}-${stateIndex}`}
              attributeName="d"
              from={fromPath}
              to={path}
              dur="650ms"
              fill="freeze"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.22 1 0.36 1"
            />
          ) : null}
        </path>

        <g className="hm-brand-drop">
          <path
            d="M535 448 C551 473 557 492 555 514 C553 535 541 547 528 544 C514 541 508 526 513 507 C518 486 529 470 535 448 Z"
            fill="url(#hm-honey-drop)"
          />
          <path
            d="M532 470 C536 478 537 486 534 493"
            fill="none"
            stroke="#fff3bd"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.78"
          />
        </g>

        <g className="hm-brand-thinking">
          <circle cx="326" cy="430" r="12" />
          <circle cx="290" cy="388" r="18" />
          <circle cx="250" cy="330" r="27" />
        </g>

        <g className="hm-brand-connections">
          <path d="M242 622 C174 542 174 430 252 356" />
          <path d="M718 606 C790 520 786 412 714 348" />
          <circle cx="252" cy="356" r="13" />
          <circle cx="242" cy="622" r="13" />
          <circle cx="714" cy="348" r="13" />
          <circle cx="718" cy="606" r="13" />
        </g>

        <g className="hm-brand-success">
          <circle cx="724" cy="620" r="54" />
          <path d="M697 620 L716 639 L752 598" />
          <path className="hm-brand-success-spark" d="M724 542 V518 M790 566 L808 548 M658 566 L640 548" />
        </g>
      </svg>

      <span className="hm-brand-status" aria-hidden="true">
        <span className="hm-brand-status-dot" />
        <span>{state.label}</span>
      </span>
    </button>
  );
}
