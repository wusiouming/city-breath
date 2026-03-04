import * as Tone from "tone";

const slider = document.getElementById("green-slider");
const photoInput = document.getElementById("photo-input");
const greenLabel = document.getElementById("green-value");
const breathLabel = document.getElementById("breath-value");
const calmLabel = document.getElementById("calm-value");
const lung = document.querySelector(".lung");
const lungCore = document.querySelector(".lung-core");
const photoPreviewImg = document.getElementById("photo-preview-img");

let started = false;
let playing = false;

// Preload overlay interactions: dismiss overlay and start audio when user clicks the CTA.
// Keep a reference so we can remove it after first interaction.
const preloadOverlay = document.getElementById("preload-overlay");
const startBreatheBtn = document.getElementById("start-breathe");

if (startBreatheBtn && preloadOverlay) {
  startBreatheBtn.addEventListener("click", async () => {
    // visually hide overlay immediately
    preloadOverlay.style.transition = "opacity 260ms ease, transform 260ms ease";
    preloadOverlay.style.opacity = "0";
    preloadOverlay.style.transform = "scale(0.995)";
    setTimeout(() => {
      preloadOverlay.remove();
    }, 300);

    // ensure audio is initialised
    //await initAudioIfNeeded();
    await Tone.start();
  }, { once: true });
}

 // ---- Audio graph ----

const masterVol = new Tone.Volume(-10).toDestination();
const reverb = new Tone.Reverb({
  decay: 18,
  wet: 0.45
}).connect(masterVol);

const lowpass = new Tone.Filter({
  type: "lowpass",
  frequency: 3500,
  Q: 0.7
}).connect(reverb);

 // add gentle stereo motion after the filter
const stereo = new Tone.StereoWidener(0.4).connect(reverb);

// gentle chorus that can open up with more greenery
const chorus = new Tone.Chorus({
  frequency: 0.5,
  delayTime: 4,
  depth: 0.2,
  spread: 120,
  wet: 0.15
}).connect(reverb).start();

// send filter into both stereo widener and chorus
lowpass.connect(stereo);
lowpass.connect(chorus);

const noise = new Tone.Noise("pink");
const noiseFilter = new Tone.Filter({
  type: "bandpass",
  frequency: 400,
  Q: 0.9
}).connect(lowpass);

const noiseGain = new Tone.Gain(0.6).connect(noiseFilter);
noise.connect(noiseGain);

// softer pad with more harmonics
const padSynth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: "sine2" },
  envelope: {
    attack: 2.5,
    decay: 5,
    sustain: 0.8,
    release: 10
  }
}).connect(lowpass);

// bright melodic layer
const sparkSynth = new Tone.Synth({
  oscillator: { type: "triangle" },
  envelope: {
    attack: 0.06,
    decay: 0.4,
    sustain: 0.15,
    release: 0.9
  }
}).connect(lowpass);

const rootNotes = ["A3", "C4", "E4", "G4", "B3", "D4"];
const airyNotes = ["A4", "C5", "E5", "G5"];
const motionNotes = ["A4", "B4", "C5", "E5", "G5"];

let pattern;
let breathLfo;
let harmonyToggle = false; // flips each loop to alternate harmonic layers

// macro-intensity state
let macroCycle = 0;
let baseReverbWet = 0.4;
let basePadVolume = -10;   // dB
let baseSparkVolume = -14; // dB

