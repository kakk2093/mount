import type { Dialogue, InteractionSound, Voice } from '../core/Interaction.js';
import { LETTERBOX_HEIGHT } from './Letterbox.js';

/** Скорость печати, символов в секунду. */
const CHARS_PER_SECOND = 28;
/** Пауза печати после знаков препинания, с. */
const PUNCTUATION_PAUSE = 0.18;
const ACCENT = '#e3b25a';

/**
 * Реплики диалога — прямо на нижней чёрной полосе кинорамки (Letterbox, её выдвигает Game), без окна:
 * имя говорящего и текст с эффектом печатной машинки; в углу — «ЛКМ ▶» (тусклая, пока реплика печатается;
 * мигает, когда допечатана).
 * onBlip — на каждую вторую напечатанную букву: Game играет писк голоса говорящего.
 * У реплики с glitch хвост появляется разом, когда text допечатан, — и вызывается onGlitch (сбой картинки и звука).
 */
export class DialogueBox {
	private readonly root = document.createElement('div');
	private readonly speaker = document.createElement('div');
	private readonly text = document.createElement('div');
	private readonly hint = document.createElement('div');
	private dialogue: Dialogue | null = null;
	private lineIndex = 0;
	/** Сколько символов текущей реплики уже напечатано (дробное — копится по времени). */
	private shown = 0;
	/** Хвост-глитч текущей реплики уже показан. */
	private glitchShown = false;
	private pause = 0;
	/** Сколько реплика висит допечатанной, с — для autoClose. */
	private held = 0;
	/** Сколько ещё ждать перед первой репликой (пока выезжает кинорамка), с. */
	private delay = 0;
	private time = 0;
	onBlip: ((voice: Voice) => void) | null = null;
	onGlitch: (() => void) | null = null;
	/** Разговор закончен — Game играет его endSound. */
	onEnd: ((sound: InteractionSound | undefined) => void) | null = null;

	constructor() {
		Object.assign(this.root.style, {
			position: 'fixed',
			left: '50%',
			bottom: '0',
			transform: 'translateX(-50%)',
			width: 'min(860px, 92vw)',
			minHeight: LETTERBOX_HEIGHT,
			boxSizing: 'border-box',
			padding: '10px 20px 26px',
			flexDirection: 'column',
			justifyContent: 'center',
			color: '#f1e8d6',
			font: '20px/1.4 system-ui, sans-serif',
			textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
			pointerEvents: 'none',
			userSelect: 'none',
			display: 'none',
			zIndex: '6',
		});
		Object.assign(this.speaker.style, { color: ACCENT, font: 'bold 15px system-ui, sans-serif', marginBottom: '6px' });
		Object.assign(this.text.style, { fontWeight: '600', whiteSpace: 'pre-wrap' });
		Object.assign(this.hint.style, {
			position: 'absolute',
			right: '16px',
			bottom: '8px',
			font: 'bold 13px system-ui, sans-serif',
			color: ACCENT,
		});
		this.hint.textContent = 'ЛКМ ▶';
		this.root.append(this.speaker, this.text, this.hint);
		document.body.appendChild(this.root);
	}

	get active(): boolean {
		return this.dialogue !== null;
	}

	/** delay — через сколько секунд показать первую реплику (например, когда кинорамка доедет до места). */
	start(dialogue: Dialogue, delay = 0): void {
		this.dialogue = dialogue;
		this.lineIndex = 0;
		this.shown = 0;
		this.glitchShown = false;
		this.pause = 0;
		this.held = 0;
		this.delay = delay;
		this.root.style.display = delay > 0 ? 'none' : 'flex';
		this._render();
	}

	/** ЛКМ: если реплика ещё печатается — допечатать сразу (кроме noSkip); иначе — следующая реплика или конец разговора. */
	advance(): void {
		const dialogue = this.dialogue;
		if (!dialogue || this.delay > 0) return;
		const { text, noSkip } = dialogue.lines[this.lineIndex];
		if (this.shown < text.length) {
			if (noSkip) return;
			this.shown = text.length;
			this._revealGlitch();
			this._render();
			return;
		}
		this.lineIndex++;
		this.shown = 0;
		this.glitchShown = false;
		this.pause = 0;
		this.held = 0;
		if (this.lineIndex >= dialogue.lines.length) {
			this.dialogue = null;
			this.root.style.display = 'none';
			dialogue.onEnd?.();
			this.onEnd?.(dialogue.endSound);
			return;
		}
		this._render();
	}

	update(dt: number): void {
		if (!this.dialogue) return;
		if (this.delay > 0) {
			this.delay -= dt;
			if (this.delay > 0) return;
			this.root.style.display = 'flex';
		}
		this.time += dt;
		const line = this.dialogue.lines[this.lineIndex];
		if (this.shown < line.text.length) {
			if (this.pause > 0) {
				this.pause -= dt;
			} else {
				const before = Math.floor(this.shown);
				this.shown = Math.min(line.text.length, this.shown + dt * CHARS_PER_SECOND);
				const after = Math.floor(this.shown);
				for (let i = before; i < after; i++) {
					const char = line.text[i];
					// Писк — на каждую вторую букву, чтобы голос не трещал; после знаков препинания — пауза.
					if (/[\p{L}\d]/u.test(char) && i % 2 === 0) this.onBlip?.(line.voice);
					if (/[.,!?…—]/.test(char)) {
						this.pause = PUNCTUATION_PAUSE;
						this.shown = i + 1;
						break;
					}
				}
			}
		}
		if (this.shown >= line.text.length) {
			this._revealGlitch();
			// Реплика катсцены: повисела допечатанной — закрывается сама.
			if (line.autoClose !== undefined) {
				this.held += dt;
				if (this.held >= line.autoClose) {
					this.advance();
					return;
				}
			}
		}
		this._render();
	}

	/** Текст допечатан — хвост-глитч (если есть) появляется разом, один раз. */
	private _revealGlitch(): void {
		const line = this.dialogue?.lines[this.lineIndex];
		if (!line?.glitch || this.glitchShown) return;
		this.glitchShown = true;
		this.onGlitch?.();
	}

	private _render(): void {
		if (!this.dialogue) return;
		const line = this.dialogue.lines[this.lineIndex];
		if (this.speaker.textContent !== line.speaker) this.speaker.textContent = line.speaker;
		const visible = line.text.slice(0, Math.floor(this.shown)) + (this.glitchShown ? (line.glitch ?? '') : '');
		if (this.text.textContent !== visible) this.text.textContent = visible;
		const done = this.shown >= line.text.length;
		// У реплик, которые закрываются сами, «ЛКМ ▶» не показываем.
		this.hint.style.display = line.autoClose !== undefined ? 'none' : '';
		this.hint.style.opacity = done && Math.floor(this.time * 2.5) % 2 === 0 ? '1' : '0.35';
	}
}
