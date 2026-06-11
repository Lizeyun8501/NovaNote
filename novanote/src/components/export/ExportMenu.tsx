import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

interface ExportMenuProps {
  currentNotePath: string | null;
}

export default function ExportMenu({ currentNotePath }: ExportMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleExportMarkdown = async () => {
    if (!currentNotePath) return;
    setOpen(false);

    const defaultName = currentNotePath.replace(/\.md$/i, "") + ".md";
    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!filePath) return;

    try {
      await invoke("export_note_md", {
        relativePath: currentNotePath,
        outputPath: filePath,
      });
    } catch (err) {
      console.error("Failed to export markdown:", err);
    }
  };

  const handleExportHtml = async () => {
    if (!currentNotePath) return;
    setOpen(false);

    const defaultName = currentNotePath.replace(/\.md$/i, "") + ".html";
    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (!filePath) return;

    try {
      await invoke("export_note_html", {
        relativePath: currentNotePath,
        outputPath: filePath,
      });
    } catch (err) {
      console.error("Failed to export HTML:", err);
    }
  };

  const handleExportPdf = async () => {
    if (!currentNotePath) return;
    setOpen(false);

    const defaultName = currentNotePath.replace(/\.md$/i, "") + ".pdf";
    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!filePath) return;

    try {
      await invoke("export_note_pdf", {
        relativePath: currentNotePath,
        outputPath: filePath,
      });
    } catch (err) {
      console.error("Failed to export PDF:", err);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={!currentNotePath}
        className="px-2 py-1 rounded text-sm hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        style={{
          backgroundColor: "transparent",
          border: "none",
          color: "var(--text-secondary)",
          boxShadow: "none",
        }}
        title={t("export.title")}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3" />
          <path d="M8 2v8" />
          <path d="M5 7l3 3 3-3" />
        </svg>
        {t("export.title")}
      </button>

      {open && currentNotePath && (
        <div
          className="absolute right-0 top-full mt-1 rounded-md shadow-lg z-50 py-1 min-w-[160px]"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
          }}
        >
          <button
            onClick={handleExportMarkdown}
            className="w-full text-left px-3 py-2 text-sm hover:bg-hover"
            style={{
              backgroundColor: "transparent",
              border: "none",
              color: "var(--text-primary)",
              boxShadow: "none",
            }}
          >
            {t("export.exportAsMarkdown")}
          </button>
          <button
            onClick={handleExportHtml}
            className="w-full text-left px-3 py-2 text-sm hover:bg-hover"
            style={{
              backgroundColor: "transparent",
              border: "none",
              color: "var(--text-primary)",
              boxShadow: "none",
            }}
          >
            {t("export.exportAsHtml")}
          </button>
          <button
            onClick={handleExportPdf}
            className="w-full text-left px-3 py-2 text-sm hover:bg-hover"
            style={{
              backgroundColor: "transparent",
              border: "none",
              color: "var(--text-primary)",
              boxShadow: "none",
            }}
          >
            {t("export.exportAsPdf")}
          </button>
        </div>
      )}
    </div>
  );
}
