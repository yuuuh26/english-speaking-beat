export class SpeechController {
  constructor() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(Recognition);
    this.recognition = Recognition ? new Recognition() : null;
    this.listening = false;
    this.inputStream = null;
    this.inputTrack = null;
    this.inputInfo = { mode: "default", label: "ブラウザ既定のマイク", customTrack: false, reason: "" };
    if (this.recognition) {
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 5;
    }
  }

  async prepareInput({ mode = "internal-preferred" } = {}) {
    this.releaseInput();

    if (mode === "auto") {
      this.inputInfo = { mode: "default", label: "ブラウザ既定のマイク", customTrack: false, reason: "auto" };
      return this.inputInfo;
    }

    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
      this.inputInfo = { mode: "default", label: "ブラウザ既定のマイク", customTrack: false, reason: "media-devices-unsupported" };
      return this.inputInfo;
    }

    let probeStream = null;
    try {
      // 権限取得後はデバイス名が取得できるため、ゲーム開始前に一度だけ確認する。
      probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(device => device.kind === "audioinput" && device.deviceId);

      const bluetoothLike = /bluetooth|headset|headphone|earbud|earphone|buds|airpods|wireless|liberty|soundcore|jabra|bose|wh-\w+|wf-\w+/i;
      const internalLike = /built[ -]?in|internal|phone|handset|pixel|本体|内蔵/i;

      const nonBluetooth = inputs.filter(device => !bluetoothLike.test(device.label || ""));
      const preferred =
        nonBluetooth.find(device => internalLike.test(device.label || "") && device.deviceId !== "default") ||
        nonBluetooth.find(device => device.deviceId !== "default" && device.deviceId !== "communications") ||
        nonBluetooth.find(device => device.deviceId === "default") ||
        null;

      probeStream.getTracks().forEach(track => track.stop());
      probeStream = null;

      if (!preferred) {
        this.inputInfo = { mode: "default", label: "ブラウザ既定のマイク", customTrack: false, reason: "internal-not-found" };
        return this.inputInfo;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: preferred.deviceId ? { exact: preferred.deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const track = stream.getAudioTracks()[0];
      if (!track) {
        stream.getTracks().forEach(item => item.stop());
        this.inputInfo = { mode: "default", label: "ブラウザ既定のマイク", customTrack: false, reason: "no-audio-track" };
        return this.inputInfo;
      }

      this.inputStream = stream;
      this.inputTrack = track;
      this.inputInfo = {
        mode: "internal-preferred",
        label: track.label || preferred.label || "スマホ本体マイク候補",
        customTrack: true,
        reason: ""
      };
      return this.inputInfo;
    } catch (error) {
      probeStream?.getTracks().forEach(track => track.stop());
      this.releaseInput();
      this.inputInfo = {
        mode: "default",
        label: "ブラウザ既定のマイク",
        customTrack: false,
        reason: error?.name || "prepare-failed"
      };
      return this.inputInfo;
    }
  }

  releaseInput() {
    try { this.inputStream?.getTracks().forEach(track => track.stop()); } catch {}
    this.inputStream = null;
    this.inputTrack = null;
  }

  listen({ lang = "en-US", onStart, onInterim } = {}) {
    if (!this.recognition) return Promise.reject({ type: "unsupported", system: true, message: "このブラウザは音声認識に対応していません。" });
    if (this.listening) this.stop();
    this.recognition.lang = lang;
    return new Promise((resolve, reject) => {
      let settled = false;
      this.recognition.onstart = () => { this.listening = true; onStart?.(); };
      this.recognition.onresult = event => {
        const current = event.results[event.results.length - 1];
        onInterim?.(current[0]?.transcript || "");
        if (current.isFinal && !settled) {
          settled = true;
          const alternatives = Array.from(current).map(({ transcript, confidence }) => ({ transcript, confidence }));
          resolve({ alternatives });
        }
      };
      this.recognition.onerror = event => {
        if (settled) return;
        settled = true;
        const systemErrors = ["not-allowed", "service-not-allowed", "network", "audio-capture", "aborted", "no-speech"];
        reject({ type: event.error, system: systemErrors.includes(event.error), message: this.errorMessage(event.error) });
      };
      this.recognition.onend = () => {
        this.listening = false;
        if (!settled) { settled = true; reject({ type: "no-speech", system: true, message: "音声を認識できませんでした。もう一度試してね。" }); }
      };
      try {
        if (this.inputTrack?.readyState === "live") this.recognition.start(this.inputTrack);
        else this.recognition.start();
      } catch (error) {
        // audioTrack 引数に未対応のブラウザでは従来方式へフォールバックする。
        try {
          this.recognition.start();
        } catch (fallbackError) {
          settled = true;
          reject({ type: "start-failed", system: true, message: "音声認識を開始できませんでした。少し待って再試行してね。", cause: fallbackError || error });
        }
      }
    });
  }

  stop() { try { this.recognition?.abort(); } catch {} this.listening = false; }

  errorMessage(type) {
    return ({
      "not-allowed": "マイク権限が必要です。Chromeのサイト設定を確認してね。",
      "service-not-allowed": "音声認識サービスを利用できません。",
      "network": "音声認識の通信に失敗しました。接続を確認してね。",
      "audio-capture": "マイクを利用できません。",
      "no-speech": "音声を認識できませんでした。もう一度試してね。",
      "aborted": "音声認識を停止しました。"
    })[type] || "音声認識でエラーが発生しました。";
  }

  speak(text, { lang = "en-US", rate = .9, volume = 1, onStart, onEnd } = {}) {
    speechSynthesis.cancel();
    return new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang; utterance.rate = rate; utterance.volume = volume;
      utterance.onstart = () => onStart?.();
      utterance.onend = () => { onEnd?.(); resolve(); };
      utterance.onerror = () => { onEnd?.(); resolve(); };
      speechSynthesis.speak(utterance);
    });
  }
}
