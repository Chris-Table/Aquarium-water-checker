# Aquarium Water Checker

Upload a photo of your aquarium water test (a test strip or liquid test tubes next to the color chart) and find out whether your freshwater tank needs a water change, and exactly what to do.

## How it works

1. You take or upload a photo in the browser. The page shrinks it and sends it to `/api/analyze`.
2. The Netlify Function in `netlify/functions/analyze.mjs` sends the photo to Claude (`claude-opus-5-5`), which reads the values for ammonia, nitrite, nitrate, pH, KH, GH and chlorine and returns them as JSON.
3. Fixed freshwater rules in `public/assess.js` turn those values into a verdict (looks good, keep an eye on it, change soon, change today) plus step-by-step actions.
4. The values appear in an editable form, so you can fix a misread value, or skip the photo and type your numbers in, then press **Check these values**. That check runs in the browser with the same rules.

### The rules (freshwater)

| Parameter | Fine | Change soon | Change today |
|---|---|---|---|
| Ammonia | 0 ppm | under 0.5 ppm | 0.5 ppm or more |
| Nitrite | 0 ppm | under 0.5 ppm | 0.5 ppm or more |
| Nitrate | 20 ppm or less | 20-40 ppm | over 40 ppm |
| Chlorine | 0 ppm | | any |
| pH | 6.5-8.0 | under 6.0 or over 8.5 | |

pH between 6.0-6.5 or 8.0-8.5, KH under 40 ppm, and very soft or very hard water (GH under 50 or over 300 ppm) are flagged as "keep an eye on it" without calling for a water change.

## Deploy to Netlify

1. In Netlify, choose **Add new project → Import an existing project**, pick GitHub, and select this repository. The build settings come from `netlify.toml`, so leave them as they are.
2. Before (or right after) the first deploy, go to **Project configuration → Environment variables** and add `ANTHROPIC_API_KEY` with your key from <https://platform.claude.com/settings/keys>. Give it the Functions scope.
3. Deploy (or **Deploys → Trigger deploy** if you added the key after the first deploy).

## Run it locally

```sh
npm install
npm install -g netlify-cli
ANTHROPIC_API_KEY=sk-ant-... netlify dev
```

Then open the URL it prints (usually http://localhost:8888).

## Tests

```sh
npm test
```

The tests cover the water-change rules in `public/assess.js` and the request checks in the API.

## Project layout

```
public/                 static site (published as-is)
  index.html, style.css, app.js
  assess.js             water-quality rules, shared with the function
netlify/functions/
  analyze.mjs           POST /api/analyze: photo → Claude → readings + verdict
test/                   rule tests and API request checks
netlify.toml            Netlify build settings and security headers
```

## Security

- `/api/analyze` only accepts same-site JSON POSTs and is rate limited to 5 calls per minute per visitor (Netlify answers 429 above that), so nobody can run up your Claude bill through it. Change `rateLimit` in `netlify/functions/analyze.mjs` to adjust.
- Uploads are checked for size, format and real image bytes before anything is sent to Claude, and each call is capped at 4,000 output tokens.
- `netlify.toml` sets a strict Content Security Policy and the usual security headers on every page.
- The API key lives only in Netlify's environment variables; it is never sent to the browser or committed. Set a monthly spend limit on the key's workspace in the Claude Console as a backstop.
- Dependabot opens a PR when the SDK has an update.

## Notes

- Requests use Claude's server-side fallback (`fallbacks: "default"`), so if the model declines a request it is retried on another model automatically.
- Photos are not stored anywhere; each one is sent to Claude once and discarded.
- Readings from photos depend on lighting and the color chart being in the shot, so always double-check values that look surprising.
