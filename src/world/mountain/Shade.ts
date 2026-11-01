import * as THREE from 'three';
import { buildCharacter, CHARACTER_HEAD_Y, CHARACTER_TOP_Y, type CharacterParts } from '../characters/Character.js';

/** Где голова (точка разговора и маркера), м. */
export const SHADE_HEAD_Y = CHARACTER_HEAD_Y;
/** Струйки с макушки: сколько, как высоко уходят, м, и как быстро (доля пути в секунду). */
const WISPS = 6;
const WISP_HEIGHT = 1.4;
const WISP_SPEED = 0.18;
/** Цвет струек дыма. */
const DARK = '#07080d';

/**
 * Тень у костра: персонаж того же вида, что и все (см. buildCharacter), но весь тёмный — свет на него
 * не действует, видны только бледные глаза-точки. Дышит (тело чуть раздувается, голова покачивается),
 * с макушки тают струйки дыма.
 */
export class Shade {
	readonly group: THREE.Group;
	private readonly parts: CharacterParts;
	private readonly wisps: { mesh: THREE.Mesh; life: number; angle: number }[] = [];

	constructor(x: number, y: number, z: number) {
		this.parts = buildCharacter({
			coat: '#0b0c12',
			pants: '#08090e',
			boots: '#050609',
			skin: '#090a10',
			hat: '#0e1018',
			scarf: '#111320',
			eyes: '#d9cfb4',
			unlit: true,
		});
		this.group = this.parts.group;
		this.group.position.set(x, y, z);
		const wispGeo = new THREE.IcosahedronGeometry(1, 1);
		for (let i = 0; i < WISPS; i++) {
			const mesh = new THREE.Mesh(wispGeo, new THREE.MeshBasicMaterial({ color: DARK, transparent: true, opacity: 0, depthWrite: false }));
			this.wisps.push({ mesh, life: i / WISPS, angle: Math.random() * Math.PI * 2 });
			this.group.add(mesh);
		}
	}

	update(time: number, dt: number): void {
		// Дыхание: тело чуть раздувается, голова кивает и покачивается.
		const breath = Math.sin(time * 1.2);
		this.parts.body.scale.set(1 + breath * 0.02, 1, 1 + breath * 0.02);
		this.parts.head.position.y = CHARACTER_HEAD_Y + breath * 0.01;
		this.parts.head.rotation.z = Math.sin(time * 0.5) * 0.04;
		// Струйки: отрываются от макушки, поднимаются, разрастаются и тают; долетев — снова с макушки.
		for (const w of this.wisps) {
			w.life += dt * WISP_SPEED;
			if (w.life >= 1) {
				w.life -= 1;
				w.angle = Math.random() * Math.PI * 2;
			}
			const l = w.life;
			const drift = l * 0.3;
			w.mesh.position.set(Math.cos(w.angle) * drift + Math.sin(time + w.angle) * 0.05 * l, CHARACTER_TOP_Y + l * WISP_HEIGHT, Math.sin(w.angle) * drift);
			w.mesh.scale.setScalar(0.08 + l * 0.22);
			(w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - l) * Math.min(1, l * 6);
		}
	}
}
