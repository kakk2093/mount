const ACCENT = '#ffd21a';

/** Полоса заполнения посередине экрана, чуть выше центра. */
export class ProgressBar {
	private readonly root = document.createElement('div');
	private readonly fill = document.createElement('div');
	private readonly caption = document.createElement('div');

	constructor() {
		Object.assign(this.root.style, {
			position: 'fixed',
			left: '50%',
			top: '38%',
			width: '320px',
			height: '18px',
			transform: 'translate(-50%, -50%)',
			padding: '3px',
			background: 'rgba(22, 8, 10, 0.85)',
			border: `2px solid ${ACCENT}`,
			borderRadius: '6px',
			boxShadow: '0 4px 18px rgba(0, 0, 0, 0.5)',
			pointerEvents: 'none',
			display: 'none',
			zIndex: '5',
		});
		Object.assign(this.fill.style, { height: '100%', width: '0%', background: ACCENT, borderRadius: '3px' });
		// Подпись над полосой — по центру, не влияет на её размер.
		Object.assign(this.caption.style, {
			position: 'absolute',
			left: '50%',
			bottom: 'calc(100% + 10px)',
			transform: 'translateX(-50%)',
			color: '#f1e8d6',
			font: 'bold 20px system-ui, sans-serif',
			textShadow: '0 1px 4px rgba(0, 0, 0, 0.9)',
			whiteSpace: 'nowrap',
			display: 'none',
		});
		this.root.append(this.fill, this.caption);
		document.body.appendChild(this.root);
	}

	/** Текст над полосой; null — без подписи. */
	setCaption(text: string | null): void {
		this.caption.style.display = text ? 'block' : 'none';
		if (text) this.caption.textContent = text;
	}

	/** value — от 0 до 1; null — полоса скрыта. */
	set(value: number | null): void {
		this.root.style.display = value === null ? 'none' : 'block';
		if (value !== null) this.fill.style.width = `${Math.min(1, Math.max(0, value)) * 100}%`;
	}
}
