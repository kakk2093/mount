import type * as THREE from 'three';
import type { Colliders } from '../physics/Colliders.js';
import type { Dialogue, Interactable } from '../core/Interaction.js';
import type { Ground } from '../player/PlayerController.js';
import type { MusicMood } from '../audio/Music.js';
import type { Surface } from '../audio/Footsteps.js';

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

/** Что игра даёт уровням: задачи, разговоры, переходы (сами уровни о HUD и рендере не знают). */
export interface LevelHost {
	setObjective(text: string | null): void;
	startDialogue(dialogue: Dialogue): void;
	/** Перейти на уровень под заливкой; spawn — куда встать (по умолчанию — его точка старта). */
	goTo(level: Level, spawn?: SpawnPoint): void;
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
	/** Своя палитра пост-обработки ('#rrggbb'); нет — обычная постеризация. Воспоминания могут взять другую. */
	readonly palette?: string[];
	/** Насколько сильно палитра (0..1, по умолчанию 1). */
	readonly paletteStrength?: number;
	/** По чему звучат шаги; нет — по твёрдому. */
	readonly surface?: Surface;
	/** Самый крутой склон, на который можно ступить (тангенс); нет — без ограничения. */
	readonly maxSlope?: number;
	/** Что можно сделать по E; Game показывает подсказку для ближайшей доступной точки. */
	readonly interactables: Interactable[];
	/** Игрок пришёл на уровень (экран ещё залит). */
	enter?(): void;
	/** Игрок ушёл с уровня. */
	leave?(): void;
	/** Каждый кадр; player — глаза игрока. */
	update?(dt: number, player: THREE.Vector3): void;
	/** Настроение музыки сейчас (Game зовёт каждый кадр); нет — обычное. */
	music?(): MusicMood;
	/** Куда вести маркер задачи; null — маркера нет. */
	objectiveTarget?(): THREE.Vector3 | null;
}
