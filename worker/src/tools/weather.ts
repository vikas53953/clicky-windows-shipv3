import type { InternetToolResult, WorkerEnv } from "../types";

export function hasWeatherIntent(text: string): boolean {
  return /\b(weather|temperature|forecast|rain|raining|humidity|wind|climate)\b/i.test(text);
}

export function isSimpleWeatherRequest(text: string): boolean {
  if (!hasWeatherIntent(text)) return false;
  return !/\b(compare|why|explain|history|tomorrow|week|weekly|hourly|next|should I|plan|travel|pack|wear)\b/i.test(text);
}

export async function resolveWeatherTools(transcript: string, env: WorkerEnv): Promise<InternetToolResult[]> {
  const locations = extractWeatherLocations(transcript);
  const resolvedLocations = locations.length ? locations : env.DEFAULT_WEATHER_LOCATION?.trim() ? [env.DEFAULT_WEATHER_LOCATION.trim()] : [];
  if (!resolvedLocations.length) return [{ type: "weather", status: "needs_location" }];

  const results = await Promise.all(resolvedLocations.map((location) => resolveOneWeatherLocation(location)));
  return results.length ? results : [{ type: "weather", status: "needs_location" }];
}

async function resolveOneWeatherLocation(location: string): Promise<InternetToolResult> {
  try {
    const place = await geocodeWeatherLocation(location);
    if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") {
      return { type: "weather", status: "no_answer", label: location, summary: `I could not find current weather for ${location}.` };
    }

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(place.latitude));
    forecastUrl.searchParams.set("longitude", String(place.longitude));
    forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m");
    forecastUrl.searchParams.set("timezone", "auto");

    const forecastResponse = await fetch(forecastUrl.toString(), { headers: { Accept: "application/json" } });
    if (!forecastResponse.ok) return { type: "weather", status: "error", error: `Forecast failed with HTTP ${forecastResponse.status}.` };
    const forecast = (await forecastResponse.json()) as {
      current?: Record<string, number | string>;
      current_units?: Record<string, string>;
    };

    const current = forecast.current || {};
    const units = forecast.current_units || {};
    const placeName = [place.name, place.country].filter(Boolean).join(", ");
    const temperature = formatWeatherValue(current.temperature_2m, units.temperature_2m);
    const feelsLike = formatWeatherValue(current.apparent_temperature, units.apparent_temperature);
    const humidity = formatWeatherValue(current.relative_humidity_2m, units.relative_humidity_2m);
    const wind = formatWeatherValue(current.wind_speed_10m, units.wind_speed_10m);
    const precipitation = formatWeatherValue(current.precipitation, units.precipitation);
    const condition = weatherCodeLabel(Number(current.weather_code));

    return {
      type: "weather",
      status: "ok",
      label: location,
      source: "Open-Meteo",
      summary: `Current weather for ${placeName}: ${condition}, ${temperature}, feels like ${feelsLike}, humidity ${humidity}, wind ${wind}, precipitation ${precipitation}.`
    };
  } catch (error) {
    return {
      type: "weather",
      status: "error",
      label: location,
      error: error instanceof Error ? error.message : "Weather lookup failed."
    };
  }
}

async function geocodeWeatherLocation(location: string): Promise<{ name?: string; country?: string; latitude?: number; longitude?: number; timezone?: string } | null> {
  for (const variant of weatherLocationVariants(location)) {
    const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodeUrl.searchParams.set("name", variant);
    geocodeUrl.searchParams.set("count", "1");
    geocodeUrl.searchParams.set("language", "en");
    geocodeUrl.searchParams.set("format", "json");

    const geocodeResponse = await fetch(geocodeUrl.toString(), { headers: { Accept: "application/json" } });
    if (!geocodeResponse.ok) throw new Error(`Geocoding failed with HTTP ${geocodeResponse.status}.`);
    const geocode = (await geocodeResponse.json()) as {
      results?: Array<{ name?: string; country?: string; latitude?: number; longitude?: number; timezone?: string }>;
    };
    const place = geocode.results?.[0];
    if (place && typeof place.latitude === "number" && typeof place.longitude === "number" && placeMatchesLocationHint(location, place)) return place;
  }

  return null;
}

function placeMatchesLocationHint(
  requestedLocation: string,
  place: { name?: string; country?: string; latitude?: number; longitude?: number; timezone?: string }
): boolean {
  const requested = requestedLocation.toLowerCase();
  const country = (place.country || "").toLowerCase();
  if (/\b(india|punjab|delhi)\b/i.test(requested)) return country === "india";
  return true;
}

function weatherLocationVariants(location: string): string[] {
  const clean = location.replace(/\s+/g, " ").trim();
  const variants = [clean];
  const words = clean.split(" ").filter(Boolean);
  if (words.length > 1) {
    variants.push(words.slice(0, -1).join(" "));
  }
  return Array.from(new Set(variants.filter(Boolean)));
}

function extractWeatherLocations(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const afterWeather = normalized.match(/\b(?:weather|temperature|forecast|rain|raining|humidity|wind)\b(?:\s+(?:today|now|outside|currently))*\s+(?:in|at|for|near|of|around)\s+([^?.,!]+)/i);
  if (afterWeather?.[1]) return splitWeatherLocations(afterWeather[1]);

  const beforeWeather = normalized.match(/\b(?:for|in|at|near|around|of|check|tell me|show me|what is|what's|how is|hows|how's)?\s*([a-z][a-z\s-]{1,60}?)\s+(?:weather|temperature|forecast)\b/i);
  if (beforeWeather?.[1]) {
    const location = cleanLocationQuery(beforeWeather[1]);
    if (location && !isWeatherQuestionFiller(location)) return [location];
  }

  return [];
}

function splitWeatherLocations(value: string): string[] {
  return value
    .split(/\s+(?:and|or)\s+|,/i)
    .map(cleanLocationQuery)
    .filter((location) => location && !isWeatherQuestionFiller(location))
    .slice(0, 4);
}

function cleanLocationQuery(value: string): string {
  return value
    .replace(/\b(today|tomorrow|now|currently|please|right now|this morning|this evening|around me|near me|outside)\b/gi, " ")
    .replace(/\b(weather|temperature|forecast|rain|raining|humidity|wind)\b/gi, " ")
    .replace(/\b(can you|could you|would you|you have to|please|check|tell me|show me|what is|what's|how is|how's|hows|the|of|in|at|near|around|for)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isWeatherQuestionFiller(value: string): boolean {
  return /^(can you|could you|would you|you have to|please|check|tell me|show me|what is|what's|how is|how's|hows|the|my|current)$/i.test(value.trim());
}

function formatWeatherValue(value: unknown, unit: string | undefined): string {
  if (typeof value === "number") return `${value}${unit || ""}`;
  if (typeof value === "string" && value.trim()) return `${value}${unit || ""}`;
  return "unknown";
}

function weatherCodeLabel(code: number): string {
  if (code === 0) return "clear sky";
  if ([1, 2, 3].includes(code)) return "partly cloudy";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "thunderstorm";
  return "conditions available";
}
