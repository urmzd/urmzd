// ── How to display ──────────────────────────────────────────────────────────
// Pure SVG rendering. No I/O — every function returns SVG strings.

// ── Constants ───────────────────────────────────────────────────────────────

export const THEME = {
  bg: "#0d1117",
  cardBg: "#161b22",
  border: "#30363d",
  link: "#58a6ff",
  text: "#c9d1d9",
  secondary: "#8b949e",
  muted: "#6e7681",
};

export const FONT =
  "-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif";

export const LAYOUT = {
  width: 808,
  padX: 24,
  padY: 24,
  sectionGap: 30,
  barLabelWidth: 150,
  barHeight: 18,
  barRowHeight: 28,
  barMaxWidth: 500,
};

export const BAR_COLORS = [
  "#58a6ff",
  "#3fb950",
  "#d29922",
  "#f85149",
  "#bc8cff",
  "#39d2c0",
  "#db61a2",
  "#79c0ff",
];

// ── Primitives ──────────────────────────────────────────────────────────────

export const escapeXml = (str) => {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

export const truncate = (str, max) => {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
};

export const wrapText = (text, maxChars) => {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
};

export const renderTextBlock = (lines, x, y, { fontSize = 12, color = THEME.text, lineHeight = 18 } = {}) => {
  let svg = "";
  for (let i = 0; i < lines.length; i++) {
    svg += `\n  <text x="${x}" y="${y + i * lineHeight}" fill="${color}" font-size="${fontSize}" font-family="${FONT}">${escapeXml(lines[i])}</text>`;
  }
  return { svg, height: lines.length * lineHeight };
};

export const renderBulletList = (items, x, y, { fontSize = 12, color = THEME.text, lineHeight = 22 } = {}) => {
  let svg = "";
  for (let i = 0; i < items.length; i++) {
    svg += `\n  <text x="${x}" y="${y + i * lineHeight}" fill="${color}" font-size="${fontSize}" font-family="${FONT}">\u2022  ${escapeXml(items[i])}</text>`;
  }
  return { svg, height: items.length * lineHeight };
};

export const renderDivider = (y) => {
  const { padX } = LAYOUT;
  const svg = `\n  <line x1="${padX}" y1="${y}" x2="${padX + 760}" y2="${y}" stroke="${THEME.border}" stroke-opacity="0.6" stroke-width="1"/>`;
  return { svg, height: 1 };
};

export const renderSubHeader = (text, y) => {
  const { padX } = LAYOUT;
  const svg = `\n  <text x="${padX}" y="${y + 11}" fill="${THEME.secondary}" font-size="11" font-family="${FONT}" letter-spacing="1" font-weight="600">${escapeXml(text.toUpperCase())}</text>`;
  return { svg, height: 14 };
};

// ── Components ──────────────────────────────────────────────────────────────

export const renderBarChart = (items, y, { useItemColors = false } = {}) => {
  if (items.length === 0) return { svg: "", height: 0 };

  const { barLabelWidth, barHeight, barRowHeight, barMaxWidth, padX } = LAYOUT;
  const maxValue = Math.max(...items.map((d) => d.value));

  const bars = items
    .map((item, i) => {
      const ry = y + i * barRowHeight;
      const barWidth = Math.max((item.value / maxValue) * barMaxWidth, 4);
      const color = useItemColors
        ? item.color || BAR_COLORS[i % BAR_COLORS.length]
        : BAR_COLORS[i % BAR_COLORS.length];
      const label = escapeXml(truncate(item.name, 20));
      const valueLabel = item.percent
        ? `${item.percent}%`
        : String(item.value);

      const trendingSvg = item.trending
        ? `\n    <text x="${padX + barLabelWidth + barWidth + 8 + valueLabel.length * 7 + 8}" y="${ry + 14}" fill="#3fb950" font-size="11" font-family="${FONT}">↑ trending</text>`
        : "";

      return `
    <text x="${padX}" y="${ry + 14}" fill="${THEME.secondary}" font-size="12" font-family="${FONT}">${label}</text>
    <rect x="${padX + barLabelWidth}" y="${ry + 2}" width="${barWidth}" height="${barHeight}" rx="3" fill="${color}" opacity="0.85"/>
    <text x="${padX + barLabelWidth + barWidth + 8}" y="${ry + 14}" fill="${THEME.muted}" font-size="11" font-family="${FONT}">${valueLabel}</text>${trendingSvg}`;
    })
    .join("");

  return { svg: bars, height: items.length * barRowHeight };
};

export const renderStatCards = (stats, y) => {
  const { padX } = LAYOUT;
  const cardW = 140;
  const cardH = 72;
  const gap = 15;
  const colors = [BAR_COLORS[0], BAR_COLORS[1], BAR_COLORS[2], BAR_COLORS[4], BAR_COLORS[5]];
  let svg = "";

  for (let i = 0; i < stats.length; i++) {
    const cx = padX + i * (cardW + gap);
    const cy = y;
    const color = colors[i % colors.length];

    svg += `\n  <rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" rx="8" fill="${THEME.cardBg}" stroke="${THEME.border}" stroke-width="1"/>`;
    svg += `\n  <circle cx="${cx + 14}" cy="${cy + 16}" r="4" fill="${color}"/>`;
    svg += `\n  <text x="${cx + 24}" y="${cy + 20}" fill="${THEME.secondary}" font-size="10" font-family="${FONT}" font-weight="600">${escapeXml(stats[i].label)}</text>`;
    svg += `\n  <text x="${cx + cardW / 2}" y="${cy + 52}" fill="${color}" font-size="22" font-family="${FONT}" font-weight="700" text-anchor="middle">${escapeXml(String(stats[i].value))}</text>`;
  }

  return { svg, height: cardH };
};

export const renderPillBadges = (items, y) => {
  const { padX } = LAYOUT;
  const maxWidth = 760;
  const pillH = 28;
  const gapX = 10;
  const gapY = 10;
  let svg = "";
  let cx = padX;
  let cy = y;
  let maxRowY = cy + pillH;

  for (let i = 0; i < items.length; i++) {
    const text = truncate(items[i], 30);
    const pillW = Math.ceil(text.length * 6.5) + 28;
    const color = BAR_COLORS[i % BAR_COLORS.length];

    if (cx + pillW > padX + maxWidth && cx > padX) {
      cx = padX;
      cy += pillH + gapY;
      maxRowY = cy + pillH;
    }

    svg += `\n  <rect x="${cx}" y="${cy}" width="${pillW}" height="${pillH}" rx="14" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-opacity="0.4" stroke-width="1"/>`;
    svg += `\n  <text x="${cx + pillW / 2}" y="${cy + pillH / 2 + 4}" fill="${color}" font-size="11" font-family="${FONT}" font-weight="600" text-anchor="middle">${escapeXml(text)}</text>`;

    cx += pillW + gapX;
  }

  return { svg, height: maxRowY - y };
};

export const renderContributionCards = (highlights, y) => {
  const { padX } = LAYOUT;
  const cardW = 760;
  const cardH = 44;
  const gap = 8;
  let svg = "";

  for (let i = 0; i < highlights.length; i++) {
    const cy = y + i * (cardH + gap);
    const color = BAR_COLORS[i % BAR_COLORS.length];
    const h = highlights[i];

    svg += `\n  <rect x="${padX}" y="${cy}" width="${cardW}" height="${cardH}" rx="6" fill="${THEME.cardBg}" stroke="${THEME.border}" stroke-width="1"/>`;
    svg += `\n  <rect x="${padX}" y="${cy}" width="4" height="${cardH}" rx="2" fill="${color}"/>`;
    svg += `\n  <text x="${padX + 16}" y="${cy + 18}" fill="${THEME.link}" font-size="12" font-family="${FONT}" font-weight="700">${escapeXml(truncate(h.project, 40))}</text>`;
    svg += `\n  <text x="${padX + 16}" y="${cy + 34}" fill="${THEME.secondary}" font-size="11" font-family="${FONT}">${escapeXml(truncate(h.detail, 80))}</text>`;
  }

  return { svg, height: highlights.length * (cardH + gap) - (highlights.length > 0 ? gap : 0) };
};

export const renderSectionHeader = (title, subtitle, y) => {
  let svg = `<text x="${LAYOUT.padX}" y="${y + 16}" fill="${THEME.text}" font-size="13" font-family="${FONT}" letter-spacing="1.5" font-weight="600">${escapeXml(title.toUpperCase())}</text>`;
  let height = 24;
  if (subtitle) {
    svg += `\n  <text x="${LAYOUT.padX}" y="${y + 32}" fill="${THEME.muted}" font-size="11" font-family="${FONT}">${escapeXml(subtitle)}</text>`;
    height = 42;
  }
  return { svg, height };
};

// ── Composers ───────────────────────────────────────────────────────────────

export const renderSection = (title, subtitle, itemsOrRenderBody, options = {}) => {
  const { padY } = LAYOUT;
  let y = padY;
  let svg = "";

  const header = renderSectionHeader(title, subtitle, y);
  svg += header.svg;
  y += header.height;

  if (typeof itemsOrRenderBody === "function") {
    const body = itemsOrRenderBody(y);
    svg += body.svg;
    y += body.height + padY;
  } else {
    const bars = renderBarChart(itemsOrRenderBody, y, options);
    svg += bars.svg;
    y += bars.height + padY;
  }

  return { svg, height: y };
};

export const wrapSectionSvg = (bodySvg, height) => {
  const { width } = LAYOUT;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="12" fill="${THEME.bg}"/>
  ${bodySvg}
</svg>`;
};

export const generateFullSvg = (sections) => {
  const { width, padY, sectionGap } = LAYOUT;
  let y = padY;
  let bodySvg = "";

  for (const section of sections) {
    const header = renderSectionHeader(section.title, section.subtitle, y);
    bodySvg += header.svg;
    y += header.height;

    if (section.renderBody) {
      const body = section.renderBody(y);
      bodySvg += body.svg;
      y += body.height + sectionGap;
    } else {
      const bars = renderBarChart(section.items, y, section.options || {});
      bodySvg += bars.svg;
      y += bars.height + sectionGap;
    }
  }

  const totalHeight = y + padY;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
  <rect width="${width}" height="${totalHeight}" rx="12" fill="${THEME.bg}"/>
  ${bodySvg}
</svg>`;
};