function setupMusic() {
  // breathing LFO controls noise and subtle filter motion
  breathLfo = new Tone.LFO({
    frequency: 0.1,
    min: 0.04,
    max: 0.22,
    phase: 90
  }).start();
  breathLfo.connect(noiseGain.gain);

  const filterLfo = new Tone.LFO({
    frequency: 0.03,
    min: 1800,
    max: 4500
  }).start();
  filterLfo.connect(lowpass.frequency);

  pattern = new Tone.Loop(time => {
    const green = getGreen();

    // derive current breath & calm so macro intensity follows parameters
    const breathsPerMin = map(green, 5, 90, 12, 5.5);
    const calm = map(green, 5, 90, 0.18, 0.9);

    // advance a slow macro cycle: calmer scenes breathe more slowly
    macroCycle += map(calm, 0.18, 0.9, 0.55, 0.25);
    const macroPhase = (Math.sin(macroCycle) + 1) / 2; // 0–1

    // use macro phase to periodically vary intensity (reverb + instrument loudness)
    const reverbBoost = 0.7 + 0.6 * macroPhase; // 0.7–1.3
    reverb.wet.value = Math.min(1, baseReverbWet * reverbBoost);

    const padGain = 0.8 + 0.4 * macroPhase; // 0.8–1.2
    padSynth.volume.value = basePadVolume + Tone.gainToDb(padGain);

    const sparkGain = 0.75 + 0.5 * macroPhase; // 0.75–1.25
    sparkSynth.volume.value = baseSparkVolume + Tone.gainToDb(sparkGain);

    // alternate which harmonic layer takes the lead each loop to avoid simultaneous thickness
    harmonyToggle = !harmonyToggle;

    // pad harmony size increases with greenery
    const chordSize = map(green, 5, 90, 1, 3);
    const sustainedNotes = pick(rootNotes, Math.round(chordSize));

    // melodic density and steps
    const melodicDensity = map(green, 5, 90, 0.25, 0.8);
    const maxSteps = Math.round(map(green, 5, 90, 1, 4));

    if (harmonyToggle) {
      // This iteration: pad-led — full sustained chord, light melodic ornament
      padSynth.triggerAttackRelease(sustainedNotes, "1n", time);

      // light, sparse melodic decorations
      for (let i = 0; i < maxSteps; i++) {
        if (Math.random() < melodicDensity * 0.35) {
          const notePool = green > 55 ? motionNotes : airyNotes.slice(0, 3);
          const note = notePool[Math.floor(Math.random() * notePool.length)];
          const offsetBeat = (i / maxSteps) * 0.5;
          const dur = green > 55 ? "8n" : "4n";
          sparkSynth.triggerAttackRelease(note, dur, time + Tone.Time(offsetBeat).toSeconds());
        }
      }
    } else {
      // This iteration: spark-led — active melodic pattern, light pad wash
      for (let i = 0; i < maxSteps; i++) {
        if (Math.random() < melodicDensity) {
          const notePool = green > 55 ? motionNotes : airyNotes.slice(0, 3);
          const note = notePool[Math.floor(Math.random() * notePool.length)];
          const offsetBeat = (i / maxSteps) * 0.5;
          const dur = green > 55 ? "8n" : "4n";
          sparkSynth.triggerAttackRelease(note, dur, time + Tone.Time(offsetBeat).toSeconds());
        }
      }
      // gentle pad accompaniment (shorter, lower level) instead of full sustained chord
      const leadPad = pick(rootNotes, Math.max(1, Math.round(chordSize - 1)));
      padSynth.triggerAttackRelease(leadPad, "2n", time + 0.02);
    }

    // occasional extra shimmer still allowed, but scaled down when both layers might otherwise collide
    const airyChance = map(green, 5, 90, 0.4, 0.85) * (harmonyToggle ? 0.85 : 1);
    if (Math.random() < airyChance) {
      const airyNote = airyNotes[Math.floor(Math.random() * airyNotes.length)];
      const randomOffset = Math.random() * 0.2;
      padSynth.triggerAttackRelease(airyNote, "4n", time + 0.1 + randomOffset);
    }

    // make noise texture slightly brighter in greener scenes
    noiseFilter.frequency.value = map(green, 5, 90, 320, 900);

    // subtle tempo breathing: greener -> a touch more spacious rhythm
    const baseInterval = green > 55 ? "2n" : "4n";
    pattern.interval = baseInterval;
  }, "2n");

  pattern.start(0);
}

// ---- Mapping functions ----

function getGreen() {
  return Number(slider.value);
}

