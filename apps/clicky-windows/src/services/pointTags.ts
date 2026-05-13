export interface PointTarget {
  x: number;
  y: number;
  label: string;
  screen: number;
}

export interface ParsedPointTags {
  cleanText: string;
  points: PointTarget[];
}

const pointTagPattern = /\[POINT:([^,\]]+),([^:\]]+):([^:\]]+):screen([^\]]+)\]/g;

export function parsePointTags(text: string): ParsedPointTags {
  const points: PointTarget[] = [];

  const withoutTags = text.replace(pointTagPattern, (_match, rawX, rawY, rawLabel, rawScreen) => {
    const x = Number.parseInt(String(rawX).trim(), 10);
    const y = Number.parseInt(String(rawY).trim(), 10);
    const screen = Number.parseInt(String(rawScreen).trim(), 10);

    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(screen)) {
      points.push({
        x,
        y,
        label: String(rawLabel).trim(),
        screen
      });
    }

    return "";
  });

  return {
    cleanText: normalizeWhitespace(withoutTags),
    points
  };
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
