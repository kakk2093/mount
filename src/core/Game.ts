import * as THREE from 'three';
import { Input } from './Input.js';
import { PlayerController } from '../player/PlayerController.js';
import { Footsteps } from '../audio/Footsteps.js';
import { Sfx } from '../audio/Sfx.js';
import { PostProcess } from '../render/PostProcess.js';
import { PLAYER_NAME, type Dialogue, type Interactable, type InteractionSound, type Voice } from './Interaction.js';
import { DialogueBox } from '../ui/DialogueBox.js';
import { Letterbox, LETTERBOX_SLIDE_TIME } from '../ui/Letterbox.js';
import { ObjectiveHud } from '../ui/ObjectiveHud.js';
import { TargetMarker } from '../ui/TargetMarker.js';
import { ProgressBar } from '../ui/ProgressBar.js';
import type { Level, SpawnPoint } from '../world/Level.js';
import { TestLevel } from '../world/TestLevel.js';

/** Во сколько раз буфер рендера меньше экрана — размер «пикселя». */
const PIXEL_SIZE = 4;
/** Сколько не доходить до границы уровня, м. */
const BOUNDS_MARGIN = 0.4;
/** Насколько точно надо смотреть на интерактивную точку (косинус угла между взглядом по XZ и направлением на неё). */
const FACING_DOT = 0.5;
/** Ближе этого точка доступна, куда бы ни смотрели, м. */
const ALWAYS_REACH = 0.8;
/** Заливка экрана при переходе: скрывает смену места. */
const FLASH_IN = 0.35;
const FLASH_HOLD = 0.3;
const FLASH_OUT = 1.4;
const FLASH_COLOR = '#111111';
/** Высота «голоса» при печати реплик, Гц. */
const VOICE_PITCH: Record<Voice, number> = { player: 170, npc: 260, low: 120, high: 330 };
/** Сколько длится сбой картинки и звука на глитч-хвосте реплики, с. */
const GLITCH_TIME = 0.4;
/** Мысли героя на старте — когда сошла заливка. */
const INTRO: Dialogue = {
	lines: [
		{ speaker: PLAYER_NAME, voice: 'player', text: 'Холодно.' },
		{ speaker: PLAYER_NAME, voice: 'player', text: 'Там, у костра, кто-то есть.' },
	],
};

/**
 * Катсцена: вызывается каждый кадр вместо управления игроком, пока возвращает true. Ставит камеру сама
 * (player.setPose / lookToward); мышь и подсказки на это время отключены.
 */
export type Cutscene = (dt: number, time: number) => boolean;

/** Композиция: рендерер, цикл, ресайз, уровни, диалоги, HUD. Содержимое мест — в классах уровней (world/). */
export class Game {
	private readonly renderer = new THREE.WebGLRenderer({ antialias: false });
	readonly camera = new THREE.PerspectiveCamera(75, 1, 0.1, 200);
	readonly post = new PostProcess(this.renderer);
	private readonly timer = new THREE.Timer();
	readonly input: Input;
	readonly footsteps = new Footsteps();
	readonly sfx = new Sfx();
	private readonly dialogue = new DialogueBox();
	readonly letterbox = new Letterbox();
	private readonly objectiveHud = new ObjectiveHud();
	private readonly targetMarker = new TargetMarker();
	/** Полоса прогресса для действий «держи, пока не заполнится» — уровни заполняют её сами. */
	readonly progressBar = new ProgressBar();
	/** Текущая задача (плашка в углу и маркер к цели); null — задачи нет. */
	private objective: string | null = null;
	private cutscene: Cutscene | null = null;
	private cutsceneTime = 0;
	/** Время с начала сбоя картинки; null — сбоя нет. */
	private glitchTime: number | null = null;
	private readonly hint = document.getElementById('hint')!;
	private readonly prompt = document.getElementById('prompt')!;
	private readonly crosshair = document.getElementById('crosshair')!;
	private readonly flash = document.getElementById('flash')!;
	/** Время с начала перехода; null — перехода нет. */
	private flashTime: number | null = null;
	/** Что сделать, пока экран залит (смена места); вызывается один раз за переход. */
	private onFlashCovered: (() => void) | null = null;
	/** Был «Старт»: до него экран залит, игрок стоит. */
	private started = false;
	/** Мысли героя на старте ещё не звучали: начнутся, как только сойдёт заливка. */
	private introPending = true;
	level: Level;
	readonly player: PlayerController;