function map(val, inMin, inMax, outMin, outMax) {
  const t = (val - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * Math.min(Math.max(t, 0), 1);
}

function updateFromGreen(source = "slider") {
  const green = getGreen();

  // text
  greenLabel.textContent = `${green}%`;

  // breath rate: more green -> slower breath
  const breathsPerMin = map(green, 5, 90, 12, 5.5);
  breathLabel.textContent = `${breathsPerMin.toFixed(1)} / min`;

  // calm index 0-1
  const calm = map(green, 5, 90, 0.18, 0.9);
  calmLabel.textContent = calm.toFixed(2);

  // breathing period in seconds
  const period = 60 / breathsPerMin;
  Tone.Transport.bpm.value = 60 / (period / 2); // two beats per breath

  // Noise level and breathing depth: make noise much more obvious when green is low
  // noiseGain sets the overall noise amplitude (high at low-green, very low at high-green)
  noiseGain.gain.value = map(green, 5, 90, 0.9, 0.02);

  if (breathLfo) {
    // Expand LFO modulation range more strongly at low green so the noise pulses are pronounced,
    // but keep subtle modulation at high green.
    breathLfo.min = map(green, 5, 90, 0.02, 0.004);
    breathLfo.max = map(green, 5, 90, 0.6, 0.04);
    breathLfo.frequency.value = 1 / period;
  }

  // Filter softness and reverb
  lowpass.frequency.value = map(green, 5, 90, 2600, 4200);
  lowpass.Q.value = map(green, 5, 90, 0.7, 0.3);
  baseReverbWet = map(green, 5, 90, 0.2, 0.3);
  reverb.wet.value = baseReverbWet;

  // Spatial timbre: more green -> wider, more fluid stereo/chorus
  stereo.width.value = map(green, 5, 90, 0.25, 0.75);
  chorus.frequency.value = map(green, 5, 90, 0.25, 1.2);
  chorus.depth = map(green, 5, 90, 0.15, 0.65);
  chorus.wet.value = map(green, 5, 90, 0.01, 0.1);

  // Pad timbre: darker and simpler with low green, brighter and richer with high green
  const padType =
    green < 30 ? "sine2" :
    green < 60 ? "sine4" :
    "sine8";

  const padAttack = map(green, 5, 90, 3.2, 1.8);
  const padRelease = map(green, 5, 90, 8, 12);

  padSynth.set({
    oscillator: { type: padType },
    envelope: {
      attack: padAttack,
      decay: 4.5,
      sustain: 0.85,
      release: padRelease
    }
  });

  // Melodic timbre: more defined and percussive in greener scenes
  const sparkAttack = map(green, 5, 90, 0.12, 0.04);
  const sparkDecay = map(green, 5, 90, 0.5, 0.25);
  const sparkRelease = map(green, 5, 90, 1.1, 0.8);

  const sparkOscType = green > 65 ? "triangle8" : "triangle4";

  sparkSynth.set({
    oscillator: { type: sparkOscType },
    envelope: {
      attack: sparkAttack,
      decay: sparkDecay,
      sustain: 0.15,
      release: sparkRelease
    }
  });

  // base instrument loudness so macro cycle can modulate around it
  basePadVolume = map(green, 5, 90, -17, -10);//green高時沙沙聲的關鍵
  baseSparkVolume = map(green, 5, 90, -18, -8);
  padSynth.volume.value = basePadVolume;
  sparkSynth.volume.value = baseSparkVolume;

  // Visual breathing scale
  const minScale = map(green, 5, 90, 0.8, 0.9);
  const maxScale = map(green, 5, 90, 1.08, 1.18);
  lung.style.setProperty("--breath-min", minScale.toString());
  lung.style.setProperty("--breath-max", maxScale.toString());

  // Animation timing
  const animDuration = Math.max(3, period);
  lungCore.style.animationDuration = `${animDuration}s`;

  // Color shift
  const greenHue = map(green, 5, 90, 100, 135);
  const intensity = map(green, 5, 90, 0.55, 0.95);
  lungCore.style.background = `
    radial-gradient(circle at 50% 30%, hsla(${greenHue}, 32%, ${72 * intensity}%, 0.95) 0, transparent 55%),
    radial-gradient(circle at 20% 80%, hsla(${greenHue + 8}, 30%, ${62 * intensity}%, 0.75) 0, transparent 60%),
    radial-gradient(circle at 80% 60%, hsla(${greenHue - 6}, 30%, ${54 * intensity}%, 0.75) 0, transparent 60%)
  `;
}

// pick N items without replacement
function pick(arr, count) {
  const src = [...arr];
  const out = [];
  while (src.length && out.length < count) {
    const idx = Math.floor(Math.random() * src.length);
    out.push(src.splice(idx, 1)[0]);
  }
  return out;
}

function estimateGreenFromImage(img) {
  const canvas = document.createElement("canvas");
  const size = 96;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Fit image into square canvas while preserving aspect
  const ratio = Math.min(size / img.width, size / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  const x = (size - w) / 2;
  const y = (size - h) / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, x, y, w, h);

  const { data } = ctx.getImageData(0, 0, size, size);

  let greenCount = 0;
  let totalCount = 0;

  // Helper: RGB (0–255) -> HSV (0–360, 0–1, 0–1)
  const rgbToHsv = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h = 0;
    if (d !== 0) {
      if (max === r) {
        h = ((g - b) / d) % 6;
      } else if (max === g) {
        h = (b - r) / d + 2;
      } else {
        h = (r - g) / d + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }

    const s = max === 0 ? 0 : d / max;
    const v = max;

    return { h, s, v };
  };

  // Sample all pixels; HSV-based green detection
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Ignore very transparent pixels
    if (a < 80) continue;

    const { h, s, v } = rgbToHsv(r, g, b);

    // Ignore very dark or very bright pixels (shadows / glare / sky)
    if (v < 0.12 || v > 0.96) continue;

    // General greenery band in HSV:
    // Hue 60–170 covers yellow-green to cyan-green.
    // Require some saturation to avoid gray concrete.
    const isGreenHue = h >= 60 && h <= 170;
    const isSaturatedEnough = s >= 0.18;

    if (isGreenHue && isSaturatedEnough) {
      greenCount++;
    }
    totalCount++;
  }

  if (!totalCount) return null;

  // Convert fraction to percentage
  const percent = (greenCount / totalCount) * 100;

  return percent;
}

