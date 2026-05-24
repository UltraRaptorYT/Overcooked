"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const sampleText = `Yesterday, an upright explorer walked left across the playground before heading right toward the old tower. On the way, he downloaded a map from the campsite computer and looked down at the directions carefully. Suddenly, a leftover sandwich fell right out of his backpack, so he bent down to pick it up.

As he continued up the hill, he saw a downright strange sign pointing left and right at the same time. Confused, he looked up at the sky before moving left toward a small cabin. Inside, he found an upright lamp beside a stack of downloaded papers scattered all around the floor.

After resting for a while, he walked right out of the cabin and headed down the rocky path. Near the riverbank, he spotted another leftover bag beside an upside-down canoe. He quickly looked up, waved both hands in excitement, and ran right toward his friends waiting near the campsite entrance.`;

export default function TextToSpeechPage() {
  const synthRef = useRef<SpeechSynthesis | null>(null);

  const [text, setText] = useState(sampleText);
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const directionCounts = useMemo(() => {
    const words = text.toLowerCase().match(/\b\w+\b/g) ?? [];

    return {
      up: words.filter((word) => word.includes("up")).length,
      down: words.filter((word) => word.includes("down")).length,
      right: words.filter((word) => word.includes("right")).length,
      left: words.filter((word) => word.includes("left")).length,
    };
  }, [text]);

  useEffect(() => {
    synthRef.current = window.speechSynthesis;

    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  const estimatedSeconds = useMemo(() => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;

    // Average speech speed is around 150 words per minute
    const baseWordsPerMinute = 150;

    return Math.ceil((words / (baseWordsPerMinute * rate)) * 60);
  }, [text, rate]);

  const formattedTime = useMemo(() => {
    const mins = Math.floor(estimatedSeconds / 60);
    const secs = estimatedSeconds % 60;

    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }, [estimatedSeconds]);

  const handleSpeak = () => {
    if (!synthRef.current || !text.trim()) return;

    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current.speak(utterance);
  };

  const handleStop = () => {
    synthRef.current?.cancel();
    setIsSpeaking(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow">
        <h1 className="mb-4 text-2xl font-bold">Text to Speech</h1>

        <textarea
          className="min-h-40 w-full rounded-lg border border-gray-300 p-3 outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Type something to read aloud..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <p className="mt-3 text-sm text-gray-600">
          Estimated time: <strong>{formattedTime}</strong>
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {Object.entries(directionCounts).map(([direction, count]) => (
            <div key={direction} className="rounded-lg bg-gray-100 p-3">
              <div className="text-sm capitalize text-gray-600">
                {direction}
              </div>
              <div className="text-xl font-bold">{count}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <div className="mb-1 flex justify-between text-sm">
              <span>Speed</span>
              <span>{rate.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-full"
            />
          </label>

          <label className="block">
            <div className="mb-1 flex justify-between text-sm">
              <span>Pitch</span>
              <span>{pitch.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={pitch}
              onChange={(e) => setPitch(Number(e.target.value))}
              className="w-full"
            />
          </label>

          <label className="block">
            <div className="mb-1 flex justify-between text-sm">
              <span>Volume</span>
              <span>{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-full"
            />
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={handleSpeak}
            disabled={!text.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:bg-gray-400"
          >
            {isSpeaking ? "Restart" : "Read Aloud"}
          </button>

          <button
            onClick={handleStop}
            className="rounded-lg bg-gray-800 px-4 py-2 text-white"
          >
            Stop
          </button>
        </div>
      </div>
    </main>
  );
}
