import type * as THREE from 'three';
import type { Colliders } from '../physics/Colliders.js';
import type { Interactable } from '../core/Interaction.js';
import type { Ground } from '../player/PlayerController.js';

export interface Bounds {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

export interface SpawnPoint {
	x: number;
	z: number;
	yaw: number;
}

/**
 * Уровень (место): своя сцена, земля, коллайдеры и интерактивные точки. В пространстве уровни не связаны —
 * Game переключается между ними под заливкой (goTo).
 */
export interface Level extends Ground {
	readonly scene: THREE.Scene;
	/** За эти границы (минус отступ) игрок не выходит. */
	readonly bounds: Bounds;
	readonly spawnPoint: SpawnPoint;
	readonly colliders: Colliders;
	/** Что можно сделать по E; Game показывает подсказку для ближайшей доступной точки. */
	readonly interactables: Interactable[];
	/** Игрок пришёл на уровень (экран ещё залит). */
	enter?(): void;
	/** Игрок ушёл с уровня. */
	leave?(): void;
	/** Каждый кадр; player — глаза игрока. */
	update?(dt: number, player: THREE.Vector3): void;
	/** Куда вести маркер задачи; null — маркера нет. */
	objectiveTarget?(): THREE.Vector3 | null;
}
