"use client";

import { useState, useRef } from "react";
import { Upload, Download, AlertCircle, CheckCircle } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const KNOWN_FIELDS = [
  "brand", "product_category", "niche", "platform", "country", "ad_status",
  "url_type", "ad_url", "ad_library_url", "ad_snapshot_url", "advertiser_page_url",
  "destination_url", "creative_video_url", "creative_image_url", "organic_or_paid",
  "ad_copy", "headline", "description", "cta", "offer", "hook", "hook_type", "angle",
  "pain_point", "persona", "creative_format", "visual_style", "script_structure",
  "first_seen", "last_seen", "views", "likes", "comments", "shares", "impressions",
  "spend", "currency", "engagement_proxy", "performance_score", "why_it_works",
  "how_to_replicate", "ai_avatar_adaptation", "value_for_our_business", "notes",
  "source_actor", "source_platform", "scraped_at", "review_status",
];

type Row = Record<string, string>;

export default function ImportExportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [exporting, setExporting] = useState(false);

  const parseFile = (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      Papa.parse<Row>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          setRows(res.data);
          const hdrs = res.meta.fields || [];
          setHeaders(hdrs);
          const autoMap: Record<string, string> = {};
          hdrs.forEach((h) => {
            const lower = h.toLowerCase().replace(/\s+/g, "_");
            if (KNOWN_FIELDS.includes(lower)) autoMap[h] = lower;
            else if (KNOWN_FIELDS.includes(h)) autoMap[h] = h;
            else autoMap[h] = h;
          });
          setMapping(autoMap);
          setResult(null);
        },
      });
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });
        setRows(data as Row[]);
        const hdrs = data.length > 0 ? Object.keys(data[0]) : [];
        setHeaders(hdrs);
        const autoMap: Record<string, string> = {};
        hdrs.forEach((h) => {
          const lower = h.toLowerCase().replace(/\s+/g, "_");
          if (KNOWN_FIELDS.includes(lower)) autoMap[h] = lower;
          else if (KNOWN_FIELDS.includes(h)) autoMap[h] = h;
          else autoMap[h] = h;
        });
        setMapping(autoMap);
        setResult(null);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const handleImport = async () => {
    setImporting(true);
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, mapping }),
    });
    const data = await res.json();
    setResult(data);
    setImporting(false);
  };

  const handleExport = async () => {
    setExporting(true);
    const res = await fetch("/api/export");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ads-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Import / Export</h1>
        <p className="text-sm text-gray-500 mt-1">Upload a CSV or Excel file to import ads. Export the full database to CSV.</p>
      </div>

      {/* Export section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-medium text-gray-800 mb-1">Export Database</h2>
        <p className="text-sm text-gray-500 mb-4">Download the full ads database as a CSV file.</p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          <Download size={14} />
          {exporting ? "Exporting…" : "Export all ads to CSV"}
        </button>
      </div>

      {/* Import section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-medium text-gray-800 mb-1">Import CSV or Excel</h2>
        <p className="text-sm text-gray-500 mb-4">Supports .csv, .xlsx, .xls. Column names are auto-matched where possible.</p>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors mb-4"
        >
          <Upload size={24} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">Drag & drop a file here, or <span className="text-blue-500">click to browse</span></p>
          <p className="text-xs text-gray-400 mt-1">.csv · .xlsx · .xls</p>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { if (e.target.files?.[0]) parseFile(e.target.files[0]); }} />
        </div>

        {/* Preview + mapping */}
        {rows.length > 0 && (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              <strong>{rows.length}</strong> rows detected. Map your columns to database fields below. Unrecognised columns will be stored as extra data.
            </p>

            <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-1/2">Your column</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 w-1/2">Maps to field</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {headers.map((h) => (
                    <tr key={h}>
                      <td className="px-4 py-2 text-gray-700 font-mono text-xs">{h}</td>
                      <td className="px-4 py-2">
                        <select
                          value={mapping[h] || ""}
                          onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
                        >
                          <option value={h}>{h} (keep as-is)</option>
                          {KNOWN_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                          <option value="__skip__">— Skip this column —</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Preview table */}
            <div className="mb-4">
              <p className="text-xs text-gray-400 mb-2">Preview (first 3 rows):</p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="text-xs">
                  <thead className="bg-gray-50">
                    <tr>{headers.map((h) => <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.slice(0, 3).map((row, i) => (
                      <tr key={i}>{headers.map((h) => <td key={h} className="px-3 py-2 text-gray-700 max-w-[200px] truncate">{row[h]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              <Upload size={14} />
              {importing ? `Importing ${rows.length} rows…` : `Import ${rows.length} rows`}
            </button>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className={`mt-4 p-4 rounded-lg flex items-start gap-3 ${result.errors.length === 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
            {result.errors.length === 0 ? <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" /> : <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />}
            <div>
              <p className="text-sm font-medium text-gray-800">{result.imported} ads imported successfully.</p>
              {result.errors.length > 0 && (
                <div className="mt-1 space-y-1">
                  {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
