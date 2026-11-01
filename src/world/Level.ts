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
	/** Наклон взгляда (вниз — меньше нуля); по умолчанию прямо. */
	pitch?: number;
}

/** Заливка при переходе: цвет и длительности (нарастает, держится, сходит), с; что не задано — по умолчанию. */
export interface Transition {
	color?: string;
	fadeIn?: number;
	hold?: number;
	fadeOut?: number;
}

/** Что игра даёт уровням: задачи, разговоры, переходы (сами уровни о HUD и рендере не знают). */
export interface LevelHost {
	setObjective(text: string | null): void;
	startDialogue(dialogue: Dialogue): void;
	/** Перейти на уровень под заливкой (transition — её цвет и длительности); spawn — куда встать (по умолчанию — его точка старта). */
	goTo(level: Level, spawn?: SpawnPoint, transition?: Transition): void;
	/** Конец игры: экран уходит в чёрное насовсем, на нём — «Конец». */
	endGame(): void;
	/** Клик ЛКМ в этом кадре (вне разговора) — true один раз за нажатие. */
	consumeClick(): boolean;
}

/** Сидим на месте: глаза на высоте eyeY, взгляд поворачивается только в пределах (рад) от направления точки старта. */
export interface Seat {
	eyeY: number;
	yawRange: number;
	pitchMin: number;
	pitchMax: number;
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
	/** Сидим (мышь крутит взгляд в пределах); нет — ходим. */
	readonly seat?: Seat;
	/** Насыщенность картинки сейчас (0 — чёрно-белая, 1 — обычная); нет — обычная. */
	saturation?(): number;
	/** Уровень сам ставит глаза и взгляд каждый кадр (сцена от первого лица без управления взглядом). */
	cameraPose?(current: { yaw: number; pitch: number }): { position: THREE.Vector3; yaw: number; pitch: number } | null;
	/** Яркость картинки (1 — обычная, меньше — тусклее); нет — обычная. */
	brightness?(): number;
	/** Радиальное размытие по краям кадра 0..1 (скорость); нет — без него. */
	motionBlur?(): number;
	/** Подсказка внизу экрана, когда рядом нет точки для E; null — нет. */
	hint?(): string | null;
	/** Картинка плывёт (0..1); нет — не плывёт. */
	wave?(): number;
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
