/** Громкость вплотную и с какого расстояния костёр уже не слышно, м. */
const MAX_GAIN = 0.3;
const RANGE = 18;
/** Треск: сколько щелчков в секунду в среднем. */
const CRACKLES_PER_SECOND = 7;
const BUFFER_SECONDS = 4;

/**
 * Звук костра: только потрескивание — щелчки и короткие хлопки поленьев (без гула: внизу его путали с метелью).
 * Всё — в одном закольцованном буфере; громкость — по расстоянию до ближайшего костра.
 */
export class FireSound {
	private ctx: AudioContext | null = null;
	private gain: GainNode | null = null;

	/** distance — до ближайшего костра, м. Первый вызов запускает звук (после жеста пользователя). */
	update(distance: number): void {
		if (!this.gain) this._start();
		const k = Math.max(0, 1 - distance / RANGE);
		this.gain!.gain.setTargetAtTime(MAX_GAIN * k * k, this.ctx!.currentTime, 0.15);
	}

	private _start(): void {
		const ctx = (this.ctx = new AudioContext());
		const rate = ctx.sampleRate;
		const length = rate * BUFFER_SECONDS;
		const buffer = ctx.createBuffer(1, length, rate);
		const data = buffer.getChannelData(0);
		// Треск: короткие затухающие щелчки разной силы, изредка — хлопок с хвостом (полено).
		const count = Math.floor(CRACKLES_PER_SECOND * BUFFER_SECONDS);
		for (let c = 0; c < count; c++) {
			const start = Math.floor(Math.random() * (length - rate * 0.1));
			const pop = Math.random() < 0.12;
			const len = Math.floor(rate * (pop ? 0.06 : 0.004 + Math.random() * 0.01));
			const amp = pop ? 0.6 : 0.15 + Math.random() * 0.4;
			for (let i = 0; i < len; i++) data[start + i] += (Math.random() * 2 - 1) * amp * Math.pow(1 - i / len, pop ? 3 : 1.5);
		}
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		src.loop = true;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 3500;
		this.gain = ctx.createGain();
		this.gain.gain.value = 0;
		src.connect(filter);
		filter.connect(this.gain);
		this.gain.connect(ctx.destination);
		src.start();
	}
}
