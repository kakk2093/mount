const ACCENT = '#e3b25a';

/** Текущая задача в левом верхнем углу: подпись «ЗАДАЧА» и текст шага. Новая задача коротко подсвечивается. */
export class ObjectiveHud {
	private readonly root = document.createElement('div');
	private readonly label = document.createElement('div');
	private readonly text = document.createElement('div');
	private current: string | null = null;

	constructor() {
		Object.assign(this.root.style, {
			position: 'fixed',
			left: '24px',
			top: '24px',
			padding: '14px 26px 16px 20px',
			background: 'rgba(22, 8, 10, 0.85)',
			border: `2px solid ${ACCENT}`,
			borderLeftWidth: '6px',
			borderRadius: '6px',
			boxShadow: '0 4px 18px rgba(0, 0, 0, 0.5)',
			transformOrigin: 'left top',
			color: '#f1e8d6',
			textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
			pointerEvents: 'none',
			userSelect: 'none',
			display: 'none',
			zIndex: '5',
		});
		Object.assign(this.label.style, { color: ACCENT, font: 'bold 15px system-ui, sans-serif', letterSpacing: '0.12em' });
		Object.assign(this.text.style, { font: 'bold 30px system-ui, sans-serif', marginTop: '4px' });
		this.label.textContent = 'ЗАДАЧА';
		this.root.append(this.label, this.text);
		document.body.appendChild(this.root);
	}

	/** null — задачи нет, плашка скрыта. */
	set(text: string | null): void {
		if (text === this.current) return;
		this.current = text;
		this.root.style.display = text ? 'block' : 'none';
		if (!text) return;
		this.text.textContent = text;
		// Новая задача: плашка вспыхивает и чуть «выпрыгивает», потом возвращается к обычному виду.
		this.root.style.transition = 'none';
		this.root.style.backgroundColor = 'rgba(140, 95, 35, 0.95)';
		this.root.style.transform = 'scale(1.12)';
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				this.root.style.transition = 'background-color 0.9s, transform 0.45s cubic-bezier(0.3, 1.6, 0.5, 1)';
				this.root.style.backgroundColor = 'rgba(22, 8, 10, 0.85)';
				this.root.style.transform = 'scale(1)';
			})
		);
	}
}
