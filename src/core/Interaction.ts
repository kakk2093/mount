import type * as THREE from 'three';

/** Короткие звуки действий: их играет Game (через Sfx), сами уровни о звуке не знают. */
export type InteractionSound = 'click' | 'bang';

/** Имя героя в окне диалога. */
export const PLAYER_NAME = 'Я';

/** Чьим голосом «говорит» реплика — от этого зависит писк при печати текста (высота — VOICE_PITCH в Game). */
export type Voice = 'player' | 'npc' | 'low' | 'high';

export interface DialogueLine {
	speaker: string;
	text: string;
	voice: Voice;
	/** Хвост реплики, который после напечатанного text появляется разом — со сбоем картинки и звука. */
	glitch?: string;
	/** Не допечатывать по ЛКМ: реплику можно только дождаться. */
	noSkip?: boolean;
	/** Закрывается сама: через столько секунд после того, как допечатана (ЛКМ не нужна; для катсцен). */
	autoClose?: number;
}

/** Разговор: реплики по очереди, onEnd — когда игрок закрыл последнюю. */
export interface Dialogue {
	lines: DialogueLine[];
	onEnd?: () => void;
	/** Звук после разговора. */
	endSound?: InteractionSound;
}

/** Куда сесть: точка на полу, куда смотреть и высота глаз сидя. */
export interface Seat {
	x: number;
	z: number;
	yaw: number;
	eyeY: number;
}

/**
 * Интерактивная точка уровня: рядом с ней (ближе reach по XZ) и примерно глядя на неё — подсказка «E — text»;
 * по E — run или разговор dialogue. Без run и dialogue text показывается просто подсказкой (действие пока недоступно).
 */
export interface Interactable {
	position: THREE.Vector3;
	/** С какого расстояния доступно, м. */
	reach: number;
	text: string;
	run?: () => void;
	dialogue?: Dialogue | (() => Dialogue);
	sound?: InteractionSound;
	/** false — точку сейчас не показывать (например, разговор уже был). */
	enabled?: () => boolean;
}
