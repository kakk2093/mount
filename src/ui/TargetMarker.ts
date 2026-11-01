import * as THREE from 'three';

/** Отступ стрелки от края экрана, пикс. */
const EDGE_MARGIN = 48;
const COLOR = '#ffd54a';

/**
 * Маркер цели в HUD (как в game2): цель в кадре — «пин» ▼ над ней с расстоянием;
 * вне кадра или за спиной — стрелка у края экрана, повёрнутая в сторону цели. Виден всегда, сквозь стены.
 */
export class TargetMarker {
	private readonly root = document.createElement('div');
	private readonly arrow = document.createElement('div');
	private readonly pin = document.createElement('div');
	private readonly label = document.createElement('div');
	private readonly view = new THREE.Vector3();
	private readonly ndc = new THREE.Vector3();

	constructor() {
		Object.assign(this.root.style, {
			position: 'fixed',
			left: '0',
			top: '0',
			display: 'none',
			flexDirection: 'column',
			alignItems: 'center',
			gap: '2px',
			color: COLOR,
			font: 'bold 18px system-ui, sans-serif',
			textShadow: '0 1px 4px rgba(0, 0, 0, 0.9)',
			pointerEvents: 'none',
			userSelect: 'none',
			zIndex: '5',
		});
		this.arrow.innerHTML =
			`<svg width="48" height="48" viewBox="0 0 56 56"><polygon points="28,4 50,50 28,38 6,50" fill="${COLOR}" ` +
			'stroke="#000" stroke-opacity="0.75" stroke-width="3" stroke-linejoin="round"/></svg>';
		this.pin.textContent = '▼';
		Object.assign(this.pin.style, { fontSize: '28px', lineHeight: '1' });
		Object.assign(this.label.style, { padding: '2px 9px', background: 'rgba(0, 0, 0, 0.55)', borderRadius: '999px', whiteSpace: 'nowrap' });
		this.root.append(this.arrow, this.pin, this.label);
		document.body.appendChild(this.root);
	}

	/** point — цель в мире (null — скрыть). Расстояние в подписи — прямое от камеры, с высотой: цель бывает глубоко внизу. */
	update(camera: THREE.Camera, point: THREE.Vector3 | null): void {
		if (!point) {
			this.root.style.display = 'none';
			return;
		}
		camera.updateMatrixWorld();
		const cam = camera.position;
		const distance = cam.distanceTo(point);
		this.label.textContent = `${Math.max(1, Math.round(distance))} м`;
		const view = this.view.copy(point).applyMatrix4(camera.matrixWorldInverse);
		const ndc = this.ndc.copy(point).project(camera);
		const w = window.innerWidth;
		const h = window.innerHeight;

		let x: number;
		let y: number;
		let angle: number | null = null;
		if (view.z < 0 && Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.8) {
			x = ((ndc.x + 1) / 2) * w;
			y = ((1 - ndc.y) / 2) * h;
		} else {
			// Вне кадра: направление на цель в плоскости экрана, точка — на рамке с отступом.
			let dx = view.x;
			let dy = view.y;
			const len = Math.hypot(dx, dy);
			if (len < 1e-4) {
				dx = 0;
				dy = -1;
			} else {
				dx /= len;
				dy /= len;
			}
			const k = 1 / Math.max(Math.abs(dx) / (w / 2 - EDGE_MARGIN), Math.abs(dy) / (h / 2 - EDGE_MARGIN));
			x = w / 2 + dx * k;
			y = h / 2 - dy * k;
			angle = Math.atan2(dx, dy);
		}

		this.root.style.display = 'flex';
		// Пин — остриём в точку цели: весь столбик (пин + подпись) стоит над ней.
		this.root.style.transform = angle === null ? `translate(${x}px, ${y}px) translate(-50%, -100%)` : `translate(${x}px, ${y}px) translate(-50%, -50%)`;
		this.arrow.style.display = angle === null ? 'none' : 'block';
		this.pin.style.display = angle === null ? 'block' : 'none';
		this.label.style.order = angle === null ? '-1' : '0';
		if (angle !== null) this.arrow.style.transform = `rotate(${angle}rad)`;
	}
}
