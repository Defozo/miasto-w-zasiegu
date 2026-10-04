import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { LazyMotion, MotionConfig } from "motion/react";
import { m } from "motion/react";
import { motionReduced } from "./display-preferences";

const ReducedMotion = createContext(false);
const loadFeatures = () =>
  import("./motion-features").then((module) => module.default);

export const useCalmMotion = () => useContext(ReducedMotion);

export default function MotionPolicy({ children }: PropsWithChildren) {
  const [reduced, setReduced] = useState(motionReduced);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(motionReduced());
    media.addEventListener("change", update);
    window.addEventListener("przejscie-display-change", update);
    window.addEventListener("storage", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("przejscie-display-change", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return (
    <ReducedMotion.Provider value={reduced}>
      <LazyMotion features={loadFeatures} strict>
        <MotionConfig
          reducedMotion={reduced ? "always" : "user"}
          transition={{ duration: reduced ? 0 : 0.32 }}
        >
          {children}
        </MotionConfig>
      </LazyMotion>
    </ReducedMotion.Provider>
  );
}

/** Text stays visible even before the optional animation features finish loading. */
export function Reveal({
  children,
  className,
  delay = 0,
}: PropsWithChildren<{ className?: string; delay?: number }>) {
  const reduced = useCalmMotion();
  return (
    <m.div
      className={className}
      initial={reduced ? false : { y: 14 }}
      animate={reduced ? { y: 0 } : undefined}
      whileInView={{ y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{
        duration: reduced ? 0 : 0.5,
        delay: reduced ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </m.div>
  );
}