	constructor() {
		this.renderer.setPixelRatio(1);
		this.renderer.shadowMap.enabled = true;
		document.body.appendChild(this.renderer.domElement);

		this.input = new Input(this.renderer.domElement);
		this.level = new TestLevel({
			setObjective: (text) => this.setObjective(text),
			startDialogue: (dialogue) => this.startDialogue(dialogue),
		});
		this.player = new PlayerController(this.camera, this.input, this.level, this.level.colliders);
		this.player.onStep = (loud) => this.footsteps.play(loud);
		this._enter(this.level);

		// Игра начинается с залитого экрана (см. index.html); поверх — стартовый экран. По «Старт» он убирается,
		// мышь захватывается, заливка расходится.
		const startScreen = document.getElementById('start')!;
		document.getElementById('start-button')!.addEventListener(
			'click',
			() => {
				startScreen.remove();
				this.input.lockPointer();
				this.started = true;
				this.flash.style.background = FLASH_COLOR;
				this.flashTime = FLASH_IN;
				this.hint.textContent = 'Кликни, чтобы осмотреться';
			},
			{ once: true }
		);

		this.dialogue.onBlip = (voice) => this.sfx.voice(VOICE_PITCH[voice]);
		// В катсцене рамка остаётся и после реплик — уберёт её сама катсцена (letterbox.hide).
		this.dialogue.onEnd = (sound) => {
			if (!this.cutscene) this.letterbox.hide();
			if (sound) this.playSound(sound);
		};
		this.dialogue.onGlitch = () => {
			this.glitchTime = 0;
			this.sfx.glitch(GLITCH_TIME);
		};

		window.addEventListener('resize', () => this._resize());
		this._resize();
	}

	start(): void {
		this.timer.connect(document);
		this.renderer.setAnimationLoop((time) => this._frame(time));
	}

	/** null — задачи нет, плашка и маркер скрыты. */
	setObjective(text: string | null): void {
		this.objective = text;
	}

	/** Разговор всегда в кинорамке: полосы выезжают, реплики — на нижней, когда полосы доехали (если уже стоят —
	 * сразу). Уезжают полосы по окончании (в катсцене — нет). */
	startDialogue(dialogue: Dialogue): void {
		const delay = this.letterbox.visible ? 0 : LETTERBOX_SLIDE_TIME;
		this.letterbox.show();
		this.dialogue.start(dialogue, delay);
	}

	/** Катсцена: кинорамка и управление у неё, пока она возвращает true (см. Cutscene). */
	playCutscene(cutscene: Cutscene): void {
		this.cutscene = cutscene;
		this.cutsceneTime = 0;
		this.letterbox.show();
	}

	/** Перейти на другой уровень под заливкой; spawn — куда встать (по умолчанию — его точка старта). */
	goTo(level: Level, spawn?: SpawnPoint): void {
		this.beginTransition(() => {
			this.level.leave?.();
			this.level = level;
			this._enter(level, spawn);
		});
	}

	/** Мягкая заливка на весь экран: в середине хода — onCovered (смена места), к концу — исчезает. */
	beginTransition(onCovered: () => void, color = FLASH_COLOR): void {
		this.flash.style.background = color;
		this.onFlashCovered = onCovered;
		this.flashTime = 0;
	}

	playSound(sound: InteractionSound): void {
		if (sound === 'click') this.sfx.click();
		else this.sfx.bang();
	}

	private _enter(level: Level, spawn: SpawnPoint = level.spawnPoint): void {
		this.player.ground = level;
		this.player.colliders = level.colliders;
		this.player.rooted = false;
		this.player.spawn(spawn.x, spawn.z, spawn.yaw);
		this.objective = null;
		level.enter?.();
	}

	private _frame(time: number): void {
		this.timer.update(time);
		const dt = Math.min(this.timer.getDelta(), 0.1);

		if (this.started) {
			// Во время разговора (и пока сходит стартовая заливка) стоим на месте; движение мыши сбрасываем,
			// чтобы после не было рывка взгляда.
			if (this.cutscene) this._updateCutscene(dt);
			else if (this.dialogue.active || this.introPending) this.input.consumeMouseDelta();
			else this.player.update(dt);
			if (!this.cutscene) this._clamp();
			this.dialogue.update(dt);
			this.level.update?.(dt, this.camera.position);
			this._updateFlash(dt);
			if (this.introPending && this.flashTime === null) {
				this.introPending = false;
				this.startDialogue(INTRO);
			}
			this._updateInteraction();
			this._updateGlitch(dt);
		}

		this.objectiveHud.set(this.objective);
		const showMarker = this.objective && !this.dialogue.active && !this.cutscene;
		this.targetMarker.update(this.camera, showMarker ? (this.level.objectiveTarget?.() ?? null) : null);
		const locked = this.input.isPointerLocked;
		// До «Старт» подсказки нет — там свой экран.
		this.hint.style.display = !this.started || locked ? 'none' : 'flex';
		this.crosshair.style.display = locked && !this.dialogue.active && !this.cutscene ? 'block' : 'none';
		this.input.endFrame();
		this.post.render(this.level.scene, this.camera);
	}

