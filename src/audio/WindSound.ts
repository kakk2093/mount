/** Громкость метели в полную силу. */
const MAX_GAIN = 0.04;
const BUFFER_SECONDS = 4;

/**
 * Метель: шум ветра — полоса шума, которая медленно гуляет по высоте (завывание), и порывы — громкость
 * то нарастает, то спадает. Сила — от 0 (тихо) до 1 (полная метель), меняется плавно.
 */
export class WindSound {
	private ctx: AudioContext | null = null;
	private gain: GainNode | null = null;

	/** strength — 0..1. Первый вызов запускает звук (после жеста пользователя). */
	update(strength: number): void {
		if (!this.gain) this._start();
		this.gain!.gain.setTargetAtTime(MAX_GAIN * strength, this.ctx!.currentTime, 0.5);
	}

	private _start(): void {
		const ctx = (this.ctx = new AudioContext());
		const length = ctx.sampleRate * BUFFER_SECONDS;
		const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		noise.loop = true;
		// Завывание: полоса шума, высоту которой медленно водит LFO.
		const band = ctx.createBiquadFilter();
		band.type = 'bandpass';
		band.frequency.value = 500;
		band.Q.value = 1.2;
		const howl = ctx.createOscillator();
		howl.frequency.value = 0.13;
		const howlDepth = ctx.createGain();
		howlDepth.gain.value = 260;
		howl.connect(howlDepth);
		howlDepth.connect(band.frequency);
		// Порывы: громкость колеблется медленнее и не в такт завыванию.
		const gusts = ctx.createGain();
		gusts.gain.value = 0.7;
		const gust = ctx.createOscillator();
		gust.frequency.value = 0.07;
		const gustDepth = ctx.createGain();
		gustDepth.gain.value = 0.3;
		gust.connect(gustDepth);
		gustDepth.connect(gusts.gain);
		this.gain = ctx.createGain();
		this.gain.gain.value = 0;
		noise.connect(band);
		band.connect(gusts);
		gusts.connect(this.gain);
		this.gain.connect(ctx.destination);
		noise.start();
		howl.start();
		gust.start();
	}
}
