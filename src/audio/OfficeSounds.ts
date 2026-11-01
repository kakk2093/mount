/** Звуки офиса — процедурные: стук клавиш и короткий радостный перезвон «ушло в прод». */
export class OfficeSounds {
	private ctx: AudioContext | null = null;
	private noise: AudioBuffer | null = null;

	/** Набор: серия щелчков клавиш за seconds (неровно, как человек печатает). */
	typing(seconds: number, volume = 1): void {
		const ctx = this._context();
		const t0 = ctx.currentTime;
		for (let at = 0; at < seconds; at += 0.05 + Math.random() * 0.07) {
			const t = t0 + at;
			const src = ctx.createBufferSource();
			src.buffer = this.noise;
			const filter = ctx.createBiquadFilter();
			filter.type = 'bandpass';
			filter.frequency.value = 2500 + Math.random() * 1500;
			filter.Q.value = 1.5;
			const gain = ctx.createGain();
			const level = (0.12 + Math.random() * 0.08) * volume;
			gain.gain.setValueAtTime(level, t);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
			src.connect(filter);
			filter.connect(gain);
			gain.connect(ctx.destination);
			src.start(t, Math.random() * 0.5);
			src.stop(t + 0.04);
		}
	}

	/** «В прод»: вверх по мажорному аккорду — до, ми, соль, до. */
	deploy(): void {
		const ctx = this._context();
		const t0 = ctx.currentTime;
		[523, 659, 784, 1047].forEach((freq, i) => {
			const t = t0 + i * 0.09;
			const osc = ctx.createOscillator();
			osc.type = 'triangle';
			osc.frequency.value = freq;
			const gain = ctx.createGain();
			gain.gain.setValueAtTime(0.0001, t);
			gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + (i === 3 ? 1.2 : 0.4));
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(t);
			osc.stop(t + 1.3);
		});
	}

	close(): void {
		void this.ctx?.close();
		this.ctx = null;
	}

	private _context(): AudioContext {
		if (!this.ctx) {
			this.ctx = new AudioContext();
			this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
			const data = this.noise.getChannelData(0);
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		}
		if (this.ctx.state === 'suspended') void this.ctx.resume();
		return this.ctx;
	}
}
