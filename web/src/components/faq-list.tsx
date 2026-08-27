import type { FaqItem } from "@/lib/seo";

export function FaqList({
  items,
  heading = "Questions people ask",
}: {
  items: readonly FaqItem[];
  heading?: string;
}) {
  return (
    <section aria-labelledby="faq-heading" className="mt-12">
      <h2
        id="faq-heading"
        className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-matcha-deep"
      >
        {heading}
      </h2>
      <dl className="mt-6 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <div key={item.question} className="py-5">
            <dt>
              <h3 className="text-base font-semibold text-ink">
                {item.question}
              </h3>
            </dt>
            <dd className="mt-2 text-sm leading-7 text-muted">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
