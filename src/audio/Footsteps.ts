/** Процедурный звук шага: короткий шумовой импульс через lowpass-фильтр — без внешних файлов. */
export class Footsteps {
	private ctx: AudioContext | null = null;

	private _context(): AudioContext {
		if (!this.ctx) this.ctx = new AudioContext();
		return this.ctx;
	}

	/** loud > 1 — громче (бег/приземление). */
	play(loud = 1): void {
		const ctx = this._context();
		if (ctx.state === 'suspended') void ctx.resume();

		const duration = 0.07;
		const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) {
			data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
		}

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
