"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { useLocale } from "../i18n";

export function PricingSection() {
  const { t } = useLocale();

  return (
    <section id="pricing" className="bg-[#05070b] text-white">
      <div className="mx-auto max-w-[1320px] px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
          {t.pricing.label}
        </p>
        <h2 className="mt-4 font-[family-name:var(--font-serif)] text-[2.6rem] leading-[1.05] tracking-[-0.03em] sm:text-[3.4rem] lg:text-[4.2rem]">
          {t.pricing.headlineMain}
          <br />
          <span className="text-white/40">{t.pricing.headlineFaded}</span>
        </h2>

        <div className="mt-16 grid gap-4 sm:grid-cols-3 sm:gap-6 lg:mt-20">
          {t.pricing.plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-8",
                plan.highlighted
                  ? "border-white/20 bg-white/5"
                  : "border-white/8 bg-white/[0.025]",
              )}
            >
              {plan.badge && (
                <span className="absolute right-6 top-6 inline-flex items-center rounded-full border border-white/14 bg-white/8 px-2.5 py-0.5 text-[11px] font-semibold text-white/70">
                  {plan.badge}
                </span>
              )}

              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/44">
                  {plan.name}
                </p>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="font-[family-name:var(--font-serif)] text-[3rem] leading-none tracking-tight text-white">
                    {plan.price}
                  </span>
                  <span className="text-[14px] text-white/44">{plan.priceSub}</span>
                </div>
                <p className="mt-4 text-[14px] leading-[1.65] text-white/50">
                  {plan.description}
                </p>
              </div>

              <Link
                href={plan.ctaHref}
                className={cn(
                  "mt-8 inline-flex items-center justify-center rounded-[12px] px-5 py-3 text-[14px] font-semibold transition-colors",
                  plan.highlighted
                    ? "bg-white text-[#0a0d12] hover:bg-white/92"
                    : "border border-white/18 bg-white/6 text-white hover:bg-white/12",
                )}
              >
                {plan.cta}
              </Link>

              <ul className="mt-8 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-[14px] text-white/64">
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        plan.highlighted ? "text-white/80" : "text-white/40",
                      )}
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
