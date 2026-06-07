import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { KokoroTTS } from "kokoro-js";

const ROOT = process.cwd();
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const ORDER_SOURCES = [
  {
    difficulty: "easy",
    variableName: "EASY_ORDERS",
    filePath: path.join(ROOT, "src/lib/game-data/easy-orders.ts"),
  },
  {
    difficulty: "hard",
    variableName: "HARD_ORDERS",
    filePath: path.join(ROOT, "src/lib/game-data/hard-orders.ts"),
  },
];
const OUTPUT_DIR = path.join(ROOT, "public/order-audio");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const DEFAULT_VOICES = [
  "af_heart",
  "am_puck",
  "bf_emma",
  "am_fenrir",
  "af_bella",
  "bm_george",
];

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);

const force = args.has("force");
const dryRun = args.has("dry-run");
const voices = (args.get("voices") ?? args.get("voice") ?? DEFAULT_VOICES.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const speed = Number(args.get("speed") ?? 0.88);
const onlyOrderNos = new Set(
  (args.get("only") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

function getPropertyName(property) {
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }

  return null;
}

function getStringProperty(objectLiteral, propertyName) {
  const property = objectLiteral.properties.find(
    (entry) =>
      ts.isPropertyAssignment(entry) && getPropertyName(entry) === propertyName,
  );

  if (!property || !ts.isPropertyAssignment(property)) return null;

  const initializer = property.initializer;
  if (
    ts.isStringLiteral(initializer) ||
    ts.isNoSubstitutionTemplateLiteral(initializer)
  ) {
    return initializer.text;
  }

  return null;
}

async function readOrders({ difficulty, variableName, filePath }) {
  const sourceText = await fs.readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const orders = [];

  sourceFile.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;

    for (const declaration of node.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== variableName ||
        !declaration.initializer ||
        !ts.isArrayLiteralExpression(declaration.initializer)
      ) {
        continue;
      }

      for (const element of declaration.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;

        const orderNo = getStringProperty(element, "orderNo");
        const spokenText = getStringProperty(element, "spokenText");

        if (orderNo && spokenText) {
          orders.push({ difficulty, orderNo, spokenText });
        }
      }
    }
  });

  return orders;
}

function pickVoice(orderNo) {
  const numericOrderNo = Number(orderNo);
  const index = Number.isFinite(numericOrderNo)
    ? numericOrderNo
    : orderNo.split("").reduce((total, char) => total + char.charCodeAt(0), 0);

  return voices[index % voices.length] ?? "af_heart";
}

function getAudioHash({ spokenText, voice }) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ model: MODEL_ID, voice, speed, spokenText }))
    .digest("hex");
}

async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  } catch {
    return { generatedAt: null, model: MODEL_ID, voices, speed, files: {} };
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const orders = (await Promise.all(ORDER_SOURCES.map(readOrders)))
    .flat()
    .filter((order) => onlyOrderNos.size === 0 || onlyOrderNos.has(order.orderNo));
  const manifest = await readManifest();
  manifest.files ??= {};

  const pending = [];
  for (const order of orders) {
    const key = `${order.difficulty}-${order.orderNo}`;
    const fileName = `${key}.wav`;
    const outputPath = path.join(OUTPUT_DIR, fileName);
    const voice = pickVoice(order.orderNo);
    const hash = getAudioHash({ ...order, voice });
    const isCurrent =
      !force &&
      manifest.files[key]?.hash === hash &&
      (await fileExists(outputPath));

    if (isCurrent) {
      console.log(`skip ${fileName}`);
      continue;
    }

    pending.push({ ...order, key, fileName, outputPath, hash, voice });
  }

  if (pending.length === 0) {
    manifest.generatedAt = new Date().toISOString();
    manifest.model = MODEL_ID;
    delete manifest.voice;
    manifest.voices = voices;
    manifest.speed = speed;
    await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log("All order audio files are up to date.");
    return;
  }

  console.log(`Generating ${pending.length} order audio file(s)...`);
  if (dryRun) {
    for (const order of pending) console.log(`dry-run ${order.fileName}`);
    return;
  }

  const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: "q8",
    device: "cpu",
  });

  for (const order of pending) {
    console.log(`generate ${order.fileName}`);
    const audio = await tts.generate(order.spokenText, {
      voice: order.voice,
      speed,
    });
    await audio.save(order.outputPath);
    manifest.files[order.key] = {
      file: `/order-audio/${order.fileName}`,
      hash: order.hash,
      orderNo: order.orderNo,
      difficulty: order.difficulty,
      voice: order.voice,
      speed,
      generatedAt: new Date().toISOString(),
    };
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.model = MODEL_ID;
  delete manifest.voice;
  manifest.voices = voices;
  manifest.speed = speed;
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
