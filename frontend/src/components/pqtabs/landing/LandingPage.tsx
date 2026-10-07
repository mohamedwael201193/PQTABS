"use client";

import { ScrollProgress } from "@/components/pqtabs/shared";
import LandingNav from "./LandingNav";
import Hero from "./Hero";
import StackMarquee from "./StackMarquee";
import ProblemSection from "./ProblemSection";
import InsightSection from "./InsightSection";
import HowItWorks from "./HowItWorks";
import SecuritySection from "./SecuritySection";
import WhyArc from "./WhyArc";
import WhyBarkeep from "./WhyBarkeep";
import ProductFlow from "./ProductFlow";
import TechnicalSection from "./TechnicalSection";
import FinalCta from "./FinalCta";
import LandingFooter from "./LandingFooter";

/**
 * LandingPage — the composed narrative, top to bottom:
 * the promise, the problem, the insight, the mechanism, the security
 * model, the stack, the product, the fine print, the close.
 */
export default function LandingPage({ onLaunchApp }: { onLaunchApp: () => void }) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground [&_section[id]]:scroll-mt-20">
      {/* Anchored sections stop 80px short of the viewport top so the
          fixed navigation never covers a section marker. */}
      <ScrollProgress />
      <LandingNav onLaunchApp={onLaunchApp} />
      <main>
        <Hero onLaunchApp={onLaunchApp} />
        <StackMarquee />
        <ProblemSection />
        <InsightSection />
        <HowItWorks />
        <SecuritySection />
        <WhyArc />
        <WhyBarkeep />
        <ProductFlow onLaunchApp={onLaunchApp} />
        <TechnicalSection />
        <FinalCta onLaunchApp={onLaunchApp} />
      </main>
      <LandingFooter />
    </div>
  );
}