	private _updateCutscene(dt: number): void {
		this.input.consumeMouseDelta();
		this.cutsceneTime += dt;
		if (this.cutscene!(dt, this.cutsceneTime)) return;
		this.cutscene = null;
		if (!this.dialogue.active) this.letterbox.hide();
	}

	/** Подсказка «E — …» для ближайшей доступной точки уровня, на которую примерно смотрим; по E — её действие. */
	private _updateInteraction(): void {
		if (this.dialogue.active) {
			this.prompt.style.display = 'none';
			// Реплики листаются левой кнопкой мыши (noSkip / autoClose DialogueBox учитывает сам).
			if (this.input.consumePress('Mouse0')) this.dialogue.advance();
			return;
		}
		const target = this.cutscene || this.flashTime !== null || this.introPending ? null : this._pickInteractable();
		if (!target) {
			this.prompt.style.display = 'none';
			return;
		}
		const actionable = !!(target.run || target.dialogue);
		this.prompt.textContent = actionable ? `E — ${target.text}` : target.text;
		this.prompt.style.display = 'block';
		if (!actionable || !this.input.consumePress('KeyE')) return;
		if (target.sound) this.playSound(target.sound);
		if (target.dialogue) this.startDialogue(typeof target.dialogue === 'function' ? target.dialogue() : target.dialogue);
		else target.run!();
	}

	private _pickInteractable(): Interactable | null {
		const cam = this.camera.position;
		const forward = this.player.forward;
		let best: Interactable | null = null;
		let bestDist = Infinity;
		for (const it of this.level.interactables) {
			if (it.enabled && !it.enabled()) continue;
			const dx = it.position.x - cam.x;
			const dz = it.position.z - cam.z;
			const dist = Math.hypot(dx, dz);
			if (dist > it.reach || dist >= bestDist) continue;
			if (dist > ALWAYS_REACH && (dx * forward.x + dz * forward.z) / dist < FACING_DOT) continue;
			best = it;
			bestDist = dist;
		}
		return best;
	}

	/** Сбой картинки на глитч-хвосте реплики: полосы и блоки скачут каждый кадр, к концу — слабее. */
	private _updateGlitch(dt: number): void {
		if (this.glitchTime === null) return;
		this.glitchTime += dt;
		if (this.glitchTime >= GLITCH_TIME) {
			this.glitchTime = null;
			this.post.setGlitch(0, 0);
			return;
		}
		const fade = 1 - (this.glitchTime / GLITCH_TIME) * 0.5;
		this.post.setGlitch((Math.random() < 0.75 ? 1 : 0.15) * fade, Math.random() * 100);
	}

	private _updateFlash(dt: number): void {
		if (this.flashTime === null) return;
		this.flashTime += dt;
		const t = this.flashTime;

		if (this.onFlashCovered && t >= FLASH_IN) {
			this.onFlashCovered();
			this.onFlashCovered = null;
		}

		let opacity: number;
		if (t < FLASH_IN) {
			opacity = t / FLASH_IN;
		} else if (t < FLASH_IN + FLASH_HOLD) {
			opacity = 1;
		} else if (t < FLASH_IN + FLASH_HOLD + FLASH_OUT) {
			// Выход — плавный: сначала гаснет медленно, в середине быстрее, к концу снова мягко.
			const k = (t - FLASH_IN - FLASH_HOLD) / FLASH_OUT;
			opacity = 1 - k * k * (3 - 2 * k);
		} else {
			opacity = 0;
			this.flashTime = null;
		}
		this.flash.style.opacity = String(opacity);
	}

	/** Клэмп по границам уровня — простой прямоугольник. */
	private _clamp(): void {
		const pos = this.camera.position;
		const { bounds } = this.level;
		pos.x = THREE.MathUtils.clamp(pos.x, bounds.minX + BOUNDS_MARGIN, bounds.maxX - BOUNDS_MARGIN);
		pos.z = THREE.MathUtils.clamp(pos.z, bounds.minZ + BOUNDS_MARGIN, bounds.maxZ - BOUNDS_MARGIN);
	}

	private _resize(): void {
		// Рисуем в уменьшенном буфере; канвас растягивается на экран CSS (image-rendering: pixelated) — крупные пиксели.
		const width = Math.ceil(window.innerWidth / PIXEL_SIZE);
		const height = Math.ceil(window.innerHeight / PIXEL_SIZE);
		this.renderer.setSize(width, height, false);
		this.post.setSize(width, height);
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();
	}
}
