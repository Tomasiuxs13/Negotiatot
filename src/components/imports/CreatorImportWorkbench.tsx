"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  candidateFromRow,
  detectImportSource,
  IMPORT_FIELD_LABELS,
  IMPORT_SOURCES,
  suggestHeaderMapping,
  type CreatorImportPreviewRow,
  type HeaderMapping,
  type ImportField,
  type ImportSource,
} from "@/lib/creator-import";
import { STAGE_LABELS } from "@/lib/types";
import { commitCreatorImportAction, previewCreatorImportAction } from "@/app/imports/actions";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40";

const MAX_ROWS = 500;
const FIELDS: ImportField[] = [
  "name",
  "profileUrl",
  "platform",
  "handle",
  "email",
  "followers",
  "avgViews",
  "engagementRate",
  "externalId",
  "sourceStatus",
];

interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
  truncated: boolean;
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function tableFromRows(grid: string[][]): ParsedTable {
  const headerRow = grid.find((row) => row.some((cell) => cell.trim())) ?? [];
  const headerIndex = grid.indexOf(headerRow);
  const used = new Map<string, number>();
  const headers = headerRow.map((cell, index) => {
    const base = cell.trim() || `Column ${index + 1}`;
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base} (${seen + 1})`;
  });
  const data = grid.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim()));
  return {
    headers,
    rows: data.slice(0, MAX_ROWS).map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ""]))
    ),
    truncated: data.length > MAX_ROWS,
  };
}

function columnNumber(reference: string): number {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

/**
 * XLSX is a ZIP of XML files. This intentionally extracts only displayed cell values from
 * the first worksheet — imports do not execute formulas, macros, external links or code.
 */
async function parseXlsx(file: File): Promise<ParsedTable> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer(), { createFolders: false });
  const sheetName = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()[0];
  if (!sheetName) throw new Error("No worksheet was found in this XLSX file.");
  const sheetXml = await zip.file(sheetName)?.async("text");
  if (!sheetXml) throw new Error("The first worksheet could not be read.");
  const parser = new DOMParser();
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("text");
  const shared = sharedXml
    ? Array.from(parser.parseFromString(sharedXml, "application/xml").getElementsByTagName("si")).map(
        (node) => node.textContent ?? ""
      )
    : [];
  const document = parser.parseFromString(sheetXml, "application/xml");
  const rows = Array.from(document.getElementsByTagName("row")).map((row) => {
    const values: string[] = [];
    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const index = columnNumber(cell.getAttribute("r") ?? "A1");
      const type = cell.getAttribute("t");
      const raw = cell.getElementsByTagName("v")[0]?.textContent ?? "";
      values[index] =
        type === "s"
          ? shared[Number(raw)] ?? ""
          : type === "inlineStr"
            ? cell.getElementsByTagName("t")[0]?.textContent ?? ""
            : raw;
    }
    return values;
  });
  return tableFromRows(rows);
}

async function parseFile(file: File): Promise<ParsedTable> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file smaller than 5 MB.");
  if (/\.xlsx$/i.test(file.name)) return parseXlsx(file);
  const text = await file.text();
  const delimiter = /\.tsv$/i.test(file.name) ? "\t" : text.split("\n", 1)[0]?.includes("\t") ? "\t" : ",";
  return tableFromRows(parseDelimited(text.replace(/^\uFEFF/, ""), delimiter));
}

function metric(value: number | null, suffix = ""): string {
  return value == null ? "—" : `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}${suffix}`;
}

export default function CreatorImportWorkbench() {
  const [mode, setMode] = useState<"file" | "manual">("file");
  const [source, setSource] = useState<ImportSource>("spreadsheet");
  const [sourceWasChosen, setSourceWasChosen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<HeaderMapping>({});
  const [preview, setPreview] = useState<CreatorImportPreviewRow[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [newRecordStage, setNewRecordStage] = useState<"partner" | "lead" | "contacted">("lead");
  const [manual, setManual] = useState({ name: "", email: "", profileUrl: "", platform: "", handle: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const candidates = useMemo(
    () =>
      table
        ? table.rows.map((row, index) => candidateFromRow(index + 2, row, mapping, source))
        : [],
    [table, mapping, source]
  );

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setPreview(null);
    try {
      const parsed = await parseFile(file);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("That file has no header row and creator rows to import.");
        return;
      }
      setTable(parsed);
      setFileName(file.name);
      // A manager's explicit provider choice is stronger than a heuristic over a vendor's
      // ever-changing export headers. Otherwise make the first import pleasantly automatic.
      if (!sourceWasChosen) setSource(detectImportSource(parsed.headers, file.name));
      setMapping(suggestHeaderMapping(parsed.headers));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This file could not be read.");
    }
  };

  const review = (rows = candidates) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await previewCreatorImportAction(rows);
      if (result.error || !result.rows) {
        setError(result.error ?? "Could not match these creators.");
        return;
      }
      setPreview(result.rows);
      setSelected(
        new Set(
          result.rows.filter((row) => row.kind === "new" || row.kind === "exact").map((row) => row.candidate.rowNumber)
        )
      );
    });
  };

  const reviewManual = () => {
    const row = {
      Name: manual.name,
      Email: manual.email,
      "Profile URL": manual.profileUrl,
      Platform: manual.platform,
      Handle: manual.handle,
    };
    review([
      candidateFromRow(1, row, {
        name: "Name",
        email: "Email",
        profileUrl: "Profile URL",
        platform: "Platform",
        handle: "Handle",
      }, "manual"),
    ]);
  };

  const commit = () => {
    if (!preview) return;
    const rows = preview.filter((row) => selected.has(row.candidate.rowNumber)).map((row) => row.candidate);
    if (rows.length === 0) {
      setError("Select at least one safe match or new creator to import.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await commitCreatorImportAction({
        rows,
        source: mode === "manual" ? "manual" : source,
        filename: mode === "manual" ? "Manual entry" : fileName,
        newRecordStage,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(
        `${result.createdPartners ?? 0} new partner${result.createdPartners === 1 ? "" : "s"}, ${result.createdDeals ?? 0} new pipeline deal${result.createdDeals === 1 ? "" : "s"}, and ${result.enriched ?? 0} matched record${result.enriched === 1 ? "" : "s"} updated. ${result.skipped ? `${result.skipped} unsafe row${result.skipped === 1 ? " was" : "s were"} skipped.` : ""}`
      );
      setSelected(new Set());
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-headline text-base font-semibold text-slate-900">Bring creators into Counterpart</h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Compare a provider export with the live pipeline before creating anything. Existing manager-entered values are only filled when blank.
            </p>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-semibold">
            {[
              ["file", "Import file"],
              ["manual", "Manual entry"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setMode(key as "file" | "manual");
                  setPreview(null);
                  setError(null);
                  setSuccess(null);
                }}
                className={`rounded-md px-3 py-1.5 transition-colors ${mode === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "file" ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {IMPORT_SOURCES.filter((item) => item.key !== "manual").map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setSource(item.key);
                    setSourceWasChosen(true);
                    setPreview(null);
                  }}
                  className={`rounded-lg border p-3 text-left transition-colors ${source === item.key ? "border-brand bg-brand/5" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">{item.description}</span>
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-[1.5px] border-dashed border-slate-300 bg-slate-50 px-6 py-7 text-center transition-colors hover:border-brand/60">
              <span className="material-symbols-outlined text-slate-400">upload_file</span>
              <span className="mt-1 text-sm font-medium text-slate-700">
                {fileName ?? "Drop a CSV, TSV or XLSX export here, or click to choose it"}
              </span>
              <span className="mt-1 text-xs text-slate-500">First worksheet · first {MAX_ROWS} creator rows · no macros or formulas run</span>
              <input
                type="file"
                accept=".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(event) => void readFile(event.target.files?.[0])}
              />
            </label>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input className={inputClass} placeholder="Creator name or channel name" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
            <input className={inputClass} type="email" placeholder="Email (optional)" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })} />
            <select className={inputClass} value={manual.platform} onChange={(e) => setManual({ ...manual, platform: e.target.value })}>
              <option value="">Platform unknown</option>
              <option value="youtube">YouTube</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="facebook">Facebook</option>
            </select>
            <input className={inputClass + " sm:col-span-2"} placeholder="Profile URL (strongest match key, optional)" value={manual.profileUrl} onChange={(e) => setManual({ ...manual, profileUrl: e.target.value })} />
            <input className={inputClass} placeholder="Handle (optional)" value={manual.handle} onChange={(e) => setManual({ ...manual, handle: e.target.value })} />
          </div>
        )}
      </section>

      {mode === "file" && table && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="font-headline text-sm font-semibold text-slate-900">Confirm column mapping</h3>
              <p className="mt-1 text-xs text-slate-500">
                Counterpart guessed these from {table.headers.length} columns. Correct anything ambiguous before matching.
              </p>
            </div>
            <span className="font-data text-xs text-slate-500">{table.rows.length} rows{table.truncated ? ` · first ${MAX_ROWS} shown` : ""}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((field) => (
              <label key={field} className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-700">
                  {IMPORT_FIELD_LABELS[field]} {field === "name" && <span className="text-brand-dark">recommended</span>}
                </span>
                <select
                  className={inputClass}
                  value={mapping[field] ?? ""}
                  onChange={(event) => {
                    setMapping({ ...mapping, [field]: event.target.value || null });
                    setPreview(null);
                  }}
                >
                  <option value="">Not in this file</option>
                  {table.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={() => review()} disabled={isPending} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-60">
              {isPending ? "Matching…" : `Match ${candidates.length} creator${candidates.length === 1 ? "" : "s"} to pipeline`}
            </button>
          </div>
        </section>
      )}

      {mode === "manual" && !preview && (
        <div className="flex justify-end">
          <button onClick={reviewManual} disabled={isPending} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-60">
            {isPending ? "Checking…" : "Check for an existing creator"}
          </button>
        </div>
      )}

      {preview && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h3 className="font-headline text-sm font-semibold text-slate-900">Review matches before import</h3>
            <p className="mt-1 text-xs text-slate-500">
              Exact identity matches can safely enrich blank fields. Name-only matches are intentionally held back.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ["exact", "Exact match", "bg-emerald-50 text-emerald-700"],
                ["new", "New", "bg-sky-50 text-sky-700"],
                ["name_match", "Needs confirmation", "bg-amber-50 text-amber-700"],
                ["invalid", "Missing identity", "bg-slate-100 text-slate-500"],
              ].map(([key, label, tone]) => {
                const count = preview.filter((row) => row.kind === key).length;
                return count > 0 ? <span key={key} className={`rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{count} {label}</span> : null;
              })}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Import</th>
                  <th className="px-4 py-3">Creator from file</th>
                  <th className="px-4 py-3">Provider evidence</th>
                  <th className="px-4 py-3">Counterpart record</th>
                  <th className="px-4 py-3">Current deal status</th>
                  <th className="px-4 py-3">Decision</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => {
                  const selectable = row.kind === "exact" || row.kind === "new";
                  const isSelected = selected.has(row.candidate.rowNumber);
                  return (
                    <tr key={row.candidate.rowNumber} className="border-b border-slate-100 last:border-0 align-top">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!selectable}
                          aria-label={`Import row ${row.candidate.rowNumber}`}
                          onChange={(event) => {
                            const next = new Set(selected);
                            if (event.target.checked) next.add(row.candidate.rowNumber);
                            else next.delete(row.candidate.rowNumber);
                            setSelected(next);
                          }}
                          className="h-4 w-4 accent-[var(--brand,#0d7a5f)] disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{row.candidate.name ?? row.candidate.handle ?? "Unnamed creator"}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{row.candidate.email ?? row.candidate.profileUrl ?? row.candidate.handle ?? "No direct identifier"}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p>{row.candidate.platform ? row.candidate.platform[0].toUpperCase() + row.candidate.platform.slice(1) : row.candidate.platformLabel ?? "Platform unknown"}</p>
                        <p className="mt-0.5 text-slate-500">{metric(row.candidate.followers)} followers · {metric(row.candidate.avgViews)} avg views · {metric(row.candidate.engagementRate, "%")}</p>
                        {row.candidate.sourceStatus && <p className="mt-1 text-slate-400">Source status: {row.candidate.sourceStatus}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.partner ? <Link href={`/partners/${row.partner.id}`} className="font-semibold text-brand-dark hover:underline">{row.partner.name}</Link> : <span className="font-semibold text-sky-700">New partner</span>}
                        {row.partner?.email && <p className="mt-0.5 text-slate-500">{row.partner.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {row.liveDeal ? <Link href={`/deals/${row.liveDeal.id}`} className="font-semibold text-brand-dark hover:underline">{STAGE_LABELS[row.liveDeal.stage]}{row.liveDeal.statusLabel ? ` · ${row.liveDeal.statusLabel}` : ""}</Link> : "No active deal"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{row.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              New imported creators become
              <select value={newRecordStage} onChange={(event) => setNewRecordStage(event.target.value as typeof newRecordStage)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700">
                <option value="partner">Partners only — no deal yet</option>
                <option value="lead">Pipeline prospects</option>
                <option value="contacted">Contacted deals</option>
              </select>
            </label>
            <button onClick={commit} disabled={isPending || selected.size === 0} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:opacity-60">
              {isPending ? "Importing…" : `Import ${selected.size} selected row${selected.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </section>
      )}

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {success && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}
    </div>
  );
}
