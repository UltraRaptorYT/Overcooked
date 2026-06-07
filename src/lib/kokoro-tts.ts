import type { KokoroTTS as KokoroTTSModel } from "kokoro-js";
import type { GenerateOptions } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = "af_heart";

type KokoroModule = typeof import("kokoro-js");

type SpeakOptions = {
  voice?: GenerateOptions["voice"];
  speed?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
};

let modelPromise: Promise<KokoroTTSModel> | null = null;
let warmupPromise: Promise<void> | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let playbackId = 0;

async function getModel() {
  if (!modelPromise) {
    modelPromise = import("kokoro-js").then(async ({ KokoroTTS }: KokoroModule) =>
      KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: "q8",
        device: "wasm",
      }),
    );
  }

  return modelPromise;
}

function releaseActiveAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio.load();
    activeAudio = null;
  }

  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
}

export function stopKokoroSpeech() {
  playbackId += 1;
  releaseActiveAudio();
}

export function preloadKokoroSpeech({
  voice = DEFAULT_VOICE,
  speed = 1,
}: Pick<SpeakOptions, "voice" | "speed"> = {}) {
  if (typeof window === "undefined") return Promise.resolve();

  warmupPromise ??= getModel()
    .then(async (model) => {
      // Prime the selected voice file and first inference path before user playback.
      await model.generate("Ready.", { voice, speed });
    })
    .then(() => undefined)
    .catch((error) => {
      warmupPromise = null;
      console.error("Failed to preload Kokoro speech", error);
    });

  return warmupPromise;
}

export async function playKokoroSpeech(
  text: string,
  {
    voice = DEFAULT_VOICE,
    speed = 1,
    volume = 1,
    onStart,
    onEnd,
  }: SpeakOptions = {},
) {
  const trimmedText = text.trim();
  if (typeof window === "undefined" || !trimmedText) return;

  stopKokoroSpeech();
  const currentPlaybackId = playbackId;

  try {
    onStart?.();

    await warmupPromise;
    if (currentPlaybackId !== playbackId) return;

    const model = await getModel();
    if (currentPlaybackId !== playbackId) return;

    const audio = await model.generate(trimmedText, { voice, speed });
    if (currentPlaybackId !== playbackId) return;

    await playAudioBlob(audio.toBlob(), currentPlaybackId, volume);
  } finally {
    if (currentPlaybackId === playbackId) {
      releaseActiveAudio();
      onEnd?.();
    }
  }
}

async function playAudioBlob(
  blob: Blob,
  currentPlaybackId: number,
  volume: number,
) {
  if (currentPlaybackId !== playbackId) return;

  const url = URL.createObjectURL(blob);
  const player = new Audio(url);
  player.volume = Math.min(Math.max(volume, 0), 1);

  activeAudio = player;
  activeUrl = url;

  await new Promise<void>((resolve) => {
    player.onended = () => resolve();
    player.onerror = () => resolve();
    void player.play().catch(() => resolve());
  });

  if (activeAudio === player) {
    activeAudio = null;
  }

  if (activeUrl === url) {
    URL.revokeObjectURL(url);
    activeUrl = null;
  }
}
