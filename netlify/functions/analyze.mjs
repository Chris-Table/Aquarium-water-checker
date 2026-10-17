// POST /api/analyze
// Body: { "image": "<base64, no data: prefix>", "mediaType": "image/jpeg" }
// Reads the test values from the photo with Claude, then applies the
// freshwater rules in public/assess.js to decide what to do.

import Anthropic from "@anthropic-ai/sdk";
import { assess, PARAMETERS } from "../../public/assess.js";

const MODEL = "claude-opus-5-5";
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
// Base64 inflates by ~4/3; Netlify caps request bodies at 6 MB.
const MAX_BASE64_LENGTH = 5_500_000;

const nullableNumber = { type: ["number", "null"] };

const READINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_water_test", "test_type", "readings", "confidence", "notes"],
  properties: {
    is_water_test: { type: "boolean" },
    test_type: { type: "string", enum: ["test_strip", "liquid_kit", "digital_meter", "other", "unknown"] },
    readings: {
      type: "object",
      additionalProperties: false,
      required: PARAMETERS.map((p) => p.key),
      properties: Object.fromEntries(PARAMETERS.map((p) => [p.key, nullableNumber])),
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    notes: { type: "string" },
  },
};

const SYSTEM_PROMPT = `You read freshwater aquarium water test results from photos.

The photo may show a dip test strip (often held next to the color chart on the bottle), liquid test tubes next to a color card, or a digital meter.

For each parameter, report the value the test shows:
- ammonia, nitrite, nitrate, chlorine, kh, gh: in ppm (mg/L). If the kit reports KH or GH in degrees (dKH/dGH), convert to ppm by multiplying by 17.9.
- ph: the pH value.

How to read the colors:
- Match each pad or tube to the closest color on the reference chart when one is visible. Pick the nearest printed value on the chart; if a color sits clearly between two chart values, you may report a value between them.
- Strip pads are usually in the same order as the rows on the chart. Use the labels on the chart, not assumptions about order, whenever you can read them.
- If there is no chart in the photo, use your knowledge of the common kit's color scale (API, Tetra EasyStrips, JBL, Seachem, AquaChek and similar) and lower your confidence.
- Use null for any parameter the test doesn't measure or that you can't read at all. Never guess a value for a parameter that isn't on the test.

Set is_water_test to false if the photo isn't an aquarium or pool water test at all.
Set confidence to "low" for blurry photos, poor or colored lighting, or no reference chart.
In notes, say in one or two plain sentences what you saw and anything that made reading it hard (for example glare, or pads that look dry or overdeveloped). Do not give water-change advice; that is handled separately.`;

const client = new Anthropic();

function json(status, body) {
  return Response.json(body, { status });
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  if (!process.env.ANTHROPIC_API_KEY) {
    return json(500, { error: "The server is missing its ANTHROPIC_API_KEY setting." });
  }

  let image, mediaType;
  try {
    ({ image, mediaType } = await req.json());
  } catch {
    return json(400, { error: "Send JSON with an image field." });
  }
  if (typeof image !== "string" || image.length === 0) return json(400, { error: "No image was sent." });
  if (!MEDIA_TYPES.has(mediaType)) return json(400, { error: "Use a JPEG, PNG, WebP or GIF image." });
  if (image.length > MAX_BASE64_LENGTH) return json(413, { error: "That image is too large. Try a smaller photo." });

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: READINGS_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: "Read the water test results in this photo." },
          ],
        },
      ],
    });
  } catch (err) {
    console.error("Claude API error", err);
    if (err instanceof Anthropic.RateLimitError) {
      return json(429, { error: "Too many requests right now. Try again in a minute." });
    }
    if (err instanceof Anthropic.BadRequestError) {
      return json(400, { error: "Claude couldn't process that image. Try a different photo." });
    }
    return json(502, { error: "Couldn't reach the image reader. Try again." });
  }

  if (response.stop_reason === "refusal") {
    return json(422, { error: "Claude declined to read this image. Try a different photo." });
  }
  const text = response.content.find((block) => block.type === "text")?.text;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("Unparseable response", response.stop_reason, text);
    return json(502, { error: "Couldn't read the test results. Try again or enter the values by hand." });
  }

  if (!parsed.is_water_test) {
    return json(422, {
      error: "That doesn't look like a water test. Upload a photo of your test strip or test tubes next to the color chart.",
      notes: parsed.notes,
    });
  }

  return json(200, {
    readings: parsed.readings,
    testType: parsed.test_type,
    confidence: parsed.confidence,
    notes: parsed.notes,
    assessment: assess(parsed.readings),
  });
};

export const config = { path: "/api/analyze" };
