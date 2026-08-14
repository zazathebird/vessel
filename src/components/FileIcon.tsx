/**
 * File-type icons for the §10 explorer, drawn rather than shipped — the spec's
 * "no images" rule answered the way the site always answers it. A stroked page
 * outline in `--line`, a type-coloured corner fold, and one small glyph per
 * category. Colour comes from CSS classes (`.v-fileicon-a1` / `-a2`), never a
 * literal, so a folder of mixed content reads as a colour distribution and the
 * whole set recolours with the palette bleed.
 */

type Category =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "pdf"
  | "archive"
  | "code"
  | "data"
  | "sheet"
  | "slides"
  | "font"
  | "binary"
  | "generic";

const EXTENSIONS: Record<string, Category> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image",
  svg: "image", avif: "image", bmp: "image", tif: "image", tiff: "image", heic: "image",
  mp4: "video", mkv: "video", webm: "video", mov: "video", avi: "video", m4v: "video",
  mp3: "audio", flac: "audio", wav: "audio", ogg: "audio", m4a: "audio", aac: "audio",
  txt: "document", md: "document", rtf: "document", doc: "document", docx: "document", odt: "document",
  pdf: "pdf",
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive", gz: "archive", bz2: "archive",
  js: "code", ts: "code", tsx: "code", jsx: "code", py: "code", rs: "code", go: "code",
  c: "code", h: "code", cpp: "code", cs: "code", java: "code", rb: "code", sh: "code",
  ps1: "code", html: "code", css: "code", sql: "code",
  json: "data", xml: "data", yaml: "data", yml: "data", toml: "data", db: "data", sqlite: "data",
  csv: "sheet", xls: "sheet", xlsx: "sheet", ods: "sheet",
  ppt: "slides", pptx: "slides", odp: "slides", key: "slides",
  ttf: "font", otf: "font", woff: "font", woff2: "font",
  exe: "binary", dll: "binary", msi: "binary", bin: "binary", iso: "binary",
  dmg: "binary", app: "binary", deb: "binary", apk: "binary",
};

/** Alternating accent per category so mixed folders read as a distribution. */
const ACCENT: Record<Category, "a1" | "a2"> = {
  folder: "a1",
  image: "a1", video: "a2", audio: "a1",
  document: "a1", pdf: "a2",
  archive: "a1", code: "a2", data: "a1",
  sheet: "a2", slides: "a1", font: "a2",
  binary: "a2", generic: "a1",
};

export function categorise(name: string, kind: "file" | "directory"): Category {
  if (kind === "directory") return "folder";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "generic";
  return EXTENSIONS[name.slice(dot + 1).toLowerCase()] ?? "generic";
}

/** One small stroked glyph per category, drawn inside the page body. */
const GLYPHS: Record<Category, JSX.Element | null> = {
  folder: null,
  image: (
    <>
      <circle cx="9.4" cy="11.6" r="1.5" />
      <path d="M7.4 17.4l3.2-3.4 2.2 2.1 1.8-1.7 2 3" />
    </>
  ),
  video: <path d="M9.6 10.6l5.4 3.2-5.4 3.2z" />,
  audio: <path d="M7.6 14.8l1.6-2 1.6 3 1.6-4.6 1.6 5.4 1.6-3.4 1.2 1.6" />,
  document: <path d="M8 11.4h8M8 14.2h8M8 17h5.4" />,
  pdf: <path d="M8 11.4h8M8 14.2h8M8 17h8" />,
  archive: <path d="M12 8.6v1.6m0 1.2v1.6m0 1.2v1.6m0 1.2v1.6" />,
  code: <path d="M10 11.2l-2.6 2.9 2.6 2.9M14 11.2l2.6 2.9-2.6 2.9" />,
  data: <path d="M9.8 10.8c-1.6 0-1 3.2-2.6 3.2 1.6 0 1 3.2 2.6 3.2M14.2 10.8c1.6 0 1 3.2 2.6 3.2-1.6 0-1 3.2-2.6 3.2" />,
  sheet: <path d="M8 11.6h8v6H8zM8 14.6h8M11.4 11.6v6" />,
  slides: <path d="M8.4 11h7.2v4.6H8.4zM12 15.6v2.2M10.4 17.8h3.2" />,
  font: <path d="M9 17.6l3-7.4 3 7.4M10.2 15h3.6" />,
  binary: <path d="M9.4 11h1.6v3H9.4zM13 14.6a1.5 1.8 0 103 0 1.5 1.8 0 10-3 0M9.4 16.4h1.6" />,
  generic: null,
};

export function FileIcon({ name, kind }: { name: string; kind: "file" | "directory" }) {
  const category = categorise(name, kind);
  const accent = ACCENT[category];

  if (category === "folder") {
    return (
      <svg className={`v-fileicon v-fileicon-${accent}`} viewBox="0 0 24 24" aria-hidden="true">
        <path className="v-fi-line" d="M4.5 7.5a1.5 1.5 0 011.5-1.5h4l2 2.4h6a1.5 1.5 0 011.5 1.5v8.1a1.5 1.5 0 01-1.5 1.5H6a1.5 1.5 0 01-1.5-1.5z" />
        <path className="v-fi-fold" d="M4.5 11h15" />
      </svg>
    );
  }

  return (
    <svg className={`v-fileicon v-fileicon-${accent}`} viewBox="0 0 24 24" aria-hidden="true">
      {/* Page outline with the top-right corner cut for the fold. */}
      <path className="v-fi-line" d="M6.5 4.5h8l3 3v12h-11z" />
      {/* The type-coloured corner fold. */}
      <path className="v-fi-fold" d="M14.5 4.5v3h3" />
      {GLYPHS[category] ? <g className="v-fi-glyph">{GLYPHS[category]}</g> : null}
    </svg>
  );
}
