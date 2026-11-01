/**
 * Музыка реанимации: диско-грув на 110 уд/мин — без файлов. Бочка на каждую долю (под неё хочется давить
 * в такт), хлопок на 2 и 4, хэты на слабые; поверх — «качающийся» октавами бас, отрывистые аккорды
 * и простая мелодия в ля миноре. setMelodic(0..1) — громкость всего, кроме ударных: к концу музыка
 * стихает, остаётся только перкуссия.
 */

const BPM = 110;
const SIXTEENTH = 60 / BPM / 4;
const STEPS_PER_BAR = 16;
const TICK_MS = 25;
const LOOKAHEAD = 0.2;
const DRUMS_VOLUME = 0.55;
const MELODIC_VOLUME = 0.45;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Am — F — C — G, по такту: корень баса и аккорд (MIDI). */
const BARS: { root: number; chord: number[] }[] = [
	{ root: 45, chord: [57, 60, 64] },
	{ root: 41, chord: [57, 60, 65] },
	{ root: 48, chord: [55, 60, 64] },
	{ root: 43, chord: [55, 59, 62] },
];
/** Мелодия на два такта по шестнадцатым (MIDI, 0 — пауза), повторяется. */
const MELODY = [76, 0, 0, 76, 0, 0, 74, 0, 72, 0, 74, 0, 76, 0, 0, 0, 79, 0, 0, 76, 0, 0, 74, 0, 72, 0, 69, 0, 72, 0, 0, 0];

export class CprMusic {
	private ctx: AudioContext | null = null;
	private drums: GainNode | null = null;
	private melodic: GainNode | null = null;
	private noise: AudioBuffer | null = null;
	private timer: number | null = null;
	private nextTime = 0;
	private step = 0;

	start(): void {
		if (this.timer !== null) return;
		const ctx = this._context();
		if (ctx.state === 'suspended') void ctx.resume();
		this.drums!.gain.setValueAtTime(0, ctx.currentTime);
		this.drums!.gain.linearRampToValueAtTime(DRUMS_VOLUME, ctx.currentTime + 1);
		this.nextTime = ctx.currentTime + 0.1;
		this.step = 0;
		this.timer = window.setInterval(() => this._schedule(), TICK_MS);
	}

	/** 0..1 — громкость всего, кроме ударных; меняется плавно, можно звать каждый кадр. */
	setMelodic(amount: number): void {
		if (!this.ctx) return;
		// Запустили до первого клика (старт сразу со сцены) — браузер держит звук на паузе; после клика можно снять.
		if (this.ctx.state === 'suspended' && navigator.userActivation?.hasBeenActive !== false) void this.ctx.resume();
		this.melodic!.gain.setTargetAtTime(MELODIC_VOLUME * amount, this.ctx.currentTime, 0.6);
	}

	/** 0..1 — громкость ударных; меняется плавно, можно звать каждый кадр. */
	setDrums(amount: number): void {
		if (!this.ctx) return;
		this.drums!.gain.setTargetAtTime(DRUMS_VOLUME * amount, this.ctx.currentTime, 0.6);
	}

	/** Затихнуть за seconds и остановиться. */
	stop(seconds = 1.5): void {
		if (!this.ctx) return;
		const ctx = this.ctx;
		for (const g of [this.drums!, this.melodic!]) g.gain.setTargetAtTime(0, ctx.currentTime, seconds / 4);
		const timer = this.timer;
		this.timer = null;
		window.setTimeout(() => {
			if (timer !== null) window.clearInterval(timer);
			void ctx.close();
		}, seconds * 1000 + 200);
		this.ctx = null;
	}

	private _context(): AudioContext {
		if (this.ctx) return this.ctx;
		const ctx = (this.ctx = new AudioContext());
		this.drums = ctx.createGain();
		this.drums.gain.value = 0;
		this.drums.connect(ctx.destination);
		this.melodic = ctx.createGain();
		this.melodic.gain.value = MELODIC_VOLUME;
		this.melodic.connect(ctx.destination);
		this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = this.noise.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		return ctx;
	}

