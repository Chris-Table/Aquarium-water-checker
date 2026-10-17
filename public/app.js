import { assess, PARAMETERS } from "./assess.js";

const MAX_SIDE = 1600; // px; keeps uploads small and is plenty for reading colors

const els = {
  dropzone: document.getElementById("dropzone"),
  photo: document.getElementById("photo"),
  preview: document.getElementById("preview"),
  dropzoneText: document.getElementById("dropzone-text"),
  analyze: document.getElementById("analyze"),
  status: document.getElementById("status"),
  form: document.getElementById("readings"),
  recheck: document.getElementById("recheck"),
  result: document.getElementById("result"),
  verdict: document.getElementById("verdict"),
  actions: document.getElementById("actions"),
  details: document.getElementById("details"),
};

let selectedFile = null;

// Build the editable readings form.
for (const { key, label, unit } of PARAMETERS) {
  const wrapper = document.createElement("label");
  wrapper.textContent = unit ? `${label} (${unit})` : label;
  const input = document.createElement("input");
  input.type = "number";
  input.name = key;
  input.min = "0";
  input.step = "any";
  input.inputMode = "decimal";
  wrapper.append(input);
  els.form.append(wrapper);
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

function chooseFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Please choose an image file.", true);
    return;
  }
  selectedFile = file;
  els.preview.src = URL.createObjectURL(file);
  els.preview.hidden = false;
  els.dropzoneText.textContent = "Tap to choose a different photo";
  els.analyze.disabled = false;
  setStatus("");
}

els.photo.addEventListener("change", () => chooseFile(els.photo.files[0]));
els.dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.dropzone.classList.add("dragging");
});
els.dropzone.addEventListener("dragleave", () => els.dropzone.classList.remove("dragging"));
els.dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  els.dropzone.classList.remove("dragging");
  chooseFile(e.dataTransfer.files[0]);
});

// Shrink the photo and re-encode as JPEG so phone photos fit the upload limit.
async function toBase64Jpeg(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function fillForm(readings) {
  for (const { key } of PARAMETERS) {
    const value = readings[key];
    els.form.elements[key].value = value === null || value === undefined ? "" : value;
  }
}

function readForm() {
  return Object.fromEntries(PARAMETERS.map(({ key }) => [key, els.form.elements[key].value]));
}

function render(assessment, readerNotes) {
  els.verdict.className = `verdict ${assessment.verdict}`;
  els.verdict.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = assessment.title;
  const summary = document.createElement("p");
  summary.textContent = assessment.summary;
  els.verdict.append(title, summary);
  if (readerNotes) {
    const notes = document.createElement("p");
    notes.className = "reader-notes";
    notes.textContent = `From your photo: ${readerNotes}`;
    els.verdict.append(notes);
  }

  els.actions.replaceChildren(
    ...(assessment.actions.length ? assessment.actions : ["Nothing to do right now. Test again next week."]).map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );

  els.details.replaceChildren(
    ...assessment.results.map((r) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = `dot ${r.status}`;
      const body = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = `${r.label}: ${r.value}${r.unit ? ` ${r.unit}` : ""}`;
      body.append(name, r.message);
      li.append(dot, body);
      return li;
    }),
  );

  els.result.hidden = false;
  els.result.scrollIntoView({ behavior: "smooth", block: "start" });
}

els.analyze.addEventListener("click", async () => {
  if (!selectedFile) return;
  els.analyze.disabled = true;
  setStatus("Reading your test. This can take up to half a minute...");
  try {
    const image = await toBase64Jpeg(selectedFile);
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, mediaType: "image/jpeg" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}).`);

    fillForm(data.readings);
    const confidenceNote =
      data.confidence === "low" ? " The photo was hard to read, so please double-check the values below." : "";
    setStatus(`Done.${confidenceNote}`);
    render(data.assessment, data.notes);
  } catch (err) {
    setStatus(err.message || "Something went wrong. Try again.", true);
  } finally {
    els.analyze.disabled = false;
  }
});

els.recheck.addEventListener("click", () => render(assess(readForm())));
