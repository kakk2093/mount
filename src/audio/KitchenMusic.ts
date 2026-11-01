/**
 * Музыка кухни (первое воспоминание): весёлая застольная полька в до мажоре — без файлов. Сначала тишина;
 * с каждой рюмкой (setLevel 1..5) вступает новый слой: 1 — бас и «ум-па» аккордами (гармошка),
 * 2 — мелодия, 3 — барабаны, 4 — мелодия октавами и хэты, 5 — бубен и всё громче.
 */

const BPM = 132;
const EIGHTH = 60 / BPM / 2;
const EIGHTHS_PER_BAR = 8;
const TICK_MS = 25;
const LOOKAHEAD = 0.2;
/** Громкость: на первом слое и прибавка за каждый следующий. */
const VOLUME_BASE = 0.14;
const VOLUME_STEP = 0.04;
/** Сколько слоёв всего. */
export const KITCHEN_LEVELS = 5;

/** Нота по номеру MIDI → Гц. */
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

interface Bar {
	/** Бас: тоника и квинта (MIDI) — «ум» на 1 и 3. */
	bass: [number, number];
	/** Аккорд — «па» на 2 и 4 (MIDI). */
	chord: number[];
	/** Мелодия по восьмым (MIDI, 0 — пауза). */
	melody: number[];
}

/** C — F — G7 — C, дважды; во второй раз мелодия выше и задорнее. */
const BARS: Bar[] = [
	{ bass: [36, 43], chord: [60, 64, 67], melody: [72, 0, 76, 0, 79, 0, 76, 0] },
	{ bass: [41, 36], chord: [60, 65, 69], melody: [77, 0, 81, 0, 77, 76, 74, 0] },
	{ bass: [43, 38], chord: [59, 62, 65, 67], melody: [74, 0, 79, 0, 77, 0, 74, 0] },
	{ bass: [36, 43], chord: [60, 64, 67], melody: [76, 0, 72, 0, 72, 0, 0, 0] },
	{ bass: [36, 43], chord: [60, 64, 67], melody: [79, 79, 79, 0, 76, 0, 79, 0] },
	{ bass: [41, 36], chord: [60, 65, 69], melody: [81, 0, 77, 0, 81, 0, 84, 0] },
	{ bass: [43, 38], chord: [59, 62, 65, 67], melody: [83, 0, 79, 0, 77, 0, 74, 0] },
	{ bass: [36, 43], chord: [60, 64, 67], melody: [72, 0, 76, 0, 72, 0, 0, 0] },
];

export class KitchenMusic {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private noise: AudioBuffer | null = null;
	private timer: number | null = null;
	private nextTime = 0;
	private step = 0;
	private level = 0;

	/** Сколько слоёв играет (0 — тишина). Новый слой вступает с ближайшей восьмой. */
	setLevel(level: number): void {
		this.level = Math.min(level, KITCHEN_LEVELS);
		if (this.level <= 0) return;
		const ctx = this._context();
		if (ctx.state === 'suspended') void ctx.resume();
		this.master!.gain.setTargetAtTime(VOLUME_BASE + VOLUME_STEP * (this.level - 1), ctx.currentTime, 0.3);
		if (this.timer === null) {
			this.nextTime = ctx.currentTime + 0.1;
			this.step = 0;
			this.timer = window.setInterval(() => this._schedule(), TICK_MS);
		}
	}

