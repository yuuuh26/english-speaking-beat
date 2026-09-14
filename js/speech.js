export class SpeechController {
  constructor() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(Recognition);
    this.recognition = Recognition ? new Recognition() : null;
    this.listening = false;
    if (this.recognition) {
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 5;
    }
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
      try { this.recognition.start(); }
      catch (error) { settled = true; reject({ type: "start-failed", system: true, message: "音声認識を開始できませんでした。少し待って再試行してね。", cause: error }); }
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