// main.js 修改部分
function handlePhotoFile(file) {
  if (!file) return;

  const url = URL.createObjectURL(file); // 建立暫時網址
  const img = new Image();
  const centerHint = document.getElementById("upload-hint-center");
  
  img.onload = () => {
    const rawPercent = estimateGreenFromImage(img);
    if (rawPercent == null || Number.isNaN(rawPercent)) {
      URL.revokeObjectURL(url); // 如果失敗也要釋放
      return;
    }

    const clamped = Math.max(5, Math.min(90, rawPercent));
    const rounded = Math.round(clamped);
    slider.value = String(rounded);
    updateFromGreen("photo");

    if (started) {
      Tone.Transport.seconds = 0;
      padSynth.releaseAll();
    }

    // hide the central helper hint once a photo is successfully handled
    if (centerHint) {
      centerHint.classList.add("hidden");
      centerHint.setAttribute("aria-hidden", "true");
    }

    URL.revokeObjectURL(url); 
  };
  img.onerror = () => {
    URL.revokeObjectURL(url); 
  };
  img.src = url;

  if (photoPreviewImg) {
    photoPreviewImg.src = url; // 預覽圖依然會顯示，因為 img.src 已完成賦值
    photoPreviewImg.parentElement?.classList.add("has-image");
  }
}

// ---- Interaction ----

async function initAudioIfNeeded() {
  if (started) return;
  started = true;
  playing = true;

  // 確保 Tone.js 音訊環境已經啟動
  if (Tone.context.state !== "running") {
    await Tone.start();
  }
  
  setupMusic();

  noise.start();
  Tone.Transport.start("+0.1");

  lung.dataset.phase = "inhale";

  // ensure any paused UI state is cleared
  photoPreviewImg.parentElement?.classList.remove("paused");
}

slider.addEventListener("input", () => {
  updateFromGreen("slider");
});

if (photoInput) {
  photoInput.addEventListener("change", event => {
    const file = event.target.files && event.target.files[0];
    if (file) {
      handlePhotoFile(file);
      initAudioIfNeeded();
    }
  });
}

// Toggle play/pause by clicking the central photo
if (photoPreviewImg) {
  photoPreviewImg.addEventListener("click", async () => {
    // If audio hasn't been started yet, start it
    if (!started) {
      await initAudioIfNeeded();
      return;
    }

    // Toggle playback state
    if (playing) {
      // pause transport and stop noise; release sustained notes
      try {
        Tone.Transport.pause();
      } catch (e) {}
      try {
        noise.stop();
      } catch (e) {}
      try {
        padSynth.releaseAll();
        sparkSynth.releaseAll();
      } catch (e) {}
      playing = false;
      photoPreviewImg.parentElement?.classList.add("paused");
      lung.dataset.phase = ""; // stop phase flips visually
    } else {
      // resume
      try {
        noise.start();
      } catch (e) {}
      try {
        Tone.Transport.start("+0.05");
      } catch (e) {}
      playing = true;
      photoPreviewImg.parentElement?.classList.remove("paused");
      lung.dataset.phase = "inhale";
    }
  });
}

// subtle phase flip to keep circle alive visually even if animation is cached
setInterval(() => {
  if (!started) return;
  lung.dataset.phase = lung.dataset.phase === "inhale" ? "exhale" : "inhale";
}, 12000);

// initial layout
updateFromGreen("slider");
