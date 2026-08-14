"use client";

import { useState } from "react";

type SafetyReportItem = {
  id: string;
  reasonCode: string;
  details: string | null;
  status: "open" | "reviewed" | "actioned" | "dismissed";
  moderatorNotes: string | null;
  createdAt: string;
  reporter: { email: string; name: string | null } | null;
  subject: { email: string; name: string | null } | null;
};

export function SafetyReportsManager({
  initialReports,
}: {
  initialReports: SafetyReportItem[];
}) {
  const [reports, setReports] = useState(initialReports);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(
    reportId: string,
    decision: "reviewed" | "actioned" | "dismissed",
    safetyStatus?: "restricted" | "suspended",
  ) {
    setBusyId(reportId);
    setError(null);
    try {
      const response = await fetch("/api/admin/discovery/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportId, decision, safetyStatus }),
      });
      const data = (await response.json()) as {
        error?: string;
        report?: SafetyReportItem;
      };
      if (!response.ok || !data.report) {
        throw new Error(data.error ?? "Review failed");
      }
      setReports((current) =>
        current.map((report) =>
          report.id === reportId
            ? { ...report, status: data.report!.status }
            : report,
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Review failed",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {reports.length ? (
        reports.map((report) => (
          <article key={report.id} className="surface-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">
                  {report.reasonCode.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Subject:{" "}
                  {report.subject?.name || report.subject?.email || "Deleted user"}
                  {" · "}Reporter:{" "}
                  {report.reporter?.name ||
                    report.reporter?.email ||
                    "Deleted user"}
                </p>
              </div>
              <span className="rounded-full border border-line bg-mist px-3 py-1 text-xs font-semibold text-muted">
                {report.status}
              </span>
            </div>
            {report.details ? (
              <p className="mt-4 whitespace-pre-wrap rounded-xl bg-mist p-3 text-sm leading-6 text-muted">
                {report.details}
              </p>
            ) : null}
            <p className="mt-3 text-xs text-muted">
              {new Date(report.createdAt).toLocaleString()}
            </p>
            {report.status === "open" ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => decide(report.id, "reviewed")}
                  className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted"
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() =>
                    decide(report.id, "actioned", "restricted")
                  }
                  className="rounded-lg border border-honey px-3 py-2 text-xs font-semibold text-matcha-deep"
                >
                  Restrict discovery
                </button>
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() =>
                    decide(report.id, "actioned", "suspended")
                  }
                  className="rounded-lg border border-danger/30 px-3 py-2 text-xs font-semibold text-danger"
                >
                  Suspend discovery
                </button>
                <button
                  type="button"
                  disabled={busyId === report.id}
                  onClick={() => decide(report.id, "dismissed")}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-muted"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </article>
        ))
      ) : (
        <p className="surface-card p-5 text-sm text-muted">
          No safety reports.
        </p>
      )}
    </div>
  );
}
