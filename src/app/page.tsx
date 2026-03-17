"use client";

import { useEffect, useMemo, useState } from "react";
import { Volume2, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function TextToSpeechCard() {
  const [text, setText] = useState("Hello, this is a test.");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [rate, setRate] = useState([1]);
  const [pitch, setPitch] = useState([1]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);

      if (!selectedVoice && availableVoices.length > 0) {
        const englishVoice =
          availableVoices.find((v) => v.lang.startsWith("en")) ||
          availableVoices[0];
        setSelectedVoice(englishVoice.name);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, [selectedVoice]);

  const groupedVoices = useMemo(() => {
    return voices.sort((a, b) => a.lang.localeCompare(b.lang));
  }, [voices]);

  const handleSpeak = () => {
    if (!text.trim()) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voices.find((v) => v.name === selectedVoice);

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    utterance.rate = rate[0];
    utterance.pitch = pitch[0];

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  return (
    <Card className="mx-auto w-full max-w-2xl rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Volume2 className="h-5 w-5" />
          Text to Speech
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="tts-text">Text</Label>
          <Textarea
            id="tts-text"
            placeholder="Type something to speak..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
          />
        </div>

        <div className="space-y-2">
          <Label>Voice</Label>
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger>
              <SelectValue placeholder="Select a voice" />
            </SelectTrigger>
            <SelectContent>
              {groupedVoices.map((voice) => (
                <SelectItem
                  key={`${voice.name}-${voice.lang}`}
                  value={voice.name}
                >
                  {voice.name} ({voice.lang})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Rate</Label>
            <span className="text-sm text-muted-foreground">
              {rate[0].toFixed(1)}x
            </span>
          </div>
          <Slider
            value={rate}
            onValueChange={setRate}
            min={0.5}
            max={2}
            step={0.1}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Pitch</Label>
            <span className="text-sm text-muted-foreground">
              {pitch[0].toFixed(1)}
            </span>
          </div>
          <Slider
            value={pitch}
            onValueChange={setPitch}
            min={0}
            max={2}
            step={0.1}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSpeak} disabled={!text.trim() || isSpeaking}>
            <Volume2 className="mr-2 h-4 w-4" />
            {isSpeaking ? "Speaking..." : "Speak"}
          </Button>

          <Button variant="outline" onClick={handleStop} disabled={!isSpeaking}>
            <Square className="mr-2 h-4 w-4" />
            Stop
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