	private _schedule(): void {
		const ctx = this.ctx;
		if (!ctx) return;
		while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
			this._playStep(this.step, this.nextTime);
			this.nextTime += SIXTEENTH;
			this.step++;
		}
	}

	private _playStep(step: number, t: number): void {
		const s = step % STEPS_PER_BAR;
		const bar = BARS[Math.floor(step / STEPS_PER_BAR) % BARS.length];
		// Ударные: бочка на каждую долю, хлопок на 2 и 4, открытый хэт на слабые восьмые, тихие шестнадцатые.
		if (s % 4 === 0) this._kick(t);
		if (s === 4 || s === 12) this._noiseHit(this.drums!, t, 'bandpass', 1500, 0.9, 0.16, 0.35);
		if (s % 4 === 2) this._noiseHit(this.drums!, t, 'highpass', 7000, 0.7, 0.12, 0.12);
		else if (s % 2 === 1) this._noiseHit(this.drums!, t, 'highpass', 9000, 0.7, 0.03, 0.04);
		// Бас: восьмыми, корень — октава выше — корень…
		if (s % 2 === 0) this._bass(hz(bar.root + (s % 4 === 2 ? 12 : 0)), t);
		// Аккорды: отрывисто на слабые восьмые.
		if (s % 4 === 2) for (const note of bar.chord) this._stab(hz(note), t);
		// Мелодия.
		const note = MELODY[step % MELODY.length];
		if (note > 0) this._lead(hz(note), t);
	}

	private _kick(t: number): void {
		const ctx = this.ctx!;
		const osc = ctx.createOscillator();
		osc.frequency.setValueAtTime(140, t);
		osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.9, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
		osc.connect(gain);
		gain.connect(this.drums!);
		osc.start(t);
		osc.stop(t + 0.4);
	}

	private _bass(freq: number, t: number): void {
		const ctx = this.ctx!;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.setValueAtTime(900, t);
		filter.frequency.exponentialRampToValueAtTime(250, t + 0.15);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(0.35, t + 0.008);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + SIXTEENTH * 1.8);
		filter.connect(gain);
		gain.connect(this.melodic!);
		const osc = ctx.createOscillator();
		osc.type = 'sawtooth';
		osc.frequency.value = freq;
		osc.connect(filter);
		osc.start(t);
		osc.stop(t + SIXTEENTH * 2);
	}

	/** Аккорд: две расстроенные «пилы», короткий щелчок. */
	private _stab(freq: number, t: number): void {
		const ctx = this.ctx!;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 2400;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(0.06, t + 0.005);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
		filter.connect(gain);
		gain.connect(this.melodic!);
		for (const detune of [-10, 10]) {
			const osc = ctx.createOscillator();
			osc.type = 'sawtooth';
			osc.frequency.value = freq;
			osc.detune.value = detune;
			osc.connect(filter);
			osc.start(t);
			osc.stop(t + 0.2);
		}
	}

	/** Мелодия: квадрат, мягкий срез. */
	private _lead(freq: number, t: number): void {
		const ctx = this.ctx!;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 3000;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(0.07, t + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + SIXTEENTH * 2.5);
		filter.connect(gain);
		gain.connect(this.melodic!);
		const osc = ctx.createOscillator();
		osc.type = 'square';
		osc.frequency.value = freq;
		osc.connect(filter);
		osc.start(t);
		osc.stop(t + SIXTEENTH * 3);
	}

	private _noiseHit(out: AudioNode, t: number, type: BiquadFilterType, freq: number, q: number, length: number, volume: number): void {
		const ctx = this.ctx!;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		src.loop = true;
		const filter = ctx.createBiquadFilter();
		filter.type = type;
		filter.frequency.value = freq;
		filter.Q.value = q;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
		src.connect(filter);
		filter.connect(gain);
		gain.connect(out);
		src.start(t, Math.random() * 0.8);
		src.stop(t + length + 0.05);
	}
}
