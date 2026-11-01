import * as THREE from 'three';
import { Colliders } from '../physics/Colliders.js';
import type { DialogueLine, Interactable } from '../core/Interaction.js';
import type { Bounds, Level, LevelHost } from './Level.js';
import type { MusicMood } from '../audio/Music.js';

/** Через сколько секунд после прихода начинается разговор (пока сходит заливка). */
const TALK_DELAY = 1.8;

export interface MemoryConfig {
	/** Реплики воспоминания; когда закрыта последняя — обратно к костру. */
	lines: DialogueLine[];
	/** Цвет «воздуха» (фон и туман) — у каждого воспоминания свой. */
	color: string;
	onDone: () => void;
}

/**
 * Сцена-воспоминание (заглушка): тёмная комната в цветном тумане, лампа, стол, силуэт. Начинается разговор,
 * по его концу — onDone (обратно к костру). Настоящие воспоминания — отдельные классы на этом же каркасе.
 */
export class MemoryLevel implements Level {
	readonly scene = new THREE.Scene();
	readonly bounds: Bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
	readonly spawnPoint = { x: 0, z: 3, yaw: 0 };
	readonly colliders = new Colliders();
	readonly interactables: Interactable[] = [];
	private time = 0;
	private talked = false;

	constructor(
		private readonly host: LevelHost,
		private readonly config: MemoryConfig
	) {
		const air = new THREE.Color(config.color);
		this.scene.background = air;
		this.scene.fog = new THREE.Fog(air, 3, 12);
		this.scene.add(new THREE.HemisphereLight('#ffe8c8', '#2a1c14', 0.6));
		const lamp = new THREE.PointLight('#ffcf8a', 12, 10, 1.5);
		lamp.position.set(0, 2.2, -1.5);
		lamp.castShadow = true;
		this.scene.add(lamp);

		const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat('#3a2e26'));
		floor.rotation.x = -Math.PI / 2;
		floor.receiveShadow = true;
		const table = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.75, 0.8), mat('#5b3f2b'));
		table.position.set(0, 0.375, -1.5);
		const figure = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), mat('#1a1a1e'));
		figure.position.set(0.9, 0.75, -2.3);
		for (const m of [table, figure]) {
			m.castShadow = true;
			m.receiveShadow = true;
		}
		this.scene.add(floor, table, figure);
		this.colliders.addBox(0, -1.5, 1.4, 0.8);
		this.colliders.add(0.9, -2.3, 0.4);
	}

	/** В воспоминании музыка — тихо, издалека. */
	music(): MusicMood {
		return { volume: 0.35, brightness: 0.25 };
	}

	getHeightAt(): number {
		return 0;
	}

	enter(): void {
		this.time = 0;
		this.talked = false;
	}

	update(dt: number): void {
		this.time += dt;
		if (this.talked || this.time < TALK_DELAY) return;
		this.talked = true;
		this.host.startDialogue({ lines: this.config.lines, onEnd: this.config.onDone });
	}
}
