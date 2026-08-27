export function JsonLd({ data }: { data: object | object[] }) {
  const payload = Array.isArray(data) ? data : [data];
  return (
    <>
      {payload.map((item, index) => {
        const record = item as { "@type"?: string };
        return (
          <script
            // Static marketing schema; order is stable.
            key={`${record["@type"] ?? "ld"}-${index}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(item).replace(/</g, "\\u003c"),
            }}
          />
        );
      })}
    </>
  );
}
