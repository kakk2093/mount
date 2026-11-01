/** Высота каждой полосы, доля экрана (в нижней печатаются реплики). */
export const LETTERBOX_HEIGHT = '16vh';
/** Сколько полосы выезжают из-за края и уезжают обратно, с. */
export const LETTERBOX_SLIDE_TIME = 0.5;

/**
 * Кинорамка: чёрные полосы сверху и снизу экрана на время каждого диалога.
 * show() — выезжают из-за краёв, hide() — верхняя уезжает вверх, нижняя вниз. Реплики печатаются прямо
 * на нижней полосе (см. DialogueBox).
 */
export class Letterbox {
	private readonly top = document.createElement('div');
	private readonly bottom = document.createElement('div');
	private visibleState = false;

	constructor(visible = false) {
		for (const [bar, edge] of [
			[this.top, 'top'],
			[this.bottom, 'bottom'],
		] as const) {
			Object.assign(bar.style, {
				position: 'fixed',
				left: '0',
				right: '0',
				[edge]: '0',
				height: LETTERBOX_HEIGHT,
				background: '#000',
				pointerEvents: 'none',
				zIndex: '5',
				transition: `transform ${LETTERBOX_SLIDE_TIME}s ease-in-out`,
			});
			document.body.appendChild(bar);
		}
		this._place(visible);
	}

	/** Полосы на месте или выезжают. */
	get visible(): boolean {
		return this.visibleState;
	}

	show(): void {
		this._place(true);
	}

	hide(): void {
		this._place(false);
	}

	private _place(visible: boolean): void {
		this.visibleState = visible;
		this.top.style.transform = visible ? 'translateY(0)' : 'translateY(-100%)';
		this.bottom.style.transform = visible ? 'translateY(0)' : 'translateY(100%)';
	}
}
