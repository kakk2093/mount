/** Состояние ввода: клавиатура и движение мыши (при pointer lock). */
export class Input {
	private readonly keys = new Set<string>();
	private readonly pressed = new Set<string>();
	private mouseDX = 0;
	private mouseDY = 0;

	constructor(private readonly domElement: HTMLElement) {
		window.addEventListener('keydown', (e) => {
			this.keys.add(e.code);
			if (!e.repeat) this.pressed.add(e.code);
		});
		window.addEventListener('keyup', (e) => this.keys.delete(e.code));
		// ЛКМ можно и держать: isDown('Mouse0').
		window.addEventListener('mouseup', (e) => {
			if (e.button === 0) this.keys.delete('Mouse0');
		});
		window.addEventListener('blur', () => {
			this.keys.clear();
			this.pressed.clear();
		});
		document.addEventListener('mousemove', (e) => {
			if (this.isPointerLocked) {
				this.mouseDX += e.movementX;
				this.mouseDY += e.movementY;
			}
		});
		domElement.addEventListener('click', () => this.lockPointer());
		domElement.addEventListener('mousedown', (e) => {
			if (e.button === 0 && this.isPointerLocked) {
				this.pressed.add('Mouse0');
				this.keys.add('Mouse0');
			}
		});
	}

	/** Захватить мышь; работает только внутри жеста пользователя (клик, клавиша). */
	lockPointer(): void {
		void Promise.resolve(this.domElement.requestPointerLock()).catch(() => {});
	}

	get isPointerLocked(): boolean {
		return document.pointerLockElement === this.domElement;
	}

	isDown(code: string): boolean {
		return this.keys.has(code);
	}

	/** true один раз за каждое нажатие клавиши (без автоповтора). */
	consumePress(code: string): boolean {
		return this.pressed.delete(code);
	}

	/** Конец кадра: нажатия, которые в этом кадре никто не забрал, пропадают — иначе старое E (нажатое, когда
	 * действовать было не на что) сработало бы само, как только появится доступное действие. */
	endFrame(): void {
		this.pressed.clear();
	}

	/** Забрать накопленное смещение мыши и обнулить его. */
	consumeMouseDelta(): { x: number; y: number } {
		const delta = { x: this.mouseDX, y: this.mouseDY };
		this.mouseDX = 0;
		this.mouseDY = 0;
		return delta;
	}
}
