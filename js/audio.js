export class AudioController {
  constructor() { this.track = new Audio(); this.track.loop = true; this.track.preload = "metadata"; this.context = null; this.settings = { bgmVolume: .55, sfxVolume: .8, ducking: .65 }; }
  apply(settings) { this.settings = settings; this.track.volume = settings.bgmVolume; }
  setTrack(src) { if (!src) { this.track.pause(); this.track.removeAttribute("src"); return; } if (!this.track.src.endsWith(src)) { this.track.src = src; this.track.load(); } }
  async play() { if (!this.track.src) return; try { await this.track.play(); } catch {} }
  pause() { this.track.pause(); }
  resume() { return this.play(); }
  duck(active, factor = this.settings.ducking) { this.track.volume = this.settings.bgmVolume * (active ? factor : 1); }
  async sfx(rating) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || this.settings.sfxVolume <= 0) return;
    this.context ||= new AudioCtx();
    if (this.context.state === "suspended") await this.context.resume();
    const patterns = { RETRY:[180], GOOD:[440,660], GREAT:[392,587,784], PERFECT:[523,659,784,1047] };
    const notes = patterns[rating] || patterns.GOOD;
    const now = this.context.currentTime;
    notes.forEach((frequency, index) => {
      const osc = this.context.createOscillator(); const gain = this.context.createGain();
      osc.type = rating === "RETRY" ? "sawtooth" : "sine"; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + index * .07);
      gain.gain.linearRampToValueAtTime(this.settings.sfxVolume * .16, now + index * .07 + .012);
      gain.gain.exponentialRampToValueAtTime(.001, now + index * .07 + .25);
      osc.connect(gain).connect(this.context.destination); osc.start(now + index * .07); osc.stop(now + index * .07 + .27);
    });
  }
}
