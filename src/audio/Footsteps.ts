/** По чему идём: снег — мягкий хруст, твёрдое — глухой стук. */
export type Surface = 'snow' | 'hard';

/** Процедурный звук шага — без внешних файлов. */
export class Footsteps {
	private ctx: AudioContext | null = null;
	surface: Surface = 'snow';

	private _context(): AudioContext {
		if (!this.ctx) this.ctx = new AudioContext();
		if (this.ctx.state === 'suspended') void this.ctx.resume();
		return this.ctx;
	}

	/** loud > 1 — громче (бег/приземление). */
	play(loud = 1): void {
		if (this.surface === 'snow') this._snow(loud);
		else this._hard(loud);
	}

	/**
	 * Шаг по снегу: мягкий хруст — шум из мелких «крупинок» (частые случайные щелчки разной силы), с плавным
	 * нарастанием (нога продавливает снег) и спадом; верх приглушён — не звонко.
	 */
	private _snow(loud: number): void {
		const ctx = this._context();
		const duration = 0.16 + Math.random() * 0.06;
		const length = Math.floor(ctx.sampleRate * duration);
		const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) {
			const k = i / length;
			const envelope = Math.min(1, k * 6) * Math.pow(1 - k, 1.8);
			// Крупинки: редкие сильные щелчки поверх тихого шума.
			const grain = Math.random() < 0.08 ? (Math.random() * 2 - 1) * 1.6 : (Math.random() * 2 - 1) * 0.3;
			data[i] = grain * envelope;
		}
		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		const band = ctx.createBiquadFilter();
		band.type = 'bandpass';
		band.frequency.value = 900 + Math.random() * 500;
		band.Q.value = 0.7;
		const soft = ctx.createBiquadFilter();
		soft.type = 'lowpass';
		soft.frequency.value = 2200;
		const gain = ctx.createGain();
		gain.gain.value = 0.11 * loud;
		noise.connect(band);
		band.connect(soft);
		soft.connect(gain);
		gain.connect(ctx.destination);
		noise.start();
	}

	/** Шаг по твёрдому полу: короткий шумовой импульс через lowpass. */
	private _hard(loud: number): void {
		const ctx = this._context();
		const duration = 0.07;
		const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
		const noise = ctx.createBufferSource();
		noise.buffer = buffer;
		const filter = ctx.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 500 + Math.random() * 200;
		const gain = ctx.createGain();
		gain.gain.value = 0.09 * loud;
		noise.connect(filter);
		filter.connect(gain);
		gain.connect(ctx.destination);
		noise.start();
	}
}
