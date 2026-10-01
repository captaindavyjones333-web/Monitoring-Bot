function getHeadingText(line) {
  const match = line.trim().match(/^(?:\d+\.\s*)?(\*\*.*\*\*|\*[^*]+\*|_[^_]+_)$/);
  if (!match) return null;
  return match[1].replace(/^\*\*|\*\*$|^\*|\*$|^_|_$/g, "").trim();
}

function isStorageHeading(line) {
  const text = getHeadingText(line);
  return Boolean(text && /\b\d+(?:[.,]\d+)?\s*(?:GB|TB|ԳԲ|ՏԲ)\b/i.test(text));
}

function isNumberedProductHeading(line) {
  return /^\s*\d+\.\s/.test(line) && getHeadingText(line) && !isStorageHeading(line);
}

function splitProductBlocks(lines) {
  const starts = [];
  lines.forEach((line, index) => {
    if (isNumberedProductHeading(line)) starts.push(index);
  });

  if (starts.length <= 1) return [lines];

  return starts.map((start, index) =>
    lines.slice(start, starts[index + 1] ?? lines.length),
  );
}

function isPriceRow(line) {
  return /^\s*[^\s].*\s+-\s+/.test(line);
}

function isRsRow(line) {
  return /^\s*RS\s+-\s+/.test(line);
}

function filterVariant(lines) {
  const hasMarkedCompetitor = lines.some(
    (line) => isPriceRow(line) && !isRsRow(line) && line.includes("‼️"),
  );
  if (!hasMarkedCompetitor) return null;

  const keptLines = lines.filter((line) => {
    if (!isPriceRow(line)) return true;
    return isRsRow(line) || line.includes("‼️");
  });
  return keptLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function filterProduct(lines) {
  const variantStarts = [];
  lines.forEach((line, index) => {
    if (isStorageHeading(line)) variantStarts.push(index);
  });

  if (variantStarts.length === 0) return filterVariant(lines);

  const keptProductLines = lines.slice(0, variantStarts[0]);
  const keptVariants = variantStarts.flatMap((start, index) => {
    const end = variantStarts[index + 1] ?? lines.length;
    const filtered = filterVariant(lines.slice(start, end));
    return filtered ? [filtered] : [];
  });

  if (keptVariants.length === 0) return null;
  return [...keptProductLines, ...keptVariants].join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function filterCheaperComparisonMessages(messages) {
  return messages.flatMap((message) => {
    const lines = String(message).split("\n");
    return splitProductBlocks(lines)
      .map(filterProduct)
      .filter(Boolean);
  });
}