	/** Затихнуть за seconds и остановиться. */
	stop(seconds = 1.5): void {
		if (!this.ctx) return;
		const ctx = this.ctx;
		this.master!.gain.setTargetAtTime(0, ctx.currentTime, seconds / 4);
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
		this.master = ctx.createGain();
		this.master.gain.value = 0;
		// Немного «комнаты»: короткая реверберация — тесная кухня.
		const reverb = ctx.createConvolver();
		const length = Math.floor(ctx.sampleRate * 0.8);
		const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
		for (let ch = 0; ch < 2; ch++) {
			const data = impulse.getChannelData(ch);
			for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
		}
		reverb.buffer = impulse;
		const wet = ctx.createGain();
		wet.gain.value = 0.2;
		this.master.connect(ctx.destination);
		this.master.connect(reverb);
		reverb.connect(wet);
		wet.connect(ctx.destination);

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
			this.nextTime += EIGHTH;
			this.step++;
		}
	}

	private _playStep(step: number, t: number): void {
		const eighth = step % EIGHTHS_PER_BAR;
		const bar = BARS[Math.floor(step / EIGHTHS_PER_BAR) % BARS.length];
		const n = this.level;
		// Слой 1: «ум-па» — бас на 1 и 3, аккорд гармошкой на 2 и 4.
		if (eighth === 0) this._bass(hz(bar.bass[0]), t);
		if (eighth === 4) this._bass(hz(bar.bass[1]), t);
		if (eighth === 2 || eighth === 6) for (const note of bar.chord) this._reed(hz(note), t, EIGHTH * 1.2, 0.035);
		// Слой 2: мелодия; 4 — ещё и октавой выше.
		const note = bar.melody[eighth];
		if (n >= 2 && note > 0) {
			this._reed(hz(note), t, EIGHTH * 1.6, 0.07);
			if (n >= 4) this._reed(hz(note + 12), t, EIGHTH * 1.4, 0.03);
		}
		// Слой 3: бочка на 1 и 3, малый на 2 и 4; 4 — хэты восьмыми; 5 — бубен на каждую восьмую и шестнадцатые.
		if (n >= 3) {
			if (eighth === 0 || eighth === 4) this._kick(t, 0.45);
			if (eighth === 2 || eighth === 6) this._noiseHit(t, 'bandpass', 2000, 0.8, 0.14, 0.18);
		}
		if (n >= 4) this._noiseHit(t, 'highpass', 8000, 0.7, 0.04, eighth % 2 === 0 ? 0.05 : 0.03);
		if (n >= 5) {
			this._noiseHit(t, 'bandpass', 6500, 2, 0.09, 0.06);
			this._noiseHit(t + EIGHTH / 2, 'bandpass', 6500, 2, 0.06, 0.03);
		}
	}

	/** Гармошка: два чуть расстроенных «пилы» через срез верхов, быстрая атака, короткий хвост. */
	private _reed(freq: number, t: number, length: number, level: number): void {
		const ctx = this.ctx!;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 2600;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(level, t + 0.015);
		gain.gain.setValueAtTime(level, t + length * 0.7);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + length + 0.08);
		filter.connect(gain);
		gain.connect(this.master!);
		for (const detune of [-9, 9]) {
			const osc = ctx.createOscillator();
			osc.type = 'sawtooth';
			osc.frequency.value = freq;
			osc.detune.value = detune;
			osc.connect(filter);
			osc.start(t);
			osc.stop(t + length + 0.1);
		}
	}

	/** Бас: короткий щипок — треугольник. */
	private _bass(freq: number, t: number): void {
		const ctx = this.ctx!;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0.0001, t);
		gain.gain.linearRampToValueAtTime(0.22, t + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + EIGHTH * 1.8);
		gain.connect(this.master!);
		const osc = ctx.createOscillator();
		osc.type = 'triangle';
		osc.frequency.value = freq;
		osc.connect(gain);
		osc.start(t);
		osc.stop(t + EIGHTH * 2);
	}

	private _kick(t: number, level: number): void {
		const ctx = this.ctx!;
		const osc = ctx.createOscillator();
		osc.frequency.setValueAtTime(120, t);
		osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(level, t);
		gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
		osc.connect(gain);
		gain.connect(this.master!);
		osc.start(t);
		osc.stop(t + 0.35);
	}

	private _noiseHit(t: number, type: BiquadFilterType, freq: number, q: number, length: number, volume: number): void {
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
		gain.connect(this.master!);
		src.start(t, Math.random() * 0.8);
		src.stop(t + length + 0.05);
	}
}